/**
 * Atomic Document Numbering Service
 *
 * Uses DB transactions with SELECT ... FOR UPDATE to guarantee
 * unique, sequential numbers per tenant/prefix/year.
 *
 * Race-condition safe: concurrent requests block on row/gap locks
 * and receive sequential numbers without duplicates.
 */

import { eq, and } from "drizzle-orm";
import { documentSequences } from "@db/schema";
import type { DbOrTx } from "../queries/connection";

export type NumberPrefix =
  | "MZR"   // deposits
  | "SUP"   // suppliers
  | "BILL"  // bills (AP)
  | "SP"    // supplier payments
  | "INV"   // invoices
  | "EXP"   // expenses
  | "TCK"   // tickets
  | "REG";  // registration tokens

const PREFIX_PAD: Record<NumberPrefix, number> = {
  MZR: 6,
  SUP: 4,
  BILL: 5,
  SP: 5,
  INV: 5,
  EXP: 5,
  TCK: 5,
  REG: 6,
};

/**
 * Atomically increments the sequence counter inside a transaction.
 * Returns the *new* sequence number (1-based).
 *
 * Call this inside an existing transaction (tx) or pass the db instance.
 * When called outside a transaction, you should wrap the caller in one
 * for true atomicity with the document creation.
 */
export async function nextSequence(
  db: DbOrTx,
  tenantId: number,
  prefix: NumberPrefix,
  year = new Date().getFullYear()
): Promise<number> {
  const existing = await db
    .select({ lastNumber: documentSequences.lastNumber })
    .from(documentSequences)
    .where(
      and(
        eq(documentSequences.tenantId, tenantId),
        eq(documentSequences.prefix, prefix),
        eq(documentSequences.year, year)
      )
    )
    .for("update");

  if (existing.length === 0) {
    await db.insert(documentSequences).values({
      tenantId,
      prefix,
      year,
      lastNumber: 1,
    });
    return 1;
  }

  const next = existing[0].lastNumber + 1;
  await db
    .update(documentSequences)
    .set({ lastNumber: next })
    .where(
      and(
        eq(documentSequences.tenantId, tenantId),
        eq(documentSequences.prefix, prefix),
        eq(documentSequences.year, year)
      )
    );

  return next;
}

/**
 * Generates a formatted business code: PREFIX-YEAR-######
 */
export async function nextNumber(
  db: DbOrTx,
  tenantId: number,
  prefix: NumberPrefix,
  year = new Date().getFullYear()
): Promise<string> {
  const seq = await nextSequence(db, tenantId, prefix, year);
  const pad = PREFIX_PAD[prefix] ?? 5;
  return `${prefix}-${year}-${seq.toString().padStart(pad, "0")}`;
}
