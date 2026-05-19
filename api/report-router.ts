import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  tickets, customers, suppliers, bills, expenses, ledgerEntries,
  chartOfAccounts, journalEntries, journalEntryLines, wallets, walletTransactions,
} from "@db/schema";
import { eq, desc, sql, and, inArray } from "drizzle-orm";

export const reportRouter = createRouter({
  // ─── REVENUE BY CUSTOMER ───────────────────────────────────────────────────
  revenueByCustomer: authedQuery
    .input(z.object({ fromDate: z.string().optional(), toDate: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const conditions = [eq(tickets.tenantId, tenantId), eq(tickets.status, "confirmed")];
      if (input?.fromDate) conditions.push(sql`${tickets.createdAt} >= ${input.fromDate}`);
      if (input?.toDate) conditions.push(sql`${tickets.createdAt} <= ${input.toDate + " 23:59:59"}`);

      const result = await db.select({
        customerId: tickets.customerId,
        customerName: sql<string>`CONCAT(${customers.firstName}, ' ', ${customers.lastName})`,
        totalTickets: sql<number>`count(*)`,
        totalRevenue: sql<number>`COALESCE(SUM(${tickets.totalAmount}), 0)`,
        totalCommission: sql<number>`COALESCE(SUM(${tickets.commissionAmount}), 0)`,
      })
        .from(tickets)
        .leftJoin(customers, eq(tickets.customerId, customers.id))
        .where(and(...conditions))
        .groupBy(tickets.customerId, customers.firstName, customers.lastName)
        .orderBy(desc(sql`SUM(${tickets.totalAmount})`));

      return result;
    }),

  // ─── EXPENSE BREAKDOWN ─────────────────────────────────────────────────────
  expenseBreakdown: authedQuery
    .input(z.object({ fromDate: z.string().optional(), toDate: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const conditions = [eq(expenses.tenantId, tenantId), eq(expenses.status, "approved")];
      if (input?.fromDate) conditions.push(sql`${expenses.expenseDate} >= ${input.fromDate}`);
      if (input?.toDate) conditions.push(sql`${expenses.expenseDate} <= ${input.toDate}`);

      const result = await db.select({
        vendor: expenses.vendor,
        total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
        count: sql<number>`count(*)`,
      })
        .from(expenses)
        .where(and(...conditions))
        .groupBy(expenses.vendor)
        .orderBy(desc(sql`SUM(${expenses.amount})`));

      return result;
    }),

  // ─── SUPPLIER PAYABLES SUMMARY ─────────────────────────────────────────────
  supplierPayables: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;

    const result = await db.select({
      supplierId: bills.supplierId,
      supplierName: suppliers.companyName,
      totalBills: sql<number>`count(*)`,
      totalAmount: sql<number>`COALESCE(SUM(${bills.totalAmount}), 0)`,
      totalPaid: sql<number>`COALESCE(SUM(${bills.amountPaid}), 0)`,
      balanceDue: sql<number>`COALESCE(SUM(${bills.balanceDue}), 0)`,
    })
      .from(bills)
      .leftJoin(suppliers, eq(bills.supplierId, suppliers.id))
      .where(and(eq(bills.tenantId, tenantId), eq(bills.status, "open")))
      .groupBy(bills.supplierId, suppliers.companyName)
      .orderBy(desc(sql`SUM(${bills.balanceDue})`));

    return result;
  }),

  // ─── CASH FLOW ─────────────────────────────────────────────────────────────
  cashFlow: authedQuery
    .input(z.object({ fromDate: z.string(), toDate: z.string(), granularity: z.enum(["daily", "weekly", "monthly"]).default("monthly") }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const cashAccount = await db.query.chartOfAccounts.findFirst({
        where: and(eq(chartOfAccounts.code, "1000"), eq(chartOfAccounts.tenantId, tenantId)),
      });
      if (!cashAccount) return { items: [], granularity: input.granularity };

      const dateFormat = input.granularity === "daily" ? "%Y-%m-%d"
        : input.granularity === "weekly" ? "%Y-%u"
        : "%Y-%m";

      const result = await db.select({
        period: sql<string>`DATE_FORMAT(${ledgerEntries.date}, ${dateFormat})`,
        inflows: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerEntries.credit} > 0 THEN ${ledgerEntries.credit} ELSE 0 END), 0)`,
        outflows: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerEntries.debit} > 0 THEN ${ledgerEntries.debit} ELSE 0 END), 0)`,
        netFlow: sql<number>`COALESCE(SUM(${ledgerEntries.credit} - ${ledgerEntries.debit}), 0)`,
      })
        .from(ledgerEntries)
        .where(and(
          eq(ledgerEntries.tenantId, tenantId),
          eq(ledgerEntries.accountId, Number(cashAccount.id)),
          sql`${ledgerEntries.date} >= ${input.fromDate}`,
          sql`${ledgerEntries.date} <= ${input.toDate}`,
        ))
        .groupBy(sql`DATE_FORMAT(${ledgerEntries.date}, ${dateFormat})`)
        .orderBy(sql`DATE_FORMAT(${ledgerEntries.date}, ${dateFormat})`);

      return { items: result, granularity: input.granularity };
    }),

  // ─── GENERAL LEDGER DETAIL ─────────────────────────────────────────────────
  generalLedger: authedQuery
    .input(z.object({
      accountId: z.number().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const conditions = [eq(ledgerEntries.tenantId, tenantId)];

      if (input?.accountId) conditions.push(eq(ledgerEntries.accountId, input.accountId));
      if (input?.fromDate) conditions.push(sql`${ledgerEntries.date} >= ${input.fromDate}`);
      if (input?.toDate) conditions.push(sql`${ledgerEntries.date} <= ${input.toDate}`);

      const where = and(...conditions);

      const items = await db.select().from(ledgerEntries)
        .where(where)
        .limit(input?.limit ?? 50)
        .offset(((input?.page ?? 1) - 1) * (input?.limit ?? 50))
        .orderBy(ledgerEntries.date, ledgerEntries.id);

      const accountIds = [...new Set(items.map(i => i.accountId).filter(Boolean))];
      const accounts = accountIds.length > 0
        ? await db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.tenantId, tenantId), inArray(chartOfAccounts.id, accountIds)))
        : [];
      const accountMap = new Map(accounts.map(a => [a.id, a]));

      const journalIds = [...new Set(items.map(i => i.journalEntryId).filter((id): id is number => id !== null))];
      const journals = journalIds.length > 0
        ? await db.select({ id: journalEntries.id, entryNumber: journalEntries.entryNumber }).from(journalEntries).where(inArray(journalEntries.id, journalIds))
        : [];
      const journalMap = new Map(journals.map(j => [j.id, j]));

      const totalResult = await db.select({ count: sql<number>`count(*)` }).from(ledgerEntries).where(where);

      return {
        items: items.map(i => ({
          ...i,
          account: accountMap.get(i.accountId) || null,
          journalEntry: i.journalEntryId ? journalMap.get(i.journalEntryId) || null : null,
        })),
        total: totalResult[0]?.count ?? 0,
      };
    }),

  // ─── TRIAL BALANCE EXPORT ──────────────────────────────────────────────────
  trialBalance: authedQuery
    .input(z.object({ asOfDate: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const accounts = await db.select().from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.tenantId, tenantId), eq(chartOfAccounts.status, "active")))
        .orderBy(chartOfAccounts.code);

      const result = await Promise.all(accounts.map(async (account) => {
        const conditions = [eq(ledgerEntries.accountId, Number(account.id)), eq(ledgerEntries.tenantId, tenantId)];
        if (input?.asOfDate) conditions.push(sql`${ledgerEntries.date} <= ${input.asOfDate}`);

        const totals = await db.select({
          debit: sql<number>`COALESCE(SUM(${ledgerEntries.debit}), 0)`,
          credit: sql<number>`COALESCE(SUM(${ledgerEntries.credit}), 0)`,
        }).from(ledgerEntries).where(and(...conditions));

        return {
          ...account,
          totalDebit: Number(totals[0]?.debit ?? 0),
          totalCredit: Number(totals[0]?.credit ?? 0),
          netBalance: Number(totals[0]?.debit ?? 0) - Number(totals[0]?.credit ?? 0),
        };
      }));

      return result;
    }),

  // ─── WALLET ACTIVITY ───────────────────────────────────────────────────────
  walletActivity: authedQuery
    .input(z.object({
      walletId: z.number().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const conditions = [eq(walletTransactions.tenantId, tenantId)];

      if (input?.walletId) conditions.push(eq(walletTransactions.walletId, input.walletId));
      if (input?.fromDate) conditions.push(sql`${walletTransactions.createdAt} >= ${input.fromDate}`);
      if (input?.toDate) conditions.push(sql`${walletTransactions.createdAt} <= ${input.toDate + " 23:59:59"}`);

      const items = await db.select().from(walletTransactions)
        .where(and(...conditions))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(200);

      const walletIds = [...new Set(items.map(t => t.walletId).filter(Boolean))];
      const walletsData = walletIds.length > 0
        ? await db.select().from(wallets).where(and(eq(wallets.tenantId, tenantId), inArray(wallets.id, walletIds)))
        : [];
      const walletMap = new Map(walletsData.map(w => [w.id, w]));

      return items.map(t => ({ ...t, wallet: walletMap.get(t.walletId) || null }));
    }),

  // ─── JOURNAL ENTRY DETAIL ──────────────────────────────────────────────────
  journalDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const entry = await db.select().from(journalEntries)
        .where(and(eq(journalEntries.id, input.id), eq(journalEntries.tenantId, tenantId)))
        .limit(1);
      if (!entry[0]) return null;

      const lines = await db.select().from(journalEntryLines)
        .where(eq(journalEntryLines.journalEntryId, input.id));

      const accountIds = [...new Set(lines.map(l => l.accountId).filter(Boolean))];
      const accounts = accountIds.length > 0
        ? await db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.tenantId, tenantId), inArray(chartOfAccounts.id, accountIds)))
        : [];
      const accountMap = new Map(accounts.map(a => [a.id, a]));

      return {
        entry: entry[0],
        lines: lines.map(l => ({ ...l, account: accountMap.get(l.accountId) || null })),
      };
    }),
});
