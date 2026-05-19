import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, tenantAdminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { customerTransactions, customers, invoices, chartOfAccounts, journalEntries, journalEntryLines, ledgerEntries, notifications } from "@db/schema";
import { eq, desc, sql, and, inArray } from "drizzle-orm";

export const receivableRouter = createRouter({
  list: authedQuery
    .input(z.object({
      customerId: z.number().optional(),
      type: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const conditions = [eq(customerTransactions.tenantId, tenantId)];
      if (input?.customerId) conditions.push(eq(customerTransactions.customerId, input.customerId));
      if (input?.type) conditions.push(eq(customerTransactions.type, input.type as "receivable" | "payment" | "deposit" | "credit" | "refund" | "adjustment"));
      const where = conditions.length > 1 ? and(...conditions) : conditions[0];

      const items = await db.select().from(customerTransactions).where(where).limit(input?.limit ?? 20).offset(((input?.page ?? 1) - 1) * (input?.limit ?? 20)).orderBy(desc(customerTransactions.createdAt));

      const customerIds = [...new Set(items.map(i => i.customerId).filter(Boolean))] as number[];
      const customerList = customerIds.length > 0
        ? await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), inArray(customers.id, customerIds)))
        : [];
      const customerMap = new Map(customerList.map(c => [c.id, c]));

      const itemsWithCustomer = items.map(i => ({
        ...i,
        customer: customerMap.get(i.customerId) || null,
      }));

      const countResult = await db.select({ count: sql<number>`count(*)` }).from(customerTransactions).where(where);
      return { items: itemsWithCustomer, total: Number(countResult[0]?.count ?? 0) };
    }),

  customerBalance: authedQuery
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const result = await db
        .select({ total: sql<number>`COALESCE(SUM(CASE WHEN type = 'receivable' THEN amount WHEN type IN ('payment','deposit','credit','refund') THEN -amount ELSE 0 END), 0)` })
        .from(customerTransactions)
        .where(and(eq(customerTransactions.tenantId, tenantId), eq(customerTransactions.customerId, input.customerId)));
      return { balance: Number(result[0]?.total ?? 0) };
    }),

  statement: authedQuery
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const transactions = await db
        .select()
        .from(customerTransactions)
        .where(and(eq(customerTransactions.tenantId, tenantId), eq(customerTransactions.customerId, input.customerId)))
        .orderBy(customerTransactions.createdAt);

      let runningBalance = 0;
      const withBalance = transactions.map((t) => {
        if (t.type === "receivable") runningBalance += Number(t.amount);
        else if (["payment", "deposit", "credit", "refund"].includes(t.type)) runningBalance -= Number(t.amount);
        return { ...t, runningBalance };
      });

      const customer = await db.query.customers.findFirst({
        where: and(eq(customers.id, input.customerId), eq(customers.tenantId, tenantId)),
      });

      return { customer, transactions: withBalance };
    }),

  aging: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;
    const now = new Date();
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    const d60 = new Date(now); d60.setDate(d60.getDate() - 60);
    const d90 = new Date(now); d90.setDate(d90.getDate() - 90);

    const receivables = await db
      .select()
      .from(customerTransactions)
      .where(and(eq(customerTransactions.tenantId, tenantId), eq(customerTransactions.type, "receivable")));

    const payments = await db
      .select()
      .from(customerTransactions)
      .where(and(
        eq(customerTransactions.tenantId, tenantId),
        eq(customerTransactions.type, "payment"),
      ));

    const paymentMap = new Map<number, number>();
    for (const p of payments) {
      if (p.invoiceId) {
        paymentMap.set(p.invoiceId, (paymentMap.get(p.invoiceId) || 0) + Number(p.amount));
      }
    }

    const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
    for (const r of receivables) {
      const paid = paymentMap.get(r.invoiceId || 0) || 0;
      const outstanding = Number(r.amount) - paid;
      if (outstanding <= 0) continue;
      const date = new Date(r.createdAt);
      if (date >= d30) buckets.current += outstanding;
      else if (date >= d60) buckets.d30 += outstanding;
      else if (date >= d90) buckets.d60 += outstanding;
      else buckets.d90 += outstanding;
    }

    return buckets;
  }),

  createPayment: tenantAdminQuery
    .input(z.object({
      customerId: z.number(),
      invoiceId: z.number().optional(),
      amount: z.string().min(1),
      paymentMethod: z.string().default("cash"),
      referenceNumber: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const amount = Number(input.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Amount must be positive" });
      }

      // Verify customer (read-only, outside tx)
      const customer = await db.query.customers.findFirst({
        where: and(eq(customers.id, input.customerId), eq(customers.tenantId, tenantId)),
      });
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });

      await db.transaction(async (tx) => {
        // Get current balance
        const balanceResult = await tx
          .select({ total: sql<number>`COALESCE(SUM(CASE WHEN type = 'receivable' THEN amount WHEN type IN ('payment','deposit','credit','refund') THEN -amount ELSE 0 END), 0)` })
          .from(customerTransactions)
          .where(and(eq(customerTransactions.tenantId, tenantId), eq(customerTransactions.customerId, input.customerId)));
        const currentBalance = Number(balanceResult[0]?.total ?? 0);

        // Create payment transaction
        await tx.insert(customerTransactions).values({
          tenantId,
          customerId: input.customerId,
          invoiceId: input.invoiceId || null,
          type: "payment",
          amount: amount.toFixed(2),
          balance: Math.max(0, currentBalance - amount).toFixed(2),
          description: input.description || `Payment received (${input.paymentMethod})`,
          referenceNumber: input.referenceNumber,
          createdBy: ctx.user!.id,
        });

        // Update invoice if provided
        if (input.invoiceId) {
          const invoice = await tx.query.invoices.findFirst({
            where: and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, tenantId)),
          });
          if (invoice) {
            const newPaid = Number(invoice.paidAmount) + amount;
            const newStatus = newPaid >= Number(invoice.totalAmount) ? "paid" : invoice.status;
            await tx.update(invoices).set({
              paidAmount: newPaid.toFixed(2),
              status: newStatus as "draft" | "sent" | "paid" | "overdue" | "cancelled",
            }).where(eq(invoices.id, input.invoiceId));
          }
        }

        // Create accounting journal for payment (Debit Cash, Credit AR)
        const cashAccount = await tx.query.chartOfAccounts.findFirst({
          where: and(eq(chartOfAccounts.code, "1000"), eq(chartOfAccounts.tenantId, tenantId)),
        });
        const arAccount = await tx.query.chartOfAccounts.findFirst({
          where: and(eq(chartOfAccounts.code, "1200"), eq(chartOfAccounts.tenantId, tenantId)),
        });

        if (cashAccount && arAccount) {
          const journalResult = await tx.insert(journalEntries).values({
            tenantId,
            entryNumber: `JE-${Date.now()}`,
            date: new Date(),
            description: `Customer payment: ${customer.firstName} ${customer.lastName}`,
            referenceType: "payment",
            totalDebit: amount.toFixed(2),
            totalCredit: amount.toFixed(2),
            status: "posted",
          });
          const journalId = Number(journalResult[0].insertId ?? 0);
          if (journalId > 0) {
            await tx.insert(journalEntryLines).values([
              { journalEntryId: journalId, accountId: cashAccount.id, description: "Cash received", debit: amount.toFixed(2), credit: "0.00" },
              { journalEntryId: journalId, accountId: arAccount.id, description: "AR reduction", debit: "0.00", credit: amount.toFixed(2) },
            ]);

            for (const line of [
              { accountId: cashAccount.id, debit: amount.toFixed(2), credit: "0.00", description: "Cash received" },
              { accountId: arAccount.id, debit: "0.00", credit: amount.toFixed(2), description: "AR reduction" },
            ]) {
              const account = await tx.query.chartOfAccounts.findFirst({
                where: and(eq(chartOfAccounts.id, line.accountId), eq(chartOfAccounts.tenantId, tenantId)),
              });
              const currentBal = Number(account?.currentBalance ?? 0);
              const newBal = currentBal + Number(line.debit) - Number(line.credit);
              await tx.insert(ledgerEntries).values({
                tenantId,
                journalEntryId: journalId,
                accountId: line.accountId,
                date: new Date(),
                description: line.description,
                debit: line.debit,
                credit: line.credit,
                balance: newBal.toFixed(2),
              });
              await tx.update(chartOfAccounts).set({ currentBalance: newBal.toFixed(2) }).where(
                and(eq(chartOfAccounts.id, line.accountId), eq(chartOfAccounts.tenantId, tenantId)),
              );
            }
          }
        }
      });

      // Notification (outside tx)
      try {
        await db.insert(notifications).values({
          tenantId,
          userId: ctx.user!.id,
          title: "Payment Received",
          message: `$${amount.toLocaleString()} received from ${customer.firstName} ${customer.lastName}.`,
          type: "success",
          category: "accounting",
        });
      } catch { /* non-critical */ }

      return { success: true };
    }),
});
