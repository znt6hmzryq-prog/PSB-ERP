import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, agentQuery, tenantAdminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { expenses, expenseCategories, chartOfAccounts, journalEntries, journalEntryLines, ledgerEntries, notifications } from "@db/schema";
import { eq, desc, sql, and, isNull } from "drizzle-orm";
import { auditLog } from "./lib/audit";

function ensureExpenseTenant(ctx: any, label = "") {
  const tid = ctx.user?.tenantId;
  console.log(`[Expense router] ${label} tenantId:`, tid);
  if (tid == null) {
    console.log("[Expense router] missing tenantId", ctx.user);
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context missing" });
  }
  return tid as number;
}

async function getOrCreateExpenseAccount(
  db: import("./queries/connection").DbOrTx,
  categoryName: string,
  tenantId: number,
) {
  // Try to find existing expense account by name
  const existing = await db.query.chartOfAccounts.findFirst({
    where: and(
      eq(chartOfAccounts.name, categoryName),
      eq(chartOfAccounts.type, "expense"),
      eq(chartOfAccounts.tenantId, tenantId),
    ),
  });
  if (existing) return existing;

  // Find next available code in 5xxx range
  const existingExpenses = await db
    .select({ code: chartOfAccounts.code })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.tenantId, tenantId), eq(chartOfAccounts.type, "expense")));

  const codes = existingExpenses.map(e => Number(e.code)).filter(c => !isNaN(c) && c >= 5000 && c < 6000);
  const nextCode = codes.length > 0 ? Math.max(...codes) + 1 : 5001;

  const result = await db.insert(chartOfAccounts).values({
    tenantId,
    code: nextCode.toString(),
    name: categoryName,
    type: "expense",
    currentBalance: "0.00",
    status: "active",
    currency: "USD",
  });
  const id = Number(result[0].insertId);
  return { id, code: nextCode.toString(), name: categoryName, type: "expense" as const, currentBalance: "0.00" };
}

async function postExpenseAccounting(
  db: import("./queries/connection").DbOrTx,
  expense: typeof expenses.$inferSelect,
  tenantId: number,
  userId: number,
) {
  // Prevent duplicate posting
  const existingJournal = await db.query.journalEntries.findFirst({
    where: and(
      eq(journalEntries.referenceType, "expense"),
      eq(journalEntries.referenceId, expense.id),
      eq(journalEntries.tenantId, tenantId),
    ),
  });
  if (existingJournal) return { skipped: true, reason: "Already posted" };

  // Get category name
  const category = await db.query.expenseCategories.findFirst({
    where: and(eq(expenseCategories.id, expense.categoryId || 0), eq(expenseCategories.tenantId, tenantId)),
  });
  const categoryName = category?.name || "General Expense";

  // Get or create expense account
  const expenseAccount = await getOrCreateExpenseAccount(db, categoryName, tenantId);

  // Get cash account (1000)
  const cashAccount = await db.query.chartOfAccounts.findFirst({
    where: and(eq(chartOfAccounts.code, "1000"), eq(chartOfAccounts.tenantId, tenantId)),
  });
  if (!cashAccount) {
    return { skipped: true, reason: "Cash account not found" };
  }

  const amount = Number(expense.amount);

  // Create journal entry
  const journalResult = await db.insert(journalEntries).values({
    tenantId,
    entryNumber: `JE-EXP-${Date.now()}`,
    date: new Date(),
    description: `Expense: ${expense.title}`,
    referenceType: "expense",
    referenceId: expense.id,
    totalDebit: amount.toFixed(2),
    totalCredit: amount.toFixed(2),
    status: "posted",
    postedBy: userId,
    postedAt: new Date(),
  });
  const journalId = Number(journalResult[0].insertId ?? 0);

  if (journalId > 0) {
    await db.insert(journalEntryLines).values([
      {
        journalEntryId: journalId,
        accountId: expenseAccount.id,
        description: expense.title,
        debit: amount.toFixed(2),
        credit: "0.00",
      },
      {
        journalEntryId: journalId,
        accountId: cashAccount.id,
        description: "Cash/Bank payment",
        debit: "0.00",
        credit: amount.toFixed(2),
      },
    ]);

    // Create ledger entries
    for (const line of [
      { accountId: expenseAccount.id, debit: amount.toFixed(2), credit: "0.00", description: expense.title },
      { accountId: cashAccount.id, debit: "0.00", credit: amount.toFixed(2), description: "Cash/Bank payment" },
    ]) {
      const account = await db.query.chartOfAccounts.findFirst({
        where: and(eq(chartOfAccounts.id, line.accountId), eq(chartOfAccounts.tenantId, tenantId)),
      });
      const currentBalance = Number(account?.currentBalance ?? 0);
      const newBalance = currentBalance + Number(line.debit) - Number(line.credit);
      await db.insert(ledgerEntries).values({
        tenantId,
        journalEntryId: journalId,
        accountId: line.accountId,
        date: new Date(),
        description: line.description,
        debit: line.debit,
        credit: line.credit,
        balance: newBalance.toFixed(2),
      });
      await db.update(chartOfAccounts).set({ currentBalance: newBalance.toFixed(2) }).where(
        and(eq(chartOfAccounts.id, line.accountId), eq(chartOfAccounts.tenantId, tenantId)),
      );
    }
  }

  return { success: true, journalId };
}

export const expenseRouter = createRouter({
  list: authedQuery
    .input(z.object({
      status: z.string().optional(),
      categoryId: z.number().optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureExpenseTenant(ctx, "list");
      const conditions = [eq(expenses.tenantId, tenantId), isNull(expenses.deletedAt)];
      if (input?.status) conditions.push(eq(expenses.status, input.status as "pending" | "approved" | "rejected" | "reimbursed"));
      if (input?.categoryId) conditions.push(eq(expenses.categoryId, input.categoryId));
      if (input?.search) {
        conditions.push(sql`${expenses.title} LIKE ${`%${input.search}%`}`);
      }
      const where = conditions.length > 1 ? and(...conditions) : conditions[0];

      const items = await db.query.expenses.findMany({
        where,
        limit: input?.limit ?? 20,
        offset: ((input?.page ?? 1) - 1) * (input?.limit ?? 20),
        orderBy: [desc(expenses.createdAt)],
        with: { category: true },
      });

      const countResult = await db.select({ count: sql<number>`count(*)` }).from(expenses).where(where);
      return { items, total: countResult[0]?.count ?? 0 };
    }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureExpenseTenant(ctx, "get");
      console.log("[Expense query] get input:", input);
      return db.query.expenses.findFirst({
        where: and(eq(expenses.id, input.id), eq(expenses.tenantId, tenantId)),
        with: { category: true },
      });
    }),

  create: agentQuery
    .input(z.object({
      categoryId: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      amount: z.string().refine((value) => !isNaN(Number(value)) && Number(value) >= 0, {
        message: "Amount must be a valid non-negative number",
      }),
      expenseDate: z.string().refine((value) => !isNaN(new Date(value).getTime()), {
        message: "Valid expense date is required",
      }),
      paymentMethod: z.enum(["cash", "card", "bank_transfer", "cheque", "wallet", "other"]).default("cash"),
      vendor: z.string().optional(),
      receiptNumber: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureExpenseTenant(ctx, "create");
      console.log("[Expense create] input:", input);
      const result = await db.insert(expenses).values({
        tenantId,
        categoryId: input.categoryId,
        title: input.title,
        description: input.description,
        amount: input.amount,
        expenseDate: new Date(input.expenseDate),
        paymentMethod: input.paymentMethod,
        vendor: input.vendor,
        receiptNumber: input.receiptNumber,
        notes: input.notes,
        status: "pending",
        submittedBy: ctx.user!.id,
      });
      await auditLog({
        ctx,
        action: "create",
        entityType: "expense",
        entityId: Number(result[0].insertId),
        newValues: { title: input.title, amount: input.amount, status: "pending" },
      });

      // Notify admins of new expense
      try {
        await db.insert(notifications).values({
          tenantId: ctx.user!.tenantId as number,
          userId: ctx.user!.id,
          title: "New Expense Submitted",
          message: `Expense "${input.title}" ($${input.amount}) is awaiting approval.`,
          type: "info",
          category: "expense",
          referenceType: "expense",
          referenceId: Number(result[0].insertId),
        });
      } catch { /* non-critical */ }

      return { id: Number(result[0].insertId) };
    }),

  updateStatus: tenantAdminQuery
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "approved", "rejected", "reimbursed"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const existing = await db.query.expenses.findFirst({
        where: and(eq(expenses.id, input.id), eq(expenses.tenantId, tenantId)),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found" });
      }

      // Concurrency protection: prevent double-approval
      if (input.status === "approved" && existing.status === "approved") {
        throw new TRPCError({ code: "CONFLICT", message: "Expense already approved" });
      }

      await db.update(expenses).set({ status: input.status, approvedBy: ctx.user!.id }).where(
        and(eq(expenses.id, input.id), eq(expenses.tenantId, tenantId)),
      );

      // Auto-post accounting when approved — inside transaction
      if (input.status === "approved" && existing.status !== "approved") {
        await db.transaction(async (tx) => {
          await postExpenseAccounting(tx, existing, tenantId, ctx.user!.id);
        });
      }

      await auditLog({
        ctx,
        action: input.status === "approved" ? "approve" : input.status === "rejected" ? "reject" : "update_status",
        entityType: "expense",
        entityId: input.id,
        oldValues: { status: existing.status },
        newValues: { status: input.status },
      });

      // Notify on approval/rejection
      if (["approved", "rejected"].includes(input.status)) {
        try {
          await db.insert(notifications).values({
            tenantId,
            userId: existing.submittedBy ?? ctx.user!.id,
            title: `Expense ${input.status === "approved" ? "Approved" : "Rejected"}`,
            message: `Expense "${existing.title}" has been ${input.status}.`,
            type: input.status === "approved" ? "success" : "warning",
            category: "expense",
            referenceType: "expense",
            referenceId: input.id,
          });
        } catch { /* non-critical */ }
      }

      return { success: true };
    }),

  categories: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.expenseCategories.findMany({
      where: eq(expenseCategories.tenantId, ctx.user!.tenantId as number),
      orderBy: [expenseCategories.name],
    });
  }),

  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;
    const statusCounts = await db
      .select({ status: expenses.status, count: sql<number>`count(*)`, total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(expenses)
      .where(eq(expenses.tenantId, tenantId))
      .groupBy(expenses.status);

    const monthly = await db
      .select({
        month: sql<string>`DATE_FORMAT(expense_date, '%Y-%m')`,
        total: sql<number>`COALESCE(SUM(amount), 0)`,
      })
      .from(expenses)
      .where(eq(expenses.tenantId, tenantId))
      .groupBy(sql`DATE_FORMAT(expense_date, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(expense_date, '%Y-%m')`);

    return { statusCounts, monthly };
  }),

  delete: tenantAdminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(expenses).set({
        deletedAt: new Date(),
        deletedBy: ctx.user!.id,
      }).where(and(eq(expenses.id, input.id), eq(expenses.tenantId, ctx.user!.tenantId as number)));
      return { success: true };
    }),
});
