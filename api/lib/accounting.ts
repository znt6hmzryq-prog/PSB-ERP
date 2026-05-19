/**
 * Centralized Accounting Posting Helper
 *
 * Provides transaction-safe journal entry → journal lines → ledger entries → COA updates.
 * All operations are designed to run inside an existing transaction.
 */

import { eq, and, sql } from "drizzle-orm";
import {
  journalEntries,
  journalEntryLines,
  ledgerEntries,
  chartOfAccounts,
} from "@db/schema";
import type { getDb } from "../queries/connection";

export type DbOrTx = ReturnType<typeof getDb>;

export interface PostingLine {
  accountId: number;
  description: string;
  debit: string;
  credit: string;
}

export interface PostJournalInput {
  tenantId: number;
  entryNumber: string;
  date: Date;
  description: string;
  referenceType: string;
  referenceId: number;
  lines: PostingLine[];
  postedBy?: number;
}

/**
 * Posts a journal entry with ledger entries and COA balance updates.
 * Must be called inside a transaction for safety.
 *
 * Returns the created journal entry ID.
 */
export async function postJournal(
  db: DbOrTx,
  input: PostJournalInput
): Promise<number> {
  const totalDebit = input.lines.reduce((sum, l) => sum + Number(l.debit), 0);
  const totalCredit = input.lines.reduce((sum, l) => sum + Number(l.credit), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`Journal entry out of balance: debit ${totalDebit} != credit ${totalCredit}`);
  }

  const jeResult = await db.insert(journalEntries).values({
    tenantId: input.tenantId,
    entryNumber: input.entryNumber,
    date: input.date,
    description: input.description,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    status: "posted",
    totalDebit: totalDebit.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
    postedBy: input.postedBy,
    postedAt: new Date(),
  });
  const journalId = Number(jeResult[0].insertId ?? 0);
  if (!journalId) throw new Error("Failed to create journal entry");

  // Insert journal lines
  await db.insert(journalEntryLines).values(
    input.lines.map((line) => ({
      journalEntryId: journalId,
      accountId: line.accountId,
      description: line.description,
      debit: line.debit,
      credit: line.credit,
    }))
  );

  // Ledger entries + COA updates
  for (const line of input.lines) {
    const ledgerAgg = await db
      .select({ balance: sql<number>`COALESCE(SUM(debit - credit), 0)` })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountId, line.accountId));

    const priorBalance = Number(ledgerAgg[0]?.balance ?? 0);
    const newBalance = priorBalance + Number(line.debit) - Number(line.credit);

    await db.insert(ledgerEntries).values({
      tenantId: input.tenantId,
      journalEntryId: journalId,
      accountId: line.accountId,
      date: input.date,
      description: line.description,
      debit: line.debit,
      credit: line.credit,
      balance: newBalance.toFixed(2),
      entryType: "transaction",
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    });

    await db
      .update(chartOfAccounts)
      .set({ currentBalance: newBalance.toFixed(2) })
      .where(
        and(
          eq(chartOfAccounts.id, line.accountId),
          eq(chartOfAccounts.tenantId, input.tenantId)
        )
      );
  }

  return journalId;
}

/**
 * Checks if a journal entry already exists for a given reference.
 * Used for idempotency / duplicate-posting prevention.
 */
export async function hasJournalForReference(
  db: DbOrTx,
  tenantId: number,
  referenceType: string,
  referenceId: number
): Promise<boolean> {
  const existing = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.tenantId, tenantId),
        eq(journalEntries.referenceType, referenceType),
        eq(journalEntries.referenceId, referenceId)
      )
    )
    .limit(1);
  return existing.length > 0;
}
