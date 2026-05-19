import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, tenantAdminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { invoices, invoiceItems, customers, tickets, ticketPassengers, airlines, customerTransactions, chartOfAccounts, journalEntries, journalEntryLines, ledgerEntries, notifications } from "@db/schema";
import { eq, desc, sql, and, isNull, inArray } from "drizzle-orm";
import { nextNumber } from "./lib/numbering";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const invoiceRouter = createRouter({
  list: authedQuery
    .input(z.object({
      status: z.string().optional(),
      customerId: z.number().optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const conditions = [eq(invoices.tenantId, tenantId), isNull(invoices.deletedAt)];
      if (input?.status) conditions.push(eq(invoices.status, input.status as "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled"));
      if (input?.customerId) conditions.push(eq(invoices.customerId, input.customerId));
      if (input?.search) conditions.push(sql`${invoices.invoiceNumber} LIKE ${`%${input.search}%`}`);
      const where = conditions.length > 1 ? and(...conditions) : conditions[0];

      const items = await db.select().from(invoices).where(where).limit(input?.limit ?? 20).offset(((input?.page ?? 1) - 1) * (input?.limit ?? 20)).orderBy(desc(invoices.createdAt));
      const customerIds = [...new Set(items.map(i => i.customerId).filter(Boolean))] as number[];
      const customerList = customerIds.length > 0
        ? await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), inArray(customers.id, customerIds)))
        : [];
      const customerMap = new Map(customerList.map(c => [c.id, c]));

      const itemsWithCustomer = items.map(i => ({
        ...i,
        customer: customerMap.get(i.customerId) || null,
      }));

      const countResult = await db.select({ count: sql<number>`count(*)` }).from(invoices).where(where);
      return { items: itemsWithCustomer, total: Number(countResult[0]?.count ?? 0) };
    }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const invoiceRow = await db.select().from(invoices).where(
        and(eq(invoices.id, input.id), eq(invoices.tenantId, tenantId)),
      ).limit(1);
      if (!invoiceRow[0]) return null;
      const inv = invoiceRow[0];

      const [itemsList, customerRow, ticketRow] = await Promise.all([
        db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id)),
        inv.customerId ? db.select().from(customers).where(
          and(eq(customers.id, inv.customerId), eq(customers.tenantId, tenantId))
        ).limit(1).then(r => r[0] || null) : Promise.resolve(null),
        inv.ticketId ? db.select().from(tickets).where(
          and(eq(tickets.id, inv.ticketId), eq(tickets.tenantId, tenantId))
        ).limit(1).then(r => r[0] || null) : Promise.resolve(null),
      ]);

      return { ...inv, items: itemsList, customer: customerRow, ticket: ticketRow };
    }),

  generateFromTicket: tenantAdminQuery
    .input(z.object({ ticketId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const ticketRow = await db.select().from(tickets).where(
        and(eq(tickets.id, input.ticketId), eq(tickets.tenantId, tenantId)),
      ).limit(1);
      const ticket = ticketRow[0];
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      if (!ticket.customerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Ticket has no customer" });

      const [airlineRow, passengersList] = await Promise.all([
        ticket.airlineId ? db.select().from(airlines).where(and(eq(airlines.id, ticket.airlineId), eq(airlines.tenantId, tenantId))).limit(1).then(r => r[0] || null) : Promise.resolve(null),
        db.select().from(ticketPassengers).where(eq(ticketPassengers.ticketId, ticket.id)),
      ]);

      const customer = await db.query.customers.findFirst({
        where: and(eq(customers.id, ticket.customerId), eq(customers.tenantId, tenantId)),
      });
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });

      // Check if invoice already exists for this ticket
      const existing = await db.query.invoices.findFirst({
        where: and(eq(invoices.ticketId, ticket.id), eq(invoices.tenantId, tenantId)),
      });
      if (existing) return { id: existing.id, invoiceNumber: existing.invoiceNumber };

      const invoiceNumber = await nextNumber(db, tenantId, "INV");

      const subtotal = Number(ticket.totalAmount) - Number(ticket.taxAmount);
      const tax = Number(ticket.taxAmount);
      const total = Number(ticket.totalAmount);

      const invoiceResult = await db.insert(invoices).values({
        tenantId,
        customerId: customer.id,
        invoiceNumber,
        ticketId: ticket.id,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days due
        subtotal: subtotal.toFixed(2),
        taxAmount: tax.toFixed(2),
        totalAmount: total.toFixed(2),
        paidAmount: "0.00",
        status: "sent",
        notes: `Generated from ticket ${ticket.ticketNumber}`,
        createdBy: ctx.user!.id,
      });
      const invoiceId = Number(invoiceResult[0].insertId);

      // Create invoice items
      const paxNames = passengersList.map(p => `${p.firstName} ${p.lastName}`).join(", ") || "";
      await db.insert(invoiceItems).values([
        {
          invoiceId,
          description: `Flight: ${ticket.routeFrom} → ${ticket.routeTo} | ${airlineRow?.name || ""} | ${paxNames}`,
          quantity: 1,
          unitPrice: subtotal.toFixed(2),
          totalPrice: subtotal.toFixed(2),
        },
      ]);

      return { id: invoiceId, invoiceNumber };
    }),

  updateStatus: tenantAdminQuery
    .input(z.object({
      id: z.number(),
      status: z.enum(["draft", "sent", "partial", "paid", "overdue", "cancelled"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(invoices).set({ status: input.status }).where(
        and(eq(invoices.id, input.id), eq(invoices.tenantId, ctx.user!.tenantId as number)),
      );
      return { success: true };
    }),

  recordPayment: tenantAdminQuery
    .input(z.object({
      id: z.number(),
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

      const invoiceRow = await db.select().from(invoices).where(
        and(eq(invoices.id, input.id), eq(invoices.tenantId, tenantId)),
      ).limit(1);
      const invoice = invoiceRow[0];
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      if (!invoice.customerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice has no customer" });

      const customer = invoice.customerId
        ? await db.select().from(customers).where(
            and(eq(customers.id, invoice.customerId), eq(customers.tenantId, tenantId))
          ).limit(1).then(r => r[0] || null)
        : null;

      await db.transaction(async (tx) => {
        // Update invoice paid amount and status
        const newPaid = Number(invoice.paidAmount) + amount;
        const newStatus = newPaid >= Number(invoice.totalAmount) ? "paid" : "partial";
        await tx.update(invoices).set({
          paidAmount: newPaid.toFixed(2),
          status: newStatus as "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled",
        }).where(and(eq(invoices.id, input.id), eq(invoices.tenantId, tenantId)));

        // Create customer transaction
        const balanceResult = await tx
          .select({ total: sql<number>`COALESCE(SUM(CASE WHEN type = 'receivable' THEN amount WHEN type IN ('payment','deposit','credit','refund') THEN -amount ELSE 0 END), 0)` })
          .from(customerTransactions)
          .where(and(eq(customerTransactions.tenantId, tenantId), eq(customerTransactions.customerId, invoice.customerId)));
        const currentBalance = Number(balanceResult[0]?.total ?? 0);

        await tx.insert(customerTransactions).values({
          tenantId,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          type: "payment",
          amount: amount.toFixed(2),
          balance: Math.max(0, currentBalance - amount).toFixed(2),
          description: input.description || `Invoice payment (${input.paymentMethod})`,
          referenceNumber: input.referenceNumber,
          createdBy: ctx.user!.id,
        });

        // Create accounting journal (Debit Cash, Credit AR)
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
            description: `Invoice payment: ${invoice.invoiceNumber}`,
            referenceType: "invoice_payment",
            referenceId: invoice.id,
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
          title: "Invoice Payment Received",
          message: `$${amount.toLocaleString()} received for invoice ${invoice.invoiceNumber}${customer ? ` from ${customer.firstName || ""} ${customer.lastName || ""}`.trim() : ""}.`,
          type: "success",
          category: "accounting",
          referenceType: "invoice",
          referenceId: invoice.id,
        });
      } catch { /* non-critical */ }

      return { success: true };
    }),

  pdf: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const invoiceRow = await db.select().from(invoices).where(
        and(eq(invoices.id, input.id), eq(invoices.tenantId, tenantId)),
      ).limit(1);
      if (!invoiceRow[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      const inv = invoiceRow[0];

      const [itemsList, customerRow, ticketRow] = await Promise.all([
        db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id)),
        inv.customerId ? db.select().from(customers).where(
          and(eq(customers.id, inv.customerId), eq(customers.tenantId, tenantId))
        ).limit(1).then(r => r[0] || null) : Promise.resolve(null),
        inv.ticketId ? db.select().from(tickets).where(
          and(eq(tickets.id, inv.ticketId), eq(tickets.tenantId, tenantId))
        ).limit(1).then(r => r[0] || null) : Promise.resolve(null),
      ]);

      const invoice = { ...inv, items: itemsList, customer: customerRow, ticket: ticketRow };

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;

      doc.setFontSize(20);
      doc.setTextColor(99, 102, 241);
      doc.text("INVOICE", margin, 20);

      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Invoice #: ${invoice.invoiceNumber}`, pageWidth - margin, 16, { align: "right" });
      doc.text(`Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}`, pageWidth - margin, 21, { align: "right" });
      if (invoice.dueDate) {
        doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, pageWidth - margin, 26, { align: "right" });
      }
      doc.text(`Status: ${invoice.status.toUpperCase()}`, pageWidth - margin, 31, { align: "right" });

      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text("Bill To:", margin, 38);
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const c = invoice.customer;
      if (c) {
        const name = `${c.firstName || ""} ${c.lastName || ""}`.trim();
        doc.text(name || "Customer", margin, 44);
        if (c.company) doc.text(c.company, margin, 49);
        if (c.email) doc.text(c.email, margin, 54);
        if (c.phone) doc.text(c.phone, margin, 59);
        if (c.address) doc.text(c.address, margin, 64);
      }

      const items = (invoice.items || []).map((item: any) => [
        item.description,
        String(item.quantity),
        `$${Number(item.unitPrice).toLocaleString()}`,
        `$${Number(item.totalPrice).toLocaleString()}`,
      ]);

      autoTable(doc, {
        startY: 72,
        head: [["Description", "Qty", "Unit Price", "Total"]],
        body: items,
        theme: "grid",
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontSize: 10 },
        bodyStyles: { fontSize: 10 },
        columnStyles: {
          0: { cellWidth: "auto" },
          1: { cellWidth: 20, halign: "center" },
          2: { cellWidth: 40, halign: "right" },
          3: { cellWidth: 40, halign: "right" },
        },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 120;
      const totalsX = pageWidth - margin - 60;

      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text("Subtotal:", totalsX, finalY + 10, { align: "left" });
      doc.text(`$${Number(invoice.subtotal).toLocaleString()}`, pageWidth - margin, finalY + 10, { align: "right" });

      doc.text("Tax:", totalsX, finalY + 16, { align: "left" });
      doc.text(`$${Number(invoice.taxAmount).toLocaleString()}`, pageWidth - margin, finalY + 16, { align: "right" });

      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text("Total:", totalsX, finalY + 24, { align: "left" });
      doc.text(`$${Number(invoice.totalAmount).toLocaleString()}`, pageWidth - margin, finalY + 24, { align: "right" });

      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text("Paid:", totalsX, finalY + 30, { align: "left" });
      doc.text(`$${Number(invoice.paidAmount).toLocaleString()}`, pageWidth - margin, finalY + 30, { align: "right" });

      const balance = Number(invoice.totalAmount) - Number(invoice.paidAmount);
      if (balance > 0) {
        doc.setTextColor(200, 50, 50);
        doc.text("Balance Due:", totalsX, finalY + 36, { align: "left" });
        doc.text(`$${balance.toLocaleString()}`, pageWidth - margin, finalY + 36, { align: "right" });
      }

      if (invoice.notes) {
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(9);
        doc.text("Notes:", margin, finalY + 48);
        doc.text(invoice.notes, margin, finalY + 53);
      }

      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Thank you for your business.", pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });

      const dataUrl = doc.output("datauristring");
      return { dataUrl };
    }),
});
