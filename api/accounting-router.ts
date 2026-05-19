import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, accountantQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { chartOfAccounts, journalEntries, journalEntryLines, ledgerEntries, expenses, tickets, accountingPeriods } from "@db/schema";
import { eq, desc, sql, and, inArray } from "drizzle-orm";

export const accountingRouter = createRouter({
  // ─── CHART OF ACCOUNTS ───────────────────────────────────────────────────
  accounts: authedQuery
    .input(z.object({ type: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const where = input?.type ? and(eq(chartOfAccounts.type, input.type as "asset" | "liability" | "equity" | "revenue" | "expense"), eq(chartOfAccounts.tenantId, ctx.user!.tenantId as number)) : eq(chartOfAccounts.tenantId, ctx.user!.tenantId as number);
      return db.query.chartOfAccounts.findMany({
        where,
        orderBy: [chartOfAccounts.code],
      });
    }),

  account: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const account = await db.query.chartOfAccounts.findFirst({
        where: and(eq(chartOfAccounts.id, input.id), eq(chartOfAccounts.tenantId, ctx.user!.tenantId as number)),
      });
      const ledger = await db.query.ledgerEntries.findMany({
        where: and(eq(ledgerEntries.accountId, input.id), eq(ledgerEntries.tenantId, ctx.user!.tenantId as number)),
        orderBy: [ledgerEntries.date],
      });
      return { account, ledger };
    }),

  createAccount: accountantQuery
    .input(z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
      subtype: z.string().optional(),
      description: z.string().optional(),
      isBankAccount: z.boolean().default(false),
      currency: z.string().default("USD"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const result = await db.insert(chartOfAccounts).values({
        ...input,
        tenantId: ctx.user!.tenantId as number,
        currentBalance: "0.00",
        status: "active",
      });
      return { id: Number(result[0].insertId) };
    }),

  // ─── JOURNAL ENTRIES ─────────────────────────────────────────────────────
  journalEntries: authedQuery
    .input(z.object({
      status: z.string().optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const conditions = [eq(journalEntries.tenantId, ctx.user!.tenantId as number)];
      if (input?.status) conditions.push(eq(journalEntries.status, input.status as "draft" | "posted" | "reversed"));
      if (input?.search) conditions.push(sql`${journalEntries.entryNumber} LIKE ${`%${input.search}%`}`);
      const where = and(...conditions);

      const items = await db.select().from(journalEntries).where(where).limit(input?.limit ?? 20).offset(((input?.page ?? 1) - 1) * (input?.limit ?? 20)).orderBy(desc(journalEntries.date));
      const entryIds = items.map(e => e.id) as number[];
      const lines = entryIds.length > 0
        ? await db.select().from(journalEntryLines).where(inArray(journalEntryLines.journalEntryId, entryIds))
        : [];
      const linesByEntry = new Map<number, typeof lines>();
      for (const line of lines) {
        if (!linesByEntry.has(line.journalEntryId)) linesByEntry.set(line.journalEntryId, []);
        linesByEntry.get(line.journalEntryId)!.push(line);
      }
      const itemsWithLines = items.map(e => ({ ...e, lines: linesByEntry.get(e.id) || [] }));
      const countResult = await db.select({ count: sql<string>`count(*)` }).from(journalEntries).where(where);
      return { items: itemsWithLines, total: Number(countResult[0]?.count ?? 0) };
    }),

  journalEntry: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      return db.query.journalEntries.findFirst({
        where: and(eq(journalEntries.id, input.id), eq(journalEntries.tenantId, ctx.user!.tenantId as number)),
        with: { lines: { with: { account: true } } },
      });
    }),

  createJournalEntry: accountantQuery
    .input(z.object({
      entryNumber: z.string().min(1),
      date: z.string(),
      description: z.string().min(1),
      referenceType: z.string().optional(),
      referenceId: z.number().optional(),
      notes: z.string().optional(),
      lines: z.array(z.object({
        accountId: z.number(),
        description: z.string().optional(),
        debit: z.string().refine((value) => !isNaN(Number(value)), { message: "Debit must be a valid number" }).default("0"),
        credit: z.string().refine((value) => !isNaN(Number(value)), { message: "Credit must be a valid number" }).default("0"),
      })).min(2),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!input.date || isNaN(new Date(input.date).getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Valid date is required" });
      }

      const totalDebit = input.lines.reduce((sum, l) => sum + Number(l.debit), 0);
      const totalCredit = input.lines.reduce((sum, l) => sum + Number(l.credit), 0);

      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Debits must equal credits" });
      }

      if (input.lines.some(l => l.accountId <= 0)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "All lines must have a valid account" });
      }

      const result = await db.insert(journalEntries).values({
        tenantId: ctx.user!.tenantId as number,
        entryNumber: input.entryNumber,
        date: new Date(input.date),
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
        status: "draft",
        notes: input.notes,
      });

      const journalEntryId = Number(result[0].insertId);
      await db.insert(journalEntryLines).values(
        input.lines.map((l) => ({ ...l, journalEntryId }))
      );

      return { id: journalEntryId };
    }),

  postJournalEntry: accountantQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const entry = await db.query.journalEntries.findFirst({
        where: and(eq(journalEntries.id, input.id), eq(journalEntries.tenantId, tenantId)),
        with: { lines: true },
      });

      if (!entry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Journal entry not found" });
      }

      if (entry.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Journal entry is not in draft status" });
      }

      await db.transaction(async (tx) => {
        await tx.update(journalEntries).set({ status: "posted", postedBy: ctx.user!.id, postedAt: new Date() }).where(eq(journalEntries.id, input.id));

        // Create ledger entries
        for (const line of entry.lines) {
          const account = await tx.query.chartOfAccounts.findFirst({
            where: and(eq(chartOfAccounts.id, line.accountId), eq(chartOfAccounts.tenantId, tenantId)),
          });
          const currentBalance = Number(account?.currentBalance ?? 0);
          const newBalance = currentBalance + Number(line.debit) - Number(line.credit);

          await tx.insert(ledgerEntries).values({
            tenantId,
            journalEntryId: input.id,
            accountId: line.accountId,
            date: entry.date ? new Date(entry.date) : new Date(),
            description: line.description || entry.description,
            debit: line.debit,
            credit: line.credit,
            balance: newBalance.toFixed(2),
          });

          await tx.update(chartOfAccounts)
            .set({ currentBalance: newBalance.toFixed(2) })
            .where(and(eq(chartOfAccounts.id, line.accountId), eq(chartOfAccounts.tenantId, tenantId)));
        }
      });

      return { success: true };
    }),

  // ─── LEDGER ──────────────────────────────────────────────────────────────
  ledger: authedQuery
    .input(z.object({
      accountId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const where = input?.accountId ? and(eq(ledgerEntries.accountId, input.accountId), eq(ledgerEntries.tenantId, ctx.user!.tenantId as number)) : eq(ledgerEntries.tenantId, ctx.user!.tenantId as number);

      const items = await db.select().from(ledgerEntries).where(where).limit(input?.limit ?? 50).offset(((input?.page ?? 1) - 1) * (input?.limit ?? 50)).orderBy(ledgerEntries.date);
      const accountIds = [...new Set(items.map(i => i.accountId).filter(Boolean))] as number[];
      const journalEntryIds = [...new Set(items.map(i => i.journalEntryId).filter(Boolean))] as number[];
      const accountList = accountIds.length > 0
        ? await db.select().from(chartOfAccounts).where(inArray(chartOfAccounts.id, accountIds))
        : [];
      const journalList = journalEntryIds.length > 0
        ? await db.select().from(journalEntries).where(inArray(journalEntries.id, journalEntryIds))
        : [];
      const accountMap = new Map(accountList.map(a => [a.id, a]));
      const journalMap = new Map(journalList.map(j => [j.id, j]));
      return items.map(i => ({
        ...i,
        account: accountMap.get(i.accountId) || null,
        journalEntry: i.journalEntryId ? journalMap.get(i.journalEntryId) || null : null,
      }));
    }),

  // ─── FINANCIAL STATEMENTS ────────────────────────────────────────────────
  trialBalance: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const accounts = await db.query.chartOfAccounts.findMany({
      where: eq(chartOfAccounts.tenantId, ctx.user!.tenantId as number),
      orderBy: [chartOfAccounts.code],
    });

    const ledgerData = await db
      .select({
        accountId: ledgerEntries.accountId,
        totalDebit: sql<number>`COALESCE(SUM(debit), 0)`,
        totalCredit: sql<number>`COALESCE(SUM(credit), 0)`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.tenantId, ctx.user!.tenantId as number))
      .groupBy(ledgerEntries.accountId);

    return { accounts, ledgerData };
  }),

  financialSummary: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const revenue = await db
      .select({ total: sql<number>`COALESCE(SUM(total_amount), 0)` })
      .from(tickets)
      .where(eq(tickets.tenantId, ctx.user!.tenantId as number));
    const expenseTotal = await db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(expenses)
      .where(and(eq(expenses.tenantId, ctx.user!.tenantId as number), eq(expenses.status, "approved")));
    const assets = await db
      .select({ total: sql<number>`COALESCE(SUM(current_balance), 0)` })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.tenantId, ctx.user!.tenantId as number), eq(chartOfAccounts.type, "asset")));
    const liabilities = await db
      .select({ total: sql<number>`COALESCE(SUM(current_balance), 0)` })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.tenantId, ctx.user!.tenantId as number), eq(chartOfAccounts.type, "liability")));

    return {
      revenue: Number(revenue[0]?.total ?? 0),
      expenses: Number(expenseTotal[0]?.total ?? 0),
      assets: Number(assets[0]?.total ?? 0),
      liabilities: Number(liabilities[0]?.total ?? 0),
      equity: Number(assets[0]?.total ?? 0) - Number(liabilities[0]?.total ?? 0),
    };
  }),

  profitAndLoss: authedQuery
    .input(z.object({ fromDate: z.string().optional(), toDate: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      // Get all revenue and expense accounts with their ledger balances
      const accounts = await db.select().from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.tenantId, tenantId), sql`${chartOfAccounts.type} IN ('revenue', 'expense')`))
        .orderBy(chartOfAccounts.code);

      const accountIds = accounts.map(a => a.id);
      const ledgerData = accountIds.length > 0
        ? await db
            .select({
              accountId: ledgerEntries.accountId,
              totalDebit: sql<number>`COALESCE(SUM(debit), 0)`,
              totalCredit: sql<number>`COALESCE(SUM(credit), 0)`,
            })
            .from(ledgerEntries)
            .where(and(
              eq(ledgerEntries.tenantId, tenantId),
              inArray(ledgerEntries.accountId, accountIds),
              input?.fromDate ? sql`${ledgerEntries.date} >= ${input.fromDate}` : undefined,
              input?.toDate ? sql`${ledgerEntries.date} <= ${input.toDate}` : undefined,
            ))
            .groupBy(ledgerEntries.accountId)
        : [];

      const ledgerMap = new Map(ledgerData.map(l => [l.accountId, l]));

      let totalRevenue = 0;
      let totalExpenses = 0;
      const revenueAccounts: any[] = [];
      const expenseAccounts: any[] = [];

      for (const account of accounts) {
        const ledger = ledgerMap.get(account.id);
        const debit = Number(ledger?.totalDebit ?? 0);
        const credit = Number(ledger?.totalCredit ?? 0);
        const netBalance = credit - debit; // Revenue: Cr increases, Expense: Dr increases

        if (account.type === "revenue") {
          totalRevenue += netBalance;
          revenueAccounts.push({ ...account, debit, credit, netBalance });
        } else {
          totalExpenses += debit - credit;
          expenseAccounts.push({ ...account, debit, credit, netBalance: debit - credit });
        }
      }

      return {
        revenueAccounts,
        expenseAccounts,
        totalRevenue,
        totalExpenses,
        netIncome: totalRevenue - totalExpenses,
      };
    }),

  balanceSheet: authedQuery
    .input(z.object({ asOfDate: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const accounts = await db.select().from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.tenantId, tenantId), sql`${chartOfAccounts.type} IN ('asset', 'liability', 'equity')`))
        .orderBy(chartOfAccounts.code);

      const accountIds = accounts.map(a => a.id);
      const ledgerData = accountIds.length > 0
        ? await db
            .select({
              accountId: ledgerEntries.accountId,
              totalDebit: sql<number>`COALESCE(SUM(debit), 0)`,
              totalCredit: sql<number>`COALESCE(SUM(credit), 0)`,
            })
            .from(ledgerEntries)
            .where(and(
              eq(ledgerEntries.tenantId, tenantId),
              inArray(ledgerEntries.accountId, accountIds),
              input?.asOfDate ? sql`${ledgerEntries.date} <= ${input.asOfDate}` : undefined,
            ))
            .groupBy(ledgerEntries.accountId)
        : [];

      const ledgerMap = new Map(ledgerData.map(l => [l.accountId, l]));

      let totalAssets = 0;
      let totalLiabilities = 0;
      let totalEquity = 0;
      const assets: any[] = [];
      const liabilities: any[] = [];
      const equity: any[] = [];

      for (const account of accounts) {
        const ledger = ledgerMap.get(account.id);
        const debit = Number(ledger?.totalDebit ?? 0);
        const credit = Number(ledger?.totalCredit ?? 0);
        let balance = 0;

        if (account.type === "asset") {
          balance = debit - credit;
          totalAssets += balance;
          assets.push({ ...account, debit, credit, balance });
        } else if (account.type === "liability") {
          balance = credit - debit;
          totalLiabilities += balance;
          liabilities.push({ ...account, debit, credit, balance });
        } else {
          balance = credit - debit;
          totalEquity += balance;
          equity.push({ ...account, debit, credit, balance });
        }
      }

      return {
        assets,
        liabilities,
        equity,
        totalAssets,
        totalLiabilities,
        totalEquity,
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      };
    }),

  retainedEarnings: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;

    // Get retained earnings account balance
    const reAccount = await db.query.chartOfAccounts.findFirst({
      where: and(eq(chartOfAccounts.code, "3100"), eq(chartOfAccounts.tenantId, tenantId)),
    });
    const beginningRE = Number(reAccount?.currentBalance ?? 0);

    // Calculate net income from ledger
    const revenueAccounts = await db.select({ id: chartOfAccounts.id }).from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.tenantId, tenantId), eq(chartOfAccounts.type, "revenue")));
    const expenseAccounts = await db.select({ id: chartOfAccounts.id }).from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.tenantId, tenantId), eq(chartOfAccounts.type, "expense")));

    const revIds = revenueAccounts.map(a => a.id);
    const expIds = expenseAccounts.map(a => a.id);

    const revenueTotal = revIds.length > 0
      ? await db.select({ total: sql<number>`COALESCE(SUM(credit - debit), 0)` }).from(ledgerEntries)
        .where(and(eq(ledgerEntries.tenantId, tenantId), inArray(ledgerEntries.accountId, revIds)))
      : [{ total: 0 }];
    const expenseTotal = expIds.length > 0
      ? await db.select({ total: sql<number>`COALESCE(SUM(debit - credit), 0)` }).from(ledgerEntries)
        .where(and(eq(ledgerEntries.tenantId, tenantId), inArray(ledgerEntries.accountId, expIds)))
      : [{ total: 0 }];

    const netIncome = Number(revenueTotal[0]?.total ?? 0) - Number(expenseTotal[0]?.total ?? 0);

    return {
      beginningRE,
      netIncome,
      endingRE: beginningRE + netIncome,
    };
  }),

  closingPeriod: accountantQuery
    .input(z.object({ year: z.number(), month: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      // Check if already closed
      const existing = await db.query.accountingPeriods.findFirst({
        where: and(
          eq(accountingPeriods.tenantId, tenantId),
          eq(accountingPeriods.year, input.year),
          input.month ? eq(accountingPeriods.month, input.month) : undefined,
        ),
      });

      if (existing?.status === "closed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Period is already closed" });
      }

      if (existing) {
        await db.update(accountingPeriods).set({
          status: "closed",
          closedBy: ctx.user!.id,
          closedAt: new Date(),
        }).where(eq(accountingPeriods.id, existing.id));
      } else {
        await db.insert(accountingPeriods).values({
          tenantId,
          year: input.year,
          month: input.month ?? null,
          status: "closed",
          closedBy: ctx.user!.id,
          closedAt: new Date(),
        });
      }

      return { success: true };
    }),

  deleteJournalEntry: accountantQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const entry = await db.query.journalEntries.findFirst({
        where: and(eq(journalEntries.id, input.id), eq(journalEntries.tenantId, tenantId)),
      });
      if (!entry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Journal entry not found" });
      }
      if (entry.status === "posted") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Posted journal entries cannot be deleted. Create a reversing entry instead.",
        });
      }
      await db.delete(journalEntryLines).where(eq(journalEntryLines.journalEntryId, input.id));
      await db.delete(journalEntries).where(and(eq(journalEntries.id, input.id), eq(journalEntries.tenantId, tenantId)));
      return { success: true };
    }),
});
