import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, tenantAdminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  bills, billItems, suppliers, supplierPayments,
  chartOfAccounts, journalEntries, journalEntryLines, ledgerEntries,
} from "@db/schema";
import { eq, desc, sql, and, isNull, inArray } from "drizzle-orm";
import { auditLog } from "./lib/audit";
import { nextNumber } from "./lib/numbering";

function ensureTenant(ctx: any, label = "") {
  const tid = ctx.user?.tenantId;
  console.log(`[Payable router] ${label} tenantId:`, tid);
  if (tid == null) {
    console.log("[Payable router] missing tenantId", ctx.user);
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context missing" });
  }
  return tid as number;
}

async function getOrCreateApAccount(db: import("./queries/connection").DbOrTx, tenantId: number) {
  let ap = await db.query.chartOfAccounts.findFirst({
    where: and(eq(chartOfAccounts.code, "2000"), eq(chartOfAccounts.tenantId, tenantId)),
  });
  if (!ap) {
    const result = await db.insert(chartOfAccounts).values({
      tenantId,
      code: "2000",
      name: "Accounts Payable",
      type: "liability",
      currentBalance: "0.00",
      status: "active",
      currency: "USD",
    });
    ap = await db.query.chartOfAccounts.findFirst({ where: eq(chartOfAccounts.id, Number(result[0].insertId)) });
  }
  return ap;
}

async function getOrCreateExpenseAccount(db: import("./queries/connection").DbOrTx, category: string, tenantId: number) {
  const codeMap: Record<string, string> = {
    flight: "5100",
    hotel: "5110",
    car_rental: "5120",
    tour: "5130",
    insurance: "5140",
    visa: "5150",
    general: "5000",
  };
  const code = codeMap[category.toLowerCase()] || "5000";
  let account = await db.query.chartOfAccounts.findFirst({
    where: and(eq(chartOfAccounts.code, code), eq(chartOfAccounts.tenantId, tenantId)),
  });
  if (!account) {
    const nameMap: Record<string, string> = {
      "5100": "Flight Expense",
      "5110": "Hotel Expense",
      "5120": "Car Rental Expense",
      "5130": "Tour Package Expense",
      "5140": "Travel Insurance Expense",
      "5150": "Visa Processing Expense",
      "5000": "General Expense",
    };
    const result = await db.insert(chartOfAccounts).values({
      tenantId,
      code,
      name: nameMap[code] || category,
      type: "expense",
      currentBalance: "0.00",
      status: "active",
      currency: "USD",
    });
    account = await db.query.chartOfAccounts.findFirst({ where: eq(chartOfAccounts.id, Number(result[0].insertId)) });
  }
  return account;
}

export const payableRouter = createRouter({
  // ─── LIST BILLS ────────────────────────────────────────────────────────────
  bills: authedQuery
    .input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      supplierId: z.number().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "bills");
      console.log("[Payables query] bills input:", input);
      const conditions = [eq(bills.tenantId, tenantId), isNull(bills.deletedAt)];

      if (input?.supplierId) conditions.push(eq(bills.supplierId, input.supplierId));
      if (input?.status) conditions.push(eq(bills.status, input.status as any));
      if (input?.fromDate) conditions.push(sql`${bills.issueDate} >= ${input.fromDate}`);
      if (input?.toDate) conditions.push(sql`${bills.issueDate} <= ${input.toDate}`);
      if (input?.search) {
        conditions.push(sql`(
          ${bills.billNumber} LIKE ${`%${input.search}%`} OR
          ${bills.referenceNumber} LIKE ${`%${input.search}%`}
        )`);
      }

      const where = and(...conditions);

      const items = await db.select().from(bills)
        .where(where)
        .limit(input?.limit ?? 20)
        .offset(((input?.page ?? 1) - 1) * (input?.limit ?? 20))
        .orderBy(desc(bills.createdAt));

      const supplierIds = [...new Set(items.map(b => b.supplierId).filter(Boolean))];
      const supplierList = supplierIds.length > 0
        ? await db.select().from(suppliers).where(and(eq(suppliers.tenantId, tenantId), inArray(suppliers.id, supplierIds)))
        : [];
      const supplierMap = new Map(supplierList.map(s => [s.id, s]));

      const totalResult = await db.select({ count: sql<number>`count(*)` }).from(bills).where(where);

      return {
        items: items.map(b => ({ ...b, supplier: supplierMap.get(b.supplierId) || null })),
        total: totalResult[0]?.count ?? 0,
      };
    }),

  // ─── GET BILL DETAIL ───────────────────────────────────────────────────────
  billDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "billDetail");
      console.log("[Payables query] billDetail input:", input);

      const bill = await db.select().from(bills)
        .where(and(eq(bills.id, input.id), eq(bills.tenantId, tenantId)))
        .limit(1);
      if (!bill[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });

      const items = await db.select().from(billItems)
        .where(and(eq(billItems.billId, input.id), eq(billItems.tenantId, tenantId)));

      const supplierData = await db.select().from(suppliers)
        .where(and(eq(suppliers.id, bill[0].supplierId), eq(suppliers.tenantId, tenantId)))
        .limit(1);

      const payments = await db.select().from(supplierPayments)
        .where(and(eq(supplierPayments.billId, input.id), eq(supplierPayments.tenantId, tenantId)))
        .orderBy(desc(supplierPayments.createdAt));

      return { bill: bill[0], items, supplier: supplierData[0] || null, payments };
    }),

  // ─── CREATE BILL ───────────────────────────────────────────────────────────
  createBill: tenantAdminQuery
    .input(z.object({
      supplierId: z.number(),
      referenceNumber: z.string().optional(),
      issueDate: z.string(),
      dueDate: z.string(),
      description: z.string().optional(),
      category: z.string().optional(),
      currency: z.string().length(3).default("USD"),
      items: z.array(z.object({
        description: z.string().min(1),
        quantity: z.number().min(0.01).default(1),
        unitPrice: z.number().min(0),
        accountId: z.number().optional(),
      })).min(1),
      taxAmount: z.number().min(0).default(0),
      discountAmount: z.number().min(0).default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "createBill");
      console.log("[Payables create] createBill input:", input);

      const { billId, billNumber, totalAmount } = await db.transaction(async (tx) => {
        // Verify supplier
        const supplier = await tx.select().from(suppliers)
          .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, tenantId)))
          .limit(1);
        if (!supplier[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found" });

        const subtotal = input.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const totalAmount = subtotal + input.taxAmount - input.discountAmount;
        const billNumber = await nextNumber(tx, tenantId, "BILL");

        const billResult = await tx.insert(bills).values({
          tenantId,
          supplierId: input.supplierId,
          billNumber,
          referenceNumber: input.referenceNumber || null,
          issueDate: new Date(input.issueDate),
          dueDate: new Date(input.dueDate),
          subtotal: subtotal.toFixed(2),
          taxAmount: input.taxAmount.toFixed(2),
          discountAmount: input.discountAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          amountPaid: "0.00",
          balanceDue: totalAmount.toFixed(2),
          currency: input.currency,
          description: input.description || null,
          status: "open",
          category: input.category || null,
        });

        const billId = Number(billResult[0].insertId);

        // Insert bill items
        const category = input.category || "general";
        for (const item of input.items) {
          let accountId = item.accountId;
          if (!accountId) {
            const expenseAccount = await getOrCreateExpenseAccount(tx, category, tenantId);
            accountId = Number(expenseAccount!.id);
          }
          await tx.insert(billItems).values({
            tenantId,
            billId,
            description: item.description,
            quantity: item.quantity.toFixed(2),
            unitPrice: item.unitPrice.toFixed(2),
            total: (item.quantity * item.unitPrice).toFixed(2),
            accountId: accountId || null,
          });
        }

        // Post journal entry: Expense Dr, AP Cr
        const apAccount = await getOrCreateApAccount(tx, tenantId);
        const expenseAccount = await getOrCreateExpenseAccount(tx, category, tenantId);

        if (!apAccount || !expenseAccount) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Required COA accounts missing" });
        }

        const jeResult = await tx.insert(journalEntries).values({
          tenantId,
          entryNumber: `JE-${Date.now()}`,
          date: new Date(input.issueDate),
          description: `Bill ${billNumber} - ${supplier[0].companyName}`,
          referenceType: "bill",
          referenceId: billId,
          totalDebit: totalAmount.toFixed(2),
          totalCredit: totalAmount.toFixed(2),
          status: "posted",
        });
        const journalEntryId = Number(jeResult[0].insertId);

        // Journal lines
        await tx.insert(journalEntryLines).values([
          {
            journalEntryId,
            accountId: Number(expenseAccount.id),
            description: `Expense for bill ${billNumber}`,
            debit: totalAmount.toFixed(2),
            credit: "0.00",
          },
          {
            journalEntryId,
            accountId: Number(apAccount.id),
            description: `AP for bill ${billNumber}`,
            debit: "0.00",
            credit: totalAmount.toFixed(2),
          },
        ]);

        // Ledger entries
        const expenseLedgerBalance = await tx.select({
          balance: sql<number>`COALESCE(SUM(debit - credit), 0)`,
        }).from(ledgerEntries).where(eq(ledgerEntries.accountId, Number(expenseAccount.id)));
        const newExpenseBalance = Number(expenseLedgerBalance[0]?.balance ?? 0) + totalAmount;

        const apLedgerBalance = await tx.select({
          balance: sql<number>`COALESCE(SUM(debit - credit), 0)`,
        }).from(ledgerEntries).where(eq(ledgerEntries.accountId, Number(apAccount.id)));
        const newApBalance = Number(apLedgerBalance[0]?.balance ?? 0) - totalAmount;

        await tx.insert(ledgerEntries).values([
          {
            tenantId,
            journalEntryId,
            accountId: Number(expenseAccount.id),
            date: new Date(input.issueDate),
            description: `Expense for bill ${billNumber}`,
            debit: totalAmount.toFixed(2),
            credit: "0.00",
            balance: newExpenseBalance.toFixed(2),
            entryType: "transaction",
            referenceType: "bill",
            referenceId: billId,
          },
          {
            tenantId,
            journalEntryId,
            accountId: Number(apAccount.id),
            date: new Date(input.issueDate),
            description: `AP for bill ${billNumber}`,
            debit: "0.00",
            credit: totalAmount.toFixed(2),
            balance: newApBalance.toFixed(2),
            entryType: "transaction",
            referenceType: "bill",
            referenceId: billId,
          },
        ]);

        // Update COA balances
        await tx.update(chartOfAccounts).set({
          currentBalance: newExpenseBalance.toFixed(2),
        }).where(eq(chartOfAccounts.id, Number(expenseAccount.id)));
        await tx.update(chartOfAccounts).set({
          currentBalance: newApBalance.toFixed(2),
        }).where(eq(chartOfAccounts.id, Number(apAccount.id)));

        // Update bill with journal entry
        await tx.update(bills).set({ journalEntryId }).where(eq(bills.id, billId));

        // Update supplier balance due
        const newSupplierBalance = Number(supplier[0].balanceDue) + totalAmount;
        await tx.update(suppliers).set({
          balanceDue: newSupplierBalance.toFixed(2),
        }).where(eq(suppliers.id, input.supplierId));

        return { billId, billNumber, totalAmount };
      });

      await auditLog({
        ctx, action: "bill_created", entityType: "bill", entityId: billId,
        newValues: { billNumber, totalAmount, supplierId: input.supplierId },
      });

      return { id: billId, billNumber, totalAmount };
    }),

  // ─── UPDATE BILL STATUS ────────────────────────────────────────────────────
  updateBillStatus: tenantAdminQuery
    .input(z.object({ id: z.number(), status: z.enum(["draft", "open", "partial", "paid", "overdue", "cancelled"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "updateBillStatus");
      console.log("[Payables update] updateBillStatus input:", input);

      const existing = await db.select().from(bills)
        .where(and(eq(bills.id, input.id), eq(bills.tenantId, tenantId)))
        .limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });

      await db.update(bills).set({ status: input.status })
        .where(and(eq(bills.id, input.id), eq(bills.tenantId, tenantId)));

      await auditLog({ ctx, action: "bill_status_updated", entityType: "bill", entityId: input.id, newValues: { status: input.status } });
      return { success: true };
    }),

  // ─── CREATE PAYMENT ────────────────────────────────────────────────────────
  createPayment: tenantAdminQuery
    .input(z.object({
      supplierId: z.number(),
      billId: z.number().optional(),
      amount: z.number().min(0.01),
      paymentMethod: z.enum(["cash", "bank_transfer", "cheque", "credit_card", "wallet"]),
      paymentDate: z.string(),
      referenceNumber: z.string().optional(),
      bankAccountId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "createPayment");
      console.log("[Payables create] createPayment input:", input);

      // Concurrency check: verify supplier exists outside tx (read-only)
      const supplier = await db.select().from(suppliers)
        .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, tenantId)))
        .limit(1);
      if (!supplier[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found" });

      // If billId provided, verify outside tx (will re-verify inside)
      let bill = null;
      if (input.billId) {
        bill = await db.select().from(bills)
          .where(and(eq(bills.id, input.billId), eq(bills.tenantId, tenantId), eq(bills.supplierId, input.supplierId)))
          .limit(1);
        if (!bill[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
        if (Number(bill[0].balanceDue) < input.amount) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Payment amount exceeds bill balance" });
        }
      }

      const { paymentId, paymentNumber } = await db.transaction(async (tx) => {
        const paymentNumber = await nextNumber(tx, tenantId, "SP");

        // Post journal: AP Dr, Cash/Bank Cr
        const apAccount = await getOrCreateApAccount(tx, tenantId);
        const cashAccount = await tx.query.chartOfAccounts.findFirst({
          where: and(eq(chartOfAccounts.code, "1000"), eq(chartOfAccounts.tenantId, tenantId)),
        });
        if (!apAccount || !cashAccount) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Required COA accounts missing" });
        }

        const jeResult = await tx.insert(journalEntries).values({
          tenantId,
          entryNumber: `JE-${Date.now()}`,
          date: new Date(input.paymentDate),
          description: `Payment ${paymentNumber} to ${supplier[0].companyName}`,
          referenceType: "supplier_payment",
          totalDebit: input.amount.toFixed(2),
          totalCredit: input.amount.toFixed(2),
          status: "posted",
        });
        const journalEntryId = Number(jeResult[0].insertId);

        await tx.insert(journalEntryLines).values([
          {
            journalEntryId,
            accountId: Number(apAccount.id),
            description: `AP payment ${paymentNumber}`,
            debit: input.amount.toFixed(2),
            credit: "0.00",
          },
          {
            journalEntryId,
            accountId: Number(cashAccount.id),
            description: `Cash payment ${paymentNumber}`,
            debit: "0.00",
            credit: input.amount.toFixed(2),
          },
        ]);

        // Ledger
        const apLedgerBalance = await tx.select({ balance: sql<number>`COALESCE(SUM(debit - credit), 0)` })
          .from(ledgerEntries).where(eq(ledgerEntries.accountId, Number(apAccount.id)));
        const newApBalance = Number(apLedgerBalance[0]?.balance ?? 0) + input.amount;

        const cashLedgerBalance = await tx.select({ balance: sql<number>`COALESCE(SUM(debit - credit), 0)` })
          .from(ledgerEntries).where(eq(ledgerEntries.accountId, Number(cashAccount.id)));
        const newCashBalance = Number(cashLedgerBalance[0]?.balance ?? 0) - input.amount;

        await tx.insert(ledgerEntries).values([
          {
            tenantId,
            journalEntryId,
            accountId: Number(apAccount.id),
            date: new Date(input.paymentDate),
            description: `AP payment ${paymentNumber}`,
            debit: input.amount.toFixed(2),
            credit: "0.00",
            balance: newApBalance.toFixed(2),
            entryType: "transaction",
            referenceType: "supplier_payment",
          },
          {
            tenantId,
            journalEntryId,
            accountId: Number(cashAccount.id),
            date: new Date(input.paymentDate),
            description: `Cash payment ${paymentNumber}`,
            debit: "0.00",
            credit: input.amount.toFixed(2),
            balance: newCashBalance.toFixed(2),
            entryType: "transaction",
            referenceType: "supplier_payment",
          },
        ]);

        // Update COA
        await tx.update(chartOfAccounts).set({ currentBalance: newApBalance.toFixed(2) }).where(eq(chartOfAccounts.id, Number(apAccount.id)));
        await tx.update(chartOfAccounts).set({ currentBalance: newCashBalance.toFixed(2) }).where(eq(chartOfAccounts.id, Number(cashAccount.id)));

        // Create payment record
        const paymentResult = await tx.insert(supplierPayments).values({
          tenantId,
          supplierId: input.supplierId,
          billId: input.billId || null,
          paymentNumber,
          amount: input.amount.toFixed(2),
          paymentMethod: input.paymentMethod,
          paymentDate: new Date(input.paymentDate),
          referenceNumber: input.referenceNumber || null,
          bankAccountId: input.bankAccountId || null,
          notes: input.notes || null,
          journalEntryId,
        });
        const paymentId = Number(paymentResult[0].insertId);

        // Update bill if applicable
        if (bill && bill[0] && input.billId) {
          const newAmountPaid = Number(bill[0].amountPaid) + input.amount;
          const newBalanceDue = Number(bill[0].balanceDue) - input.amount;
          const newStatus = newBalanceDue <= 0 ? "paid" : "partial";
          await tx.update(bills).set({
            amountPaid: newAmountPaid.toFixed(2),
            balanceDue: newBalanceDue.toFixed(2),
            status: newStatus,
          }).where(eq(bills.id, input.billId));
        }

        // Update supplier balance
        const newSupplierBalance = Math.max(0, Number(supplier[0].balanceDue) - input.amount);
        await tx.update(suppliers).set({
          balanceDue: newSupplierBalance.toFixed(2),
        }).where(eq(suppliers.id, input.supplierId));

        return { paymentId, paymentNumber };
      });

      await auditLog({
        ctx, action: "supplier_payment_created", entityType: "supplier_payment", entityId: paymentId,
        newValues: { paymentNumber, amount: input.amount, supplierId: input.supplierId, billId: input.billId },
      });

      return { id: paymentId, paymentNumber };
    }),

  // ─── LIST PAYMENTS ─────────────────────────────────────────────────────────
  payments: authedQuery
    .input(z.object({
      supplierId: z.number().optional(),
      billId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const conditions = [eq(supplierPayments.tenantId, tenantId)];

      if (input?.supplierId) conditions.push(eq(supplierPayments.supplierId, input.supplierId));
      if (input?.billId) conditions.push(eq(supplierPayments.billId, input.billId));

      const where = and(...conditions);

      const items = await db.select().from(supplierPayments)
        .where(where)
        .limit(input?.limit ?? 20)
        .offset(((input?.page ?? 1) - 1) * (input?.limit ?? 20))
        .orderBy(desc(supplierPayments.createdAt));

      const supplierIds = [...new Set(items.map(p => p.supplierId).filter(Boolean))];
      const supplierList = supplierIds.length > 0
        ? await db.select().from(suppliers).where(and(eq(suppliers.tenantId, tenantId), inArray(suppliers.id, supplierIds)))
        : [];
      const supplierMap = new Map(supplierList.map(s => [s.id, s]));

      return { items: items.map(p => ({ ...p, supplier: supplierMap.get(p.supplierId) || null })) };
    }),

  // ─── AGING REPORT ──────────────────────────────────────────────────────────
  agingReport: authedQuery
    .input(z.object({ asOfDate: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const asOf = input?.asOfDate || new Date().toISOString().split("T")[0];

      const openBills = await db.select().from(bills)
        .where(and(
          eq(bills.tenantId, tenantId),
          eq(bills.status, "open"),
          sql`${bills.dueDate} <= ${asOf}`,
        ));

      const supplierIds = [...new Set(openBills.map(b => b.supplierId))];
      const supplierList = supplierIds.length > 0
        ? await db.select().from(suppliers).where(and(eq(suppliers.tenantId, tenantId), inArray(suppliers.id, supplierIds)))
        : [];
      const supplierMap = new Map(supplierList.map(s => [s.id, s]));

      const now = new Date(asOf);
      const buckets = {
        current: [] as typeof openBills,
        d1_30: [] as typeof openBills,
        d31_60: [] as typeof openBills,
        d61_90: [] as typeof openBills,
        over90: [] as typeof openBills,
      };

      for (const bill of openBills) {
        const due = new Date(bill.dueDate);
        const daysDiff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff <= 0) buckets.current.push(bill);
        else if (daysDiff <= 30) buckets.d1_30.push(bill);
        else if (daysDiff <= 60) buckets.d31_60.push(bill);
        else if (daysDiff <= 90) buckets.d61_90.push(bill);
        else buckets.over90.push(bill);
      }

      const sum = (billList: typeof openBills) => billList.reduce((s, b) => s + Number(b.balanceDue), 0);

      return {
        asOfDate: asOf,
        summary: {
          current: sum(buckets.current),
          days1To30: sum(buckets.d1_30),
          days31To60: sum(buckets.d31_60),
          days61To90: sum(buckets.d61_90),
          over90: sum(buckets.over90),
          total: sum(openBills),
        },
        details: openBills.map(b => ({
          ...b,
          supplier: supplierMap.get(b.supplierId) || null,
          daysOverdue: Math.max(0, Math.floor((now.getTime() - new Date(b.dueDate).getTime()) / (1000 * 60 * 60 * 24))),
        })),
      };
    }),

  // ─── PAYABLE STATS ─────────────────────────────────────────────────────────
  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;

    const totalBills = await db.select({ count: sql<number>`count(*)`, total: sql<number>`COALESCE(SUM(total_amount), 0)` })
      .from(bills).where(eq(bills.tenantId, tenantId));
    const totalDue = await db.select({ total: sql<number>`COALESCE(SUM(balance_due), 0)` })
      .from(bills).where(and(eq(bills.tenantId, tenantId), eq(bills.status, "open")));
    const overdue = await db.select({ count: sql<number>`count(*)`, total: sql<number>`COALESCE(SUM(balance_due), 0)` })
      .from(bills).where(and(eq(bills.tenantId, tenantId), eq(bills.status, "overdue")));
    const totalPayments = await db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(supplierPayments).where(eq(supplierPayments.tenantId, tenantId));
    const upcomingDue = await db.select({ count: sql<number>`count(*)`, total: sql<number>`COALESCE(SUM(balance_due), 0)` })
      .from(bills)
      .where(and(
        eq(bills.tenantId, tenantId),
        eq(bills.status, "open"),
        sql`${bills.dueDate} >= ${new Date().toISOString().split("T")[0]}`,
        sql`${bills.dueDate} <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`,
      ));

    return {
      totalBills: totalBills[0]?.count ?? 0,
      totalBilled: Number(totalBills[0]?.total ?? 0),
      totalDue: Number(totalDue[0]?.total ?? 0),
      overdueBills: overdue[0]?.count ?? 0,
      overdueAmount: Number(overdue[0]?.total ?? 0),
      totalPayments: Number(totalPayments[0]?.total ?? 0),
      upcomingDueCount: upcomingDue[0]?.count ?? 0,
      upcomingDueAmount: Number(upcomingDue[0]?.total ?? 0),
    };
  }),
});
