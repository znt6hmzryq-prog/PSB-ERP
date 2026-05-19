import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  bankStatements, bankStatementLines, chartOfAccounts, ledgerEntries, journalEntries,
} from "@db/schema";
import { eq, desc, sql, and, gte, lte, inArray } from "drizzle-orm";
import { auditLog } from "./lib/audit";

export const bankReconciliationRouter = createRouter({
  // ─── LIST BANK ACCOUNTS ────────────────────────────────────────────────────
  bankAccounts: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;
    return db.select().from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.tenantId, tenantId), eq(chartOfAccounts.isBankAccount, true)))
      .orderBy(chartOfAccounts.name);
  }),

  // ─── LIST STATEMENTS ───────────────────────────────────────────────────────
  statements: authedQuery
    .input(z.object({
      accountId: z.number().optional(),
      status: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const conditions = [eq(bankStatements.tenantId, tenantId)];

      if (input?.accountId) conditions.push(eq(bankStatements.accountId, input.accountId));
      if (input?.status) conditions.push(eq(bankStatements.status, input.status as any));

      const where = and(...conditions);

      const items = await db.select().from(bankStatements)
        .where(where)
        .limit(input?.limit ?? 20)
        .offset(((input?.page ?? 1) - 1) * (input?.limit ?? 20))
        .orderBy(desc(bankStatements.createdAt));

      const accountIds = [...new Set(items.map(s => s.accountId).filter(Boolean))];
      const accounts = accountIds.length > 0
        ? await db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.tenantId, tenantId), inArray(chartOfAccounts.id, accountIds)))
        : [];
      const accountMap = new Map(accounts.map(a => [a.id, a]));

      const totalResult = await db.select({ count: sql<number>`count(*)` }).from(bankStatements).where(where);

      return {
        items: items.map(s => ({ ...s, account: accountMap.get(s.accountId) || null })),
        total: totalResult[0]?.count ?? 0,
      };
    }),

  // ─── GET STATEMENT DETAIL ──────────────────────────────────────────────────
  statementDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const statement = await db.select().from(bankStatements)
        .where(and(eq(bankStatements.id, input.id), eq(bankStatements.tenantId, tenantId)))
        .limit(1);
      if (!statement[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Statement not found" });

      const account = await db.select().from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.id, statement[0].accountId), eq(chartOfAccounts.tenantId, tenantId)))
        .limit(1);

      const lines = await db.select().from(bankStatementLines)
        .where(and(eq(bankStatementLines.statementId, input.id), eq(bankStatementLines.tenantId, tenantId)))
        .orderBy(bankStatementLines.transactionDate);

      const matchedJournalIds = [...new Set(lines.map(l => l.matchedJournalEntryId).filter((x): x is number => x !== null))];
      const matchedLedgerIds = [...new Set(lines.map(l => l.matchedLedgerEntryId).filter((x): x is number => x !== null))];

      const journalEntriesData = matchedJournalIds.length > 0
        ? await db.select().from(journalEntries).where(and(eq(journalEntries.tenantId, tenantId), inArray(journalEntries.id, matchedJournalIds)))
        : [];
      const journalMap = new Map(journalEntriesData.map(j => [j.id, j]));

      const ledgerData = matchedLedgerIds.length > 0
        ? await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.tenantId, tenantId), inArray(ledgerEntries.id, matchedLedgerIds)))
        : [];
      const ledgerMap = new Map(ledgerData.map(l => [l.id, l]));

      return {
        statement: statement[0],
        account: account[0] || null,
        lines: lines.map(l => ({
          ...l,
          matchedJournalEntry: l.matchedJournalEntryId ? journalMap.get(l.matchedJournalEntryId) || null : null,
          matchedLedgerEntry: l.matchedLedgerEntryId ? ledgerMap.get(l.matchedLedgerEntryId) || null : null,
        })),
      };
    }),

  // ─── CREATE STATEMENT ──────────────────────────────────────────────────────
  createStatement: authedQuery
    .input(z.object({
      accountId: z.number(),
      statementDate: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      openingBalance: z.number().default(0),
      closingBalance: z.number().default(0),
      notes: z.string().optional(),
      lines: z.array(z.object({
        transactionDate: z.string(),
        description: z.string(),
        reference: z.string().optional(),
        debit: z.number().default(0),
        credit: z.number().default(0),
        balance: z.number().default(0),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const account = await db.select().from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.id, input.accountId), eq(chartOfAccounts.tenantId, tenantId)))
        .limit(1);
      if (!account[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Bank account not found" });

      const lineDebits = (input.lines || []).reduce((s, l) => s + l.debit, 0);
      const lineCredits = (input.lines || []).reduce((s, l) => s + l.credit, 0);

      const result = await db.insert(bankStatements).values({
        tenantId,
        accountId: input.accountId,
        statementDate: new Date(input.statementDate),
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        openingBalance: input.openingBalance.toFixed(2),
        closingBalance: input.closingBalance.toFixed(2),
        totalDebits: lineDebits.toFixed(2),
        totalCredits: lineCredits.toFixed(2),
        notes: input.notes || null,
        status: "pending",
      });

      const statementId = Number(result[0].insertId);

      if (input.lines && input.lines.length > 0) {
        for (const line of input.lines) {
          await db.insert(bankStatementLines).values({
            tenantId,
            statementId,
            transactionDate: new Date(line.transactionDate),
            description: line.description,
            reference: line.reference || null,
            debit: line.debit.toFixed(2),
            credit: line.credit.toFixed(2),
            balance: line.balance.toFixed(2),
            status: "unmatched",
          });
        }
      }

      await auditLog({ ctx, action: "bank_statement_created", entityType: "bank_statement", entityId: statementId });

      return { id: statementId };
    }),

  // ─── AUTO-MATCH LINES ──────────────────────────────────────────────────────
  autoMatch: authedQuery
    .input(z.object({ statementId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const lines = await db.select().from(bankStatementLines)
        .where(and(
          eq(bankStatementLines.statementId, input.statementId),
          eq(bankStatementLines.tenantId, tenantId),
          eq(bankStatementLines.status, "unmatched"),
        ));

      const statement = await db.select().from(bankStatements)
        .where(and(eq(bankStatements.id, input.statementId), eq(bankStatements.tenantId, tenantId)))
        .limit(1);
      if (!statement[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Statement not found" });

      // Get ledger entries for this account in the statement period
      const ledger = await db.select().from(ledgerEntries)
        .where(and(
          eq(ledgerEntries.tenantId, tenantId),
          eq(ledgerEntries.accountId, statement[0].accountId),
          gte(ledgerEntries.date, statement[0].startDate),
          lte(ledgerEntries.date, statement[0].endDate),
        ));

      let matchedCount = 0;

      for (const line of lines) {
        const lineAmount = Number(line.debit) > 0 ? Number(line.debit) : Number(line.credit);
        const isDebit = Number(line.debit) > 0;

        // Try to find matching ledger entry by amount and approximate date
        const candidates = ledger.filter(l => {
          const ledgerAmount = Number(l.debit) > 0 ? Number(l.debit) : Number(l.credit);
          const ledgerIsDebit = Number(l.debit) > 0;
          const amountMatch = Math.abs(ledgerAmount - lineAmount) < 0.01;
          const directionMatch = isDebit === ledgerIsDebit;
          const alreadyMatched = lines.some(existing =>
            existing.matchedLedgerEntryId === l.id && existing.id !== line.id
          );
          return amountMatch && directionMatch && !alreadyMatched;
        });

        if (candidates.length > 0) {
          // Pick the closest by date
          const bestMatch = candidates.sort((a, b) => {
            const da = Math.abs(new Date(a.date).getTime() - new Date(line.transactionDate).getTime());
            const db_ = Math.abs(new Date(b.date).getTime() - new Date(line.transactionDate).getTime());
            return da - db_;
          })[0];

          await db.update(bankStatementLines).set({
            matchedLedgerEntryId: bestMatch.id,
            status: "matched",
            matchConfidence: "85.00",
          }).where(eq(bankStatementLines.id, line.id));

          matchedCount++;
        }
      }

      // Update statement status
      const remainingUnmatched = await db.select({ count: sql<number>`count(*)` }).from(bankStatementLines)
        .where(and(eq(bankStatementLines.statementId, input.statementId), eq(bankStatementLines.status, "unmatched")));
      const totalLines = await db.select({ count: sql<number>`count(*)` }).from(bankStatementLines)
        .where(eq(bankStatementLines.statementId, input.statementId));

      const newStatus = remainingUnmatched[0]?.count === 0 ? "reconciled" : remainingUnmatched[0]?.count < (totalLines[0]?.count ?? 0) ? "partial" : "pending";
      await db.update(bankStatements).set({ status: newStatus }).where(eq(bankStatements.id, input.statementId));

      return { matchedCount, status: newStatus };
    }),

  // ─── MANUAL MATCH ──────────────────────────────────────────────────────────
  manualMatch: authedQuery
    .input(z.object({
      lineId: z.number(),
      ledgerEntryId: z.number().optional(),
      journalEntryId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const line = await db.select().from(bankStatementLines)
        .where(and(eq(bankStatementLines.id, input.lineId), eq(bankStatementLines.tenantId, tenantId)))
        .limit(1);
      if (!line[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Statement line not found" });

      await db.update(bankStatementLines).set({
        matchedLedgerEntryId: input.ledgerEntryId || null,
        matchedJournalEntryId: input.journalEntryId || null,
        status: (input.ledgerEntryId || input.journalEntryId) ? "matched" : "unmatched",
        matchConfidence: (input.ledgerEntryId || input.journalEntryId) ? "100.00" : "0.00",
      }).where(eq(bankStatementLines.id, input.lineId));

      // Update statement status
      const statementId = line[0].statementId;
      const remainingUnmatched = await db.select({ count: sql<number>`count(*)` }).from(bankStatementLines)
        .where(and(eq(bankStatementLines.statementId, statementId), eq(bankStatementLines.status, "unmatched")));
      const totalLines = await db.select({ count: sql<number>`count(*)` }).from(bankStatementLines)
        .where(eq(bankStatementLines.statementId, statementId));

      const newStatus = remainingUnmatched[0]?.count === 0 ? "reconciled" : remainingUnmatched[0]?.count < (totalLines[0]?.count ?? 0) ? "partial" : "pending";
      await db.update(bankStatements).set({ status: newStatus }).where(eq(bankStatements.id, statementId));

      return { success: true };
    }),

  // ─── IGNORE LINE ───────────────────────────────────────────────────────────
  ignoreLine: authedQuery
    .input(z.object({ lineId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      await db.update(bankStatementLines).set({ status: "ignored" })
        .where(and(eq(bankStatementLines.id, input.lineId), eq(bankStatementLines.tenantId, tenantId)));

      return { success: true };
    }),

  // ─── STATS ─────────────────────────────────────────────────────────────────
  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;

    const totalStatements = await db.select({ count: sql<number>`count(*)` }).from(bankStatements)
      .where(eq(bankStatements.tenantId, tenantId));
    const reconciled = await db.select({ count: sql<number>`count(*)` }).from(bankStatements)
      .where(and(eq(bankStatements.tenantId, tenantId), eq(bankStatements.status, "reconciled")));
    const partial = await db.select({ count: sql<number>`count(*)` }).from(bankStatements)
      .where(and(eq(bankStatements.tenantId, tenantId), eq(bankStatements.status, "partial")));
    const pending = await db.select({ count: sql<number>`count(*)` }).from(bankStatements)
      .where(and(eq(bankStatements.tenantId, tenantId), eq(bankStatements.status, "pending")));
    const unmatchedLines = await db.select({ count: sql<number>`count(*)` }).from(bankStatementLines)
      .where(and(eq(bankStatementLines.tenantId, tenantId), eq(bankStatementLines.status, "unmatched")));

    return {
      totalStatements: totalStatements[0]?.count ?? 0,
      reconciled: reconciled[0]?.count ?? 0,
      partial: partial[0]?.count ?? 0,
      pending: pending[0]?.count ?? 0,
      unmatchedLines: unmatchedLines[0]?.count ?? 0,
    };
  }),
});
