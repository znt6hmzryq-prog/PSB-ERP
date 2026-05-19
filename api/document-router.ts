import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  documents, invoices, invoiceItems, customers, tickets, deposits,
  wallets, users, suppliers, supplierPayments, bills,
} from "@db/schema";
import { eq, desc, sql, and, isNull } from "drizzle-orm";
import { deleteStoredFile } from "./lib/file-storage";

function ensureTenant(ctx: any, label = "") {
  const tid = ctx.user?.tenantId;
  console.log(`[Document router] ${label} tenantId:`, tid);
  if (tid == null) {
    console.log("[Document router] missing tenantId", ctx.user);
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context missing" });
  }
  return tid as number;
}


export const documentRouter = createRouter({
  // ─── LIST DOCUMENTS ────────────────────────────────────────────────────────
  list: authedQuery
    .input(z.object({
      entityType: z.string().optional(),
      documentType: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "list");
      console.log("[Documents] list input:", input);
      const conditions = [eq(documents.tenantId, tenantId), isNull(documents.deletedAt)];

      if (input?.entityType) conditions.push(eq(documents.entityType, input.entityType as any));
      if (input?.documentType) conditions.push(eq(documents.documentType, input.documentType as any));

      const where = and(...conditions);

      const items = await db.select().from(documents)
        .where(where)
        .limit(input?.limit ?? 20)
        .offset(((input?.page ?? 1) - 1) * (input?.limit ?? 20))
        .orderBy(desc(documents.createdAt));

      const totalResult = await db.select({ count: sql<number>`count(*)` }).from(documents).where(where);
      return { items, total: totalResult[0]?.count ?? 0 };
    }),

  // ─── RECORD GENERATED DOCUMENT ─────────────────────────────────────────────
  record: authedQuery
    .input(z.object({
      entityType: z.enum(["invoice", "ticket", "deposit", "supplier_payment", "expense", "report", "other"]),
      entityId: z.number(),
      documentType: z.enum(["invoice", "receipt", "voucher", "statement", "report", "attachment"]),
      documentNumber: z.string().optional(),
      fileName: z.string(),
      fileSize: z.number(),
      metadata: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "record");
      console.log("[Documents] record input:", input);

      const result = await db.insert(documents).values({
        tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        documentType: input.documentType,
        documentNumber: input.documentNumber || null,
        fileName: input.fileName,
        mimeType: "application/pdf",
        fileSize: input.fileSize,
        status: "generated",
        generatedBy: ctx.user!.id,
        generatedAt: new Date(),
        metadata: input.metadata || null,
      });

      return { id: Number(result[0].insertId) };
    }),

  // ─── GET INVOICE DATA FOR PDF ──────────────────────────────────────────────
  invoiceData: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "invoiceData");
      console.log("[Documents] invoiceData input:", input);

      const invoice = await db.select().from(invoices)
        .where(and(eq(invoices.id, input.id), eq(invoices.tenantId, tenantId)))
        .limit(1);
      if (!invoice[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      const customer = await db.select().from(customers)
        .where(and(eq(customers.id, invoice[0].customerId), eq(customers.tenantId, tenantId)))
        .limit(1);

      const items = await db.select().from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, input.id));

      const ticket = invoice[0].ticketId
        ? await db.select().from(tickets).where(and(eq(tickets.id, invoice[0].ticketId), eq(tickets.tenantId, tenantId))).limit(1)
        : [];

      return {
        invoice: invoice[0],
        customer: customer[0] || null,
        items,
        ticket: ticket[0] || null,
      };
    }),

  // ─── GET TICKET VOUCHER DATA ───────────────────────────────────────────────
  ticketVoucherData: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "ticketVoucherData");
      console.log("[Documents] ticketVoucherData input:", input);

      const ticket = await db.select().from(tickets)
        .where(and(eq(tickets.id, input.id), eq(tickets.tenantId, tenantId)))
        .limit(1);
      if (!ticket[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });

      const customer = ticket[0].customerId
        ? await db.select().from(customers).where(and(eq(customers.id, ticket[0].customerId), eq(customers.tenantId, tenantId))).limit(1)
        : [];

      const invoice = await db.select().from(invoices)
        .where(and(eq(invoices.ticketId, input.id), eq(invoices.tenantId, tenantId)))
        .limit(1);

      return {
        ticket: ticket[0],
        customer: customer[0] || null,
        invoice: invoice[0] || null,
      };
    }),

  // ─── GET DEPOSIT RECEIPT DATA ──────────────────────────────────────────────
  depositReceiptData: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "depositReceiptData");
      console.log("[Documents] depositReceiptData input:", input);

      const deposit = await db.select().from(deposits)
        .where(and(eq(deposits.id, input.id), eq(deposits.tenantId, tenantId)))
        .limit(1);
      if (!deposit[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Deposit not found" });

      const customer = deposit[0].customerId
        ? await db.select().from(customers).where(and(eq(customers.id, deposit[0].customerId), eq(customers.tenantId, tenantId))).limit(1)
        : [];

      const wallet = deposit[0].walletId
        ? await db.select().from(wallets).where(and(eq(wallets.id, deposit[0].walletId), eq(wallets.tenantId, tenantId))).limit(1)
        : [];

      const approver = deposit[0].approvedBy
        ? await db.select().from(users).where(eq(users.id, deposit[0].approvedBy)).limit(1)
        : [];

      return {
        deposit: deposit[0],
        customer: customer[0] || null,
        wallet: wallet[0] || null,
        approver: approver[0] || null,
      };
    }),

  // ─── GET PAYMENT VOUCHER DATA ──────────────────────────────────────────────
  paymentVoucherData: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "paymentVoucherData");
      console.log("[Documents] paymentVoucherData input:", input);

      const payment = await db.select().from(supplierPayments)
        .where(and(eq(supplierPayments.id, input.id), eq(supplierPayments.tenantId, tenantId)))
        .limit(1);
      if (!payment[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });

      const supplier = await db.select().from(suppliers)
        .where(and(eq(suppliers.id, payment[0].supplierId), eq(suppliers.tenantId, tenantId)))
        .limit(1);

      const bill = payment[0].billId
        ? await db.select().from(bills).where(and(eq(bills.id, payment[0].billId), eq(bills.tenantId, tenantId))).limit(1)
        : [];

      return {
        payment: payment[0],
        supplier: supplier[0] || null,
        bill: bill[0] || null,
      };
    }),

  // ─── GET SINGLE DOCUMENT ─────────────────────────────────────────────────
  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "get");
      console.log("[Documents] get input:", input);
      const doc = await db.select().from(documents)
        .where(and(eq(documents.id, input.id), eq(documents.tenantId, tenantId)))
        .limit(1);
      return doc[0] || null;
    }),

  // ─── DELETE DOCUMENT ───────────────────────────────────────────────────────
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "delete");
      console.log("[Documents] delete input:", input);

      const doc = await db.select({ fileUrl: documents.fileUrl }).from(documents)
        .where(and(eq(documents.id, input.id), eq(documents.tenantId, tenantId)))
        .limit(1);

      if (doc[0]?.fileUrl) {
        await deleteStoredFile(doc[0].fileUrl);
      }

      await db.delete(documents)
        .where(and(eq(documents.id, input.id), eq(documents.tenantId, tenantId)));
      return { success: true };
    }),

  // ─── DOCUMENT STATS ────────────────────────────────────────────────────────
  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ensureTenant(ctx, "stats");
    console.log("[Documents] stats");

    const total = await db.select({ count: sql<number>`count(*)` }).from(documents).where(eq(documents.tenantId, tenantId));
    const byType = await db.select({
      type: documents.documentType,
      count: sql<number>`count(*)`,
    }).from(documents).where(eq(documents.tenantId, tenantId)).groupBy(documents.documentType);

    return {
      totalDocuments: total[0]?.count ?? 0,
      byType,
    };
  }),
});
