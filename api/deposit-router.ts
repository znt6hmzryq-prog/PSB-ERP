import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  deposits,
  wallets,
  walletTransactions,
  chartOfAccounts,
  journalEntries,
  journalEntryLines,
  ledgerEntries,
  customers,
  customerTransactions,
  notifications,
  paymentLocations,
  users,
} from "@db/schema";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { auditLog } from "./lib/audit";
import { nextNumber } from "./lib/numbering";

async function postDepositAccounting(
  db: import("./queries/connection").DbOrTx,
  deposit: typeof deposits.$inferSelect,
  tenantId: number,
  _userId: number,
) {
  const amount = Number(deposit.amount);

  // Get accounts
  const cashAccount = await db.query.chartOfAccounts.findFirst({
    where: and(eq(chartOfAccounts.code, "1000"), eq(chartOfAccounts.tenantId, tenantId)),
  });
  const depositAccount = await db.query.chartOfAccounts.findFirst({
    where: and(eq(chartOfAccounts.code, "2100"), eq(chartOfAccounts.tenantId, tenantId)),
  });
  if (!cashAccount || !depositAccount) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Required COA accounts missing for deposit posting" });
  }

  // Create journal entry
  const journalResult = await db.insert(journalEntries).values({
    tenantId,
    entryNumber: `JE-${Date.now()}`,
    date: new Date(),
    description: `Deposit received: ${deposit.depositCode}`,
    referenceType: "deposit",
    referenceId: deposit.id,
    status: "posted",
    totalDebit: amount.toFixed(2),
    totalCredit: amount.toFixed(2),
  });
  const journalId = Number(journalResult[0].insertId ?? 0);

  if (journalId > 0) {
    await db.insert(journalEntryLines).values([
      { journalEntryId: journalId, accountId: cashAccount.id, description: "Cash/Bank received", debit: amount.toFixed(2), credit: "0.00" },
      { journalEntryId: journalId, accountId: depositAccount.id, description: "Customer deposit liability", debit: "0.00", credit: amount.toFixed(2) },
    ]);

    for (const line of [
      { accountId: cashAccount.id, debit: amount.toFixed(2), credit: "0.00", description: "Cash/Bank received" },
      { accountId: depositAccount.id, debit: "0.00", credit: amount.toFixed(2), description: "Customer deposit liability" },
    ]) {
      const account = await db.query.chartOfAccounts.findFirst({
        where: and(eq(chartOfAccounts.id, line.accountId), eq(chartOfAccounts.tenantId, tenantId)),
      });
      const currentBal = Number(account?.currentBalance ?? 0);
      const newBal = currentBal + Number(line.debit) - Number(line.credit);
      await db.insert(ledgerEntries).values({
        tenantId,
        journalEntryId: journalId,
        accountId: line.accountId,
        date: new Date(),
        description: line.description,
        debit: line.debit,
        credit: line.credit,
        balance: newBal.toFixed(2),
      });
      await db.update(chartOfAccounts).set({ currentBalance: newBal.toFixed(2) }).where(
        and(eq(chartOfAccounts.id, line.accountId), eq(chartOfAccounts.tenantId, tenantId)),
      );
    }
  }

  return { success: true, journalId };
}

export const depositRouter = createRouter({
  list: authedQuery
    .input(z.object({
      status: z.string().optional(),
      customerId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const conditions = [eq(deposits.tenantId, tenantId)];
      // TODO: re-enable soft-delete filter after adding deleted_at column to DB
      // isNull(deposits.deletedAt)
      if (input?.status) conditions.push(eq(deposits.status, input.status as "pending" | "under_review" | "approved" | "rejected" | "expired"));
      if (input?.customerId) conditions.push(eq(deposits.customerId, input.customerId));
      const where = and(...conditions);

      const items = await db.select().from(deposits).where(where).orderBy(desc(deposits.createdAt)).limit(input?.limit ?? 20).offset(((input?.page ?? 1) - 1) * (input?.limit ?? 20));

      const customerIds = [...new Set(items.map(i => i.customerId).filter(Boolean))] as number[];
      const walletIds = [...new Set(items.map(i => i.walletId).filter(Boolean))] as number[];
      const locationIds = [...new Set(items.map(i => i.locationId).filter(Boolean))] as number[];

      const customerList = customerIds.length > 0
        ? await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), inArray(customers.id, customerIds)))
        : [];
      const walletList = walletIds.length > 0
        ? await db.select().from(wallets).where(and(eq(wallets.tenantId, tenantId), inArray(wallets.id, walletIds)))
        : [];
      const locationList = locationIds.length > 0
        ? await db.select().from(paymentLocations).where(and(eq(paymentLocations.tenantId, tenantId), inArray(paymentLocations.id, locationIds)))
        : [];

      const customerMap = new Map(customerList.map(c => [c.id, c]));
      const walletMap = new Map(walletList.map(w => [w.id, w]));
      const locationMap = new Map(locationList.map(l => [l.id, l]));

      const itemsWithRelations = items.map(i => ({
        ...i,
        customer: customerMap.get(i.customerId || 0) || null,
        wallet: walletMap.get(i.walletId) || null,
        location: locationMap.get(i.locationId || 0) || null,
      }));

      const countResult = await db.select({ count: sql<number>`count(*)` }).from(deposits).where(where);
      return { items: itemsWithRelations, total: countResult[0]?.count ?? 0 };
    }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const deposit = await db.query.deposits.findFirst({
        where: and(eq(deposits.id, input.id), eq(deposits.tenantId, tenantId)),
      });
      if (!deposit) throw new TRPCError({ code: "NOT_FOUND", message: "Deposit not found" });
      return deposit;
    }),

  create: authedQuery
    .input(z.object({
      walletId: z.number(),
      customerId: z.number().optional(),
      amount: z.string().refine((value) => !isNaN(Number(value)) && Number(value) > 0, { message: "Amount must be positive" }),
      paymentMethod: z.enum(["cash", "bank_transfer", "cheque"]),
      referenceNumber: z.string().optional(),
      locationId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const amount = Number(input.amount);

      // Validate wallet
      const wallet = await db.query.wallets.findFirst({
        where: and(eq(wallets.id, input.walletId), eq(wallets.tenantId, tenantId)),
      });
      if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });

      const depositCode = await nextNumber(db, tenantId, "MZR");

      const result = await db.insert(deposits).values({
        tenantId,
        customerId: input.customerId ?? null,
        walletId: input.walletId,
        depositCode,
        amount: amount.toFixed(2),
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        locationId: input.locationId ?? null,
        status: "pending",
        notes: input.notes,
        createdBy: ctx.user!.id,
      });

      const depositId = Number(result[0].insertId);

      await auditLog({
        ctx,
        action: "create",
        entityType: "deposit",
        entityId: depositId,
        newValues: { depositCode, amount: input.amount, paymentMethod: input.paymentMethod, status: "pending" },
      });

      // Notify admins
      try {
        await db.insert(notifications).values({
          tenantId,
          userId: ctx.user!.id,
          title: "New Deposit Request",
          message: `Deposit ${depositCode} for $${amount.toLocaleString()} is awaiting approval.`,
          type: "info",
          category: "wallet",
          referenceType: "deposit",
          referenceId: depositId,
        });
      } catch { /* non-critical */ }

      return { id: depositId, depositCode };
    }),

  updateStatus: authedQuery
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "under_review", "approved", "rejected", "expired"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const deposit = await db.query.deposits.findFirst({
        where: and(eq(deposits.id, input.id), eq(deposits.tenantId, tenantId)),
      });
      if (!deposit) throw new TRPCError({ code: "NOT_FOUND", message: "Deposit not found" });

      const oldStatus = deposit.status;
      const amount = Number(deposit.amount);

      // Concurrency protection: prevent double-approval
      if (input.status === "approved" && oldStatus === "approved") {
        throw new TRPCError({ code: "CONFLICT", message: "Deposit already approved" });
      }

      // On approval: update deposit status + credit wallet + post accounting — ALL inside one transaction
      if (input.status === "approved" && oldStatus !== "approved") {
        await db.transaction(async (tx) => {
          // Update deposit status inside transaction
          await tx.update(deposits).set({
            status: input.status,
            approvedBy: ctx.user!.id,
            approvedAt: new Date(),
            notes: input.notes ? `${deposit.notes || ""}\n${input.notes}` : deposit.notes,
          }).where(and(eq(deposits.id, input.id), eq(deposits.tenantId, tenantId)));

          const wallet = await tx.query.wallets.findFirst({
            where: and(eq(wallets.id, deposit.walletId), eq(wallets.tenantId, tenantId)),
          });
          if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });

          const newBalance = Number(wallet.balance) + amount;
          await tx.update(wallets).set({ balance: newBalance.toFixed(2) }).where(eq(wallets.id, wallet.id));

          await tx.insert(walletTransactions).values({
            walletId: wallet.id,
            tenantId,
            type: "credit",
            amount: amount.toFixed(2),
            balanceAfter: newBalance.toFixed(2),
            description: `Deposit approved: ${deposit.depositCode}`,
            referenceType: "deposit",
            referenceId: deposit.id,
            createdBy: ctx.user!.id,
          });

          // Post accounting
          await postDepositAccounting(tx, deposit, tenantId, ctx.user!.id);

          // Create customer transaction if linked
          if (deposit.customerId) {
            await tx.insert(customerTransactions).values({
              tenantId,
              customerId: deposit.customerId,
              type: "deposit",
              amount: amount.toFixed(2),
              balance: amount.toFixed(2),
              description: `Deposit ${deposit.depositCode}`,
              referenceNumber: deposit.depositCode,
              createdBy: ctx.user!.id,
            });
          }
        });
      } else {
        // Non-approval updates (rejected, expired, etc.) — update outside transaction
        await db.update(deposits).set({
          status: input.status,
          approvedBy: input.status === "approved" || input.status === "rejected" ? ctx.user!.id : deposit.approvedBy,
          approvedAt: input.status === "approved" || input.status === "rejected" ? new Date() : deposit.approvedAt,
          notes: input.notes ? `${deposit.notes || ""}\n${input.notes}` : deposit.notes,
        }).where(and(eq(deposits.id, input.id), eq(deposits.tenantId, tenantId)));
      }

      await auditLog({
        ctx,
        action: input.status === "approved" ? "approve" : input.status === "rejected" ? "reject" : "update_status",
        entityType: "deposit",
        entityId: input.id,
        oldValues: { status: oldStatus },
        newValues: { status: input.status, notes: input.notes },
      });

      // Notify creator
      try {
        await db.insert(notifications).values({
          tenantId,
          userId: deposit.createdBy ?? ctx.user!.id,
          title: `Deposit ${input.status === "approved" ? "Approved" : input.status === "rejected" ? "Rejected" : "Updated"}`,
          message: `Deposit ${deposit.depositCode} has been ${input.status}.`,
          type: input.status === "approved" ? "success" : input.status === "rejected" ? "warning" : "info",
          category: "wallet",
          referenceType: "deposit",
          referenceId: deposit.id,
        });

        // Notify finance / admin on approval
        if (input.status === "approved") {
          const financeUsers = await db.select({ id: users.id }).from(users).where(
            and(eq(users.tenantId, tenantId), inArray(users.role, ["admin", "accountant", "super_admin"]))
          );
          if (financeUsers.length > 0) {
            await db.insert(notifications).values(
              financeUsers.map((u) => ({
                tenantId,
                userId: u.id,
                title: "Deposit Approved",
                message: `Deposit ${deposit.depositCode} has been approved.`,
                type: "success" as const,
                category: "wallet" as const,
                referenceType: "deposit" as const,
                referenceId: deposit.id,
              }))
            );
          }
        }
      } catch { /* non-critical */ }

      return { success: true };
    }),

  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;
    const statusCounts = await db
      .select({ status: deposits.status, count: sql<number>`count(*)`, total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(deposits)
      .where(eq(deposits.tenantId, tenantId))
      .groupBy(deposits.status);
    return { statusCounts };
  }),
});
