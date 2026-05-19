import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, tenantAdminQuery, agentQuery } from "./middleware";
import { getDb } from "./queries/connection";

import {
  tickets,
  ticketPassengers,
  airlines,
  wallets,
  walletTransactions,
  journalEntries,
  journalEntryLines,
  ledgerEntries,
  chartOfAccounts,
  notifications,
  customers,
  customerTransactions,
  invoices,
  invoiceItems,
  users,
} from "@db/schema";

import {
  eq,
  desc,
  asc,
  sql,
  like,
  and,
  or,
  inArray,
  isNull,
} from "drizzle-orm";
import { nextNumber } from "./lib/numbering";
import { auditLog } from "./lib/audit";

// =====================================================
// JSON metadata helper (MariaDB returns JSON as strings)
// =====================================================
function getTicketMetadata(ticket: typeof tickets.$inferSelect) {
  if (!ticket.metadata) return null;
  if (typeof ticket.metadata === "string") {
    try { return JSON.parse(ticket.metadata); } catch { return null; }
  }
  return ticket.metadata as any;
}

function ensureTicketTenant(ctx: any, label = "") {
  const tid = ctx.user?.tenantId;
  console.log(`[Ticket router] ${label} tenantId:`, tid);
  if (tid == null) {
    console.log("[Ticket router] missing tenantId", ctx.user);
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context missing" });
  }
  return tid as number;
}

// =====================================================
// APPROVAL HELPER
// =====================================================

async function approveTicket(
  db: import("./queries/connection").DbOrTx,
  ticket: typeof tickets.$inferSelect,
  user: { id: number; tenantId: number | null },
) {
  const tenantId = user.tenantId as number;
  const totalAmount = Number(ticket.totalAmount);
  console.log("[approve ticket]", ticket);
  console.log("[wallet deduction amount]", totalAmount);

  // Extract walletId from metadata
  const metadata = getTicketMetadata(ticket);
  let walletId = metadata?.walletId ?? null;
  console.log("[approve walletId from metadata]", walletId);

  if (!walletId) {
    // Fallback: find any active wallet for this tenant
    const fallbackWallet = await db.query.wallets.findFirst({
      where: and(eq(wallets.tenantId, tenantId), eq(wallets.status, "active")),
      orderBy: [desc(wallets.createdAt)],
    });
    if (fallbackWallet) {
      console.log("[approve fallback wallet]", fallbackWallet.id);
      walletId = fallbackWallet.id;
    }
  }

  if (!walletId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ticket wallet not recorded and no active wallet found" });
  }

  const userWallet = await db.query.wallets.findFirst({
    where: and(eq(wallets.id, walletId), eq(wallets.tenantId, tenantId), eq(wallets.status, "active")),
  });
  console.log("[approve wallet]", userWallet);
  if (!userWallet) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Wallet not found or inactive" });
  }
  if (Number(userWallet.balance) < totalAmount) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient wallet balance" });
  }

  const cashAccount = await db.query.chartOfAccounts.findFirst({
    where: and(eq(chartOfAccounts.code, "1000"), eq(chartOfAccounts.tenantId, tenantId)),
  });
  const arAccount = await db.query.chartOfAccounts.findFirst({
    where: and(eq(chartOfAccounts.code, "1200"), eq(chartOfAccounts.tenantId, tenantId)),
  });
  const revenueAccount = await db.query.chartOfAccounts.findFirst({
    where: and(eq(chartOfAccounts.code, "4000"), eq(chartOfAccounts.tenantId, tenantId)),
  });
  if (!cashAccount || !arAccount || !revenueAccount) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Accounting accounts missing" });
  }

  // Determine debit account: AR if customer is invoiced, Cash if walk-in
  const debitAccount = ticket.customerId ? arAccount : cashAccount;

  // Wallet deduction (atomic with guard)
  const debitResult = await db.update(wallets)
    .set({ balance: sql`${wallets.balance} - ${totalAmount.toFixed(2)}` })
    .where(and(eq(wallets.id, userWallet.id), sql`${wallets.balance} >= ${totalAmount.toFixed(2)}`));
  if (debitResult[0].affectedRows === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient wallet balance" });
  }

  const updatedWallet = await db.query.wallets.findFirst({
    where: eq(wallets.id, userWallet.id),
  });

  // Wallet transaction
  await db.insert(walletTransactions).values({
    walletId: userWallet.id,
    tenantId,
    type: "debit",
    amount: totalAmount.toFixed(2),
    balanceAfter: updatedWallet!.balance,
    description: `Ticket booking: ${ticket.ticketNumber}`,
    referenceType: "ticket",
    referenceId: ticket.id,
    createdBy: user.id,
  });

  // Journal entry
  const journalResult = await db.insert(journalEntries).values({
    tenantId,
    entryNumber: `JE-${Date.now()}`,
    date: new Date(),
    description: `Ticket Sale ${ticket.ticketNumber}`,
    referenceType: "ticket",
    referenceId: ticket.id,
    status: "posted",
    totalDebit: totalAmount.toFixed(2),
    totalCredit: totalAmount.toFixed(2),
  });
  const journalId = Number(journalResult[0].insertId ?? 0);

  if (journalId > 0) {
    await db.insert(journalEntryLines).values([
      {
        journalEntryId: journalId,
        accountId: debitAccount.id,
        description: ticket.customerId ? "Accounts Receivable - Ticket Sale" : "Wallet deduction for ticket booking",
        debit: totalAmount.toFixed(2),
        credit: "0.00",
      },
      {
        journalEntryId: journalId,
        accountId: revenueAccount.id,
        description: "Ticket sales revenue",
        debit: "0.00",
        credit: totalAmount.toFixed(2),
      },
    ]);

    const journalLines = [
      { accountId: debitAccount.id, description: ticket.customerId ? "Accounts Receivable - Ticket Sale" : "Wallet deduction for ticket booking", debit: totalAmount.toFixed(2), credit: "0.00" },
      { accountId: revenueAccount.id, description: "Ticket sales revenue", debit: "0.00", credit: totalAmount.toFixed(2) },
    ];

    for (const line of journalLines) {
      const account = await db.query.chartOfAccounts.findFirst({
        where: and(eq(chartOfAccounts.id, line.accountId), eq(chartOfAccounts.tenantId, tenantId)),
      });
      const currentBalance = Number(account?.currentBalance ?? 0);
      const newAccBalance = currentBalance + Number(line.debit) - Number(line.credit);
      await db.insert(ledgerEntries).values({
        tenantId,
        journalEntryId: journalId,
        accountId: line.accountId,
        date: new Date(),
        description: line.description,
        debit: line.debit,
        credit: line.credit,
        balance: newAccBalance.toFixed(2),
      });
      await db.update(chartOfAccounts).set({ currentBalance: newAccBalance.toFixed(2) }).where(
        and(eq(chartOfAccounts.id, line.accountId), eq(chartOfAccounts.tenantId, tenantId)),
      );
    }
  }

  // Update ticket
  await db.update(tickets).set({ status: "confirmed", paymentStatus: "paid" }).where(eq(tickets.id, ticket.id));

  // =====================================================
  // CUSTOMER RECEIVABLE (if customer exists)
  // =====================================================
  if (ticket.customerId) {
    // Get current customer balance
    const balanceResult = await db
      .select({ total: sql<number>`COALESCE(SUM(CASE WHEN type = 'receivable' THEN amount WHEN type IN ('payment','deposit','credit','refund') THEN -amount ELSE 0 END), 0)` })
      .from(customerTransactions)
      .where(and(eq(customerTransactions.tenantId, tenantId), eq(customerTransactions.customerId, ticket.customerId)));
    const currentBalance = Number(balanceResult[0]?.total ?? 0);
    const newBalance = currentBalance + totalAmount;

    await db.insert(customerTransactions).values({
      tenantId,
      customerId: ticket.customerId,
      ticketId: ticket.id,
      type: "receivable",
      amount: totalAmount.toFixed(2),
      balance: newBalance.toFixed(2),
      description: `Ticket sale: ${ticket.ticketNumber}`,
      createdBy: user.id,
    });

    // Update customer stats
    await db.update(customers).set({
      totalBookings: sql`${customers.totalBookings} + 1`,
      totalRevenue: sql`${customers.totalRevenue} + ${totalAmount.toFixed(2)}`,
      lastBookingDate: new Date(),
    }).where(eq(customers.id, ticket.customerId));
  }

  // =====================================================
  // INVOICE AUTO-GENERATION (if customer exists)
  // =====================================================
  if (ticket.customerId) {
    try {
      const invoiceNumber = await nextNumber(db, tenantId, "INV");

      const invoiceResult = await db.insert(invoices).values({
        tenantId,
        customerId: ticket.customerId,
        invoiceNumber,
        ticketId: ticket.id,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        subtotal: totalAmount.toFixed(2),
        taxAmount: Number(ticket.taxAmount).toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        paidAmount: "0.00",
        status: "sent",
        notes: `Generated from ticket ${ticket.ticketNumber}`,
        createdBy: user.id,
      });
      const invoiceId = Number(invoiceResult[0].insertId);

      const paxList = await db.select().from(ticketPassengers).where(eq(ticketPassengers.ticketId, ticket.id));
      const paxNames = paxList.map(p => `${p.firstName} ${p.lastName}`).join(", ");
      const airline = await db.query.airlines.findFirst({ where: and(eq(airlines.id, ticket.airlineId || 0), eq(airlines.tenantId, tenantId)) });

      await db.insert(invoiceItems).values({
        invoiceId,
        description: `Flight: ${ticket.routeFrom} → ${ticket.routeTo} | ${airline?.name || ""} | ${paxNames}`,
        quantity: 1,
        unitPrice: totalAmount.toFixed(2),
        totalPrice: totalAmount.toFixed(2),
      });

      // Link receivable to invoice
      await db.update(customerTransactions)
        .set({ invoiceId })
        .where(and(
          eq(customerTransactions.tenantId, tenantId),
          eq(customerTransactions.ticketId, ticket.id),
          eq(customerTransactions.type, "receivable"),
        ));
    } catch {
      // Non-critical: invoice generation failure should not block approval
    }
  }

  // Commission accounting
  const commissionAmount = Number(ticket.commissionAmount ?? 0);
  if (commissionAmount > 0 && journalId > 0) {
    const commissionExpenseAccount = await db.query.chartOfAccounts.findFirst({
      where: and(eq(chartOfAccounts.code, "5000"), eq(chartOfAccounts.tenantId, tenantId)),
    });
    const commissionRevenueAccount = await db.query.chartOfAccounts.findFirst({
      where: and(eq(chartOfAccounts.code, "4100"), eq(chartOfAccounts.tenantId, tenantId)),
    });

    if (commissionExpenseAccount && commissionRevenueAccount) {
      await db.insert(journalEntryLines).values([
        { journalEntryId: journalId, accountId: commissionExpenseAccount.id, description: "Commission expense", debit: commissionAmount.toFixed(2), credit: "0.00" },
        { journalEntryId: journalId, accountId: commissionRevenueAccount.id, description: "Commission revenue", debit: "0.00", credit: commissionAmount.toFixed(2) },
      ]);

      for (const line of [
        { accountId: commissionExpenseAccount.id, debit: commissionAmount.toFixed(2), credit: "0.00", description: "Commission expense" },
        { accountId: commissionRevenueAccount.id, debit: "0.00", credit: commissionAmount.toFixed(2), description: "Commission revenue" },
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

      // Update journal total
      const newTotal = totalAmount + commissionAmount;
      await db.update(journalEntries).set({
        totalDebit: newTotal.toFixed(2),
        totalCredit: newTotal.toFixed(2),
      }).where(eq(journalEntries.id, journalId));
    }
  }

  // Notification
  try {
    await db.insert(notifications).values({
      tenantId,
      userId: user.id,
      title: "Ticket Approved",
      message: `Ticket ${ticket.ticketNumber} has been approved and processed.`,
      type: "success",
      category: "ticket",
      referenceType: "ticket",
      referenceId: ticket.id,
    });

    // Notify creator
    if (ticket.issuedBy && ticket.issuedBy !== user.id) {
      await db.insert(notifications).values({
        tenantId,
        userId: ticket.issuedBy,
        title: "Ticket Approved",
        message: `Your ticket ${ticket.ticketNumber} has been approved and processed.`,
        type: "success",
        category: "ticket",
        referenceType: "ticket",
        referenceId: ticket.id,
      });
    }
  } catch {
    // Non-critical
  }

  return { success: true };
}

// =====================================================
// REFUND HELPER
// =====================================================

async function refundTicket(
  db: import("./queries/connection").DbOrTx,
  ticket: typeof tickets.$inferSelect,
  user: { id: number; tenantId: number | null },
  refundAmount: number,
  penaltyAmount: number,
  reason: string,
) {
  const tenantId = user.tenantId as number;
  const totalReversal = refundAmount + penaltyAmount;

  // Extract walletId from metadata
  const metadata = getTicketMetadata(ticket);
  const walletId = metadata?.walletId ?? null;
  if (!walletId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ticket wallet not recorded" });
  }

  const userWallet = await db.query.wallets.findFirst({
    where: and(eq(wallets.id, walletId), eq(wallets.tenantId, tenantId)),
  });
  if (!userWallet) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Wallet not found" });
  }

  // Credit wallet with refund amount (atomic)
  await db.update(wallets)
    .set({ balance: sql`${wallets.balance} + ${refundAmount.toFixed(2)}` })
    .where(eq(wallets.id, userWallet.id));

  const updatedWallet = await db.query.wallets.findFirst({
    where: eq(wallets.id, userWallet.id),
  });

  await db.insert(walletTransactions).values({
    walletId: userWallet.id,
    tenantId,
    type: "refund",
    amount: refundAmount.toFixed(2),
    balanceAfter: updatedWallet!.balance,
    description: `Ticket refund: ${ticket.ticketNumber}${reason ? ` - ${reason}` : ""}`,
    referenceType: "ticket",
    referenceId: ticket.id,
    createdBy: user.id,
  });

  // Reversal journal entry
  const revenueAccount = await db.query.chartOfAccounts.findFirst({
    where: and(eq(chartOfAccounts.code, "4000"), eq(chartOfAccounts.tenantId, tenantId)),
  });
  const creditAccount = ticket.customerId
    ? await db.query.chartOfAccounts.findFirst({ where: and(eq(chartOfAccounts.code, "1200"), eq(chartOfAccounts.tenantId, tenantId)) })
    : await db.query.chartOfAccounts.findFirst({ where: and(eq(chartOfAccounts.code, "1000"), eq(chartOfAccounts.tenantId, tenantId)) });

  if (!revenueAccount || !creditAccount) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Required COA accounts missing for refund posting" });
  }

  // Get or create penalty revenue account if needed
  let penaltyAccount = null;
  if (penaltyAmount > 0) {
    penaltyAccount = await db.query.chartOfAccounts.findFirst({
      where: and(eq(chartOfAccounts.code, "4200"), eq(chartOfAccounts.tenantId, tenantId)),
    });
    if (!penaltyAccount) {
      const result = await db.insert(chartOfAccounts).values({
        tenantId,
        code: "4200",
        name: "Penalty Revenue",
        type: "revenue",
        currentBalance: "0.00",
        status: "active",
        currency: "USD",
      });
      penaltyAccount = { id: Number(result[0].insertId), code: "4200", name: "Penalty Revenue", type: "revenue" as const, currentBalance: "0.00" };
    }
  }

  const journalResult = await db.insert(journalEntries).values({
    tenantId,
    entryNumber: `JE-${Date.now()}`,
    date: new Date(),
    description: `Ticket Refund ${ticket.ticketNumber}${reason ? ` - ${reason}` : ""}`,
    referenceType: "ticket",
    referenceId: ticket.id,
    status: "posted",
    totalDebit: totalReversal.toFixed(2),
    totalCredit: totalReversal.toFixed(2),
  });
  const journalId = Number(journalResult[0].insertId ?? 0);

  if (journalId > 0) {
    const lines = [
      { journalEntryId: journalId, accountId: revenueAccount.id, description: "Revenue reversal - ticket refund", debit: totalReversal.toFixed(2), credit: "0.00" },
      { journalEntryId: journalId, accountId: creditAccount.id, description: "Cash/AR refund to customer", debit: "0.00", credit: refundAmount.toFixed(2) },
    ];
    if (penaltyAmount > 0 && penaltyAccount) {
      lines.push({ journalEntryId: journalId, accountId: penaltyAccount.id, description: "Cancellation penalty", debit: "0.00", credit: penaltyAmount.toFixed(2) });
    }

    await db.insert(journalEntryLines).values(lines);

    for (const line of lines) {
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

  // Update ticket
  await db.update(tickets).set({ status: "refunded", paymentStatus: "refunded" }).where(eq(tickets.id, ticket.id));

  // Customer transaction
  if (ticket.customerId) {
    await db.insert(customerTransactions).values({
      tenantId,
      customerId: ticket.customerId,
      ticketId: ticket.id,
      type: "refund",
      amount: refundAmount.toFixed(2),
      balance: refundAmount.toFixed(2),
      description: `Ticket refund: ${ticket.ticketNumber}${reason ? ` - ${reason}` : ""}`,
      createdBy: user.id,
    });

    // Update customer stats
    await db.update(customers).set({
      totalBookings: sql`GREATEST(0, ${customers.totalBookings} - 1)`,
      totalRevenue: sql`GREATEST(0, ${customers.totalRevenue} - ${totalReversal.toFixed(2)})`,
    }).where(eq(customers.id, ticket.customerId));

    // Cancel invoice if exists
    try {
      await db.update(invoices).set({ status: "cancelled" }).where(
        and(eq(invoices.ticketId, ticket.id), eq(invoices.tenantId, tenantId)),
      );
    } catch { /* non-critical */ }
  }

  // Notification
  try {
    await db.insert(notifications).values({
      tenantId,
      userId: user.id,
      title: "Ticket Refunded",
      message: `Ticket ${ticket.ticketNumber} has been refunded.$${refundAmount.toLocaleString()} returned${penaltyAmount > 0 ? ` (penalty: $${penaltyAmount.toLocaleString()})` : ""}.`,
      type: "warning",
      category: "ticket",
      referenceType: "ticket",
      referenceId: ticket.id,
    });
  } catch { /* non-critical */ }

  return { success: true };
}

export const ticketRouter = createRouter({
  // =====================================================
  // LIST TICKETS
  // =====================================================

  list: authedQuery
    .input(
      z
        .object({
          status: z.string().optional(),
          search: z.string().optional(),
          page: z.number().default(1),
          limit: z.number().default(20),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();

      const tenantId = ensureTicketTenant(ctx, "list");
      console.log("[Ticket query] list input:", input);

      const page =
        input?.page ?? 1;

      const limit =
        input?.limit ?? 20;

      const offset =
        (page - 1) * limit;

      const conditions = [
        eq(tickets.tenantId, tenantId),
        isNull(tickets.deletedAt),
      ];

      if (input?.status) {
        conditions.push(
          eq(
            tickets.status,
            input.status as
              | "confirmed"
              | "pending"
              | "cancelled"
              | "refunded"
              | "completed",
          ),
        );
      }

      if (input?.search) {
        conditions.push(
          or(
            like(tickets.ticketNumber, `%${input.search}%`),
            like(tickets.pnrCode, `%${input.search}%`),
            like(tickets.routeFrom, `%${input.search}%`),
            like(tickets.routeTo, `%${input.search}%`),
          )!,
        );
      }

      const where =
        conditions.length > 1
          ? and(...conditions)
          : conditions[0];

      const items = await db.select().from(tickets).where(where).limit(limit).offset(offset).orderBy(desc(tickets.createdAt));
      const ticketIds = items.map(t => t.id);
      const airlineIds = [...new Set(items.map(t => t.airlineId).filter(Boolean))] as number[];

      const airlineList = airlineIds.length > 0
        ? await db.select().from(airlines).where(and(eq(airlines.tenantId, tenantId), inArray(airlines.id, airlineIds)))
        : [];
      const airlineMap = new Map(airlineList.map(a => [a.id, a]));

      const passengerList = ticketIds.length > 0
        ? await db.select().from(ticketPassengers).where(inArray(ticketPassengers.ticketId, ticketIds))
        : [];
      const passengersByTicket = new Map<number, typeof passengerList>();
      for (const p of passengerList) {
        if (!passengersByTicket.has(p.ticketId)) passengersByTicket.set(p.ticketId, []);
        passengersByTicket.get(p.ticketId)!.push(p);
      }

      const itemsWithRelations = items.map(t => ({
        ...t,
        airline: t.airlineId ? airlineMap.get(t.airlineId) || null : null,
        passengers: passengersByTicket.get(t.id) || [],
      }));

      const countResult = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(tickets)
        .where(where);

      return {
        items: itemsWithRelations,
        total: Number(countResult[0]?.count ?? 0),
        page,
        limit,
      };
    }),

  // =====================================================
  // GET SINGLE TICKET
  // =====================================================

  get: authedQuery
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTicketTenant(ctx, "get");
      console.log("[Ticket query] get input:", input);

      const ticketResult = await db.select().from(tickets).where(
        and(eq(tickets.id, input.id), eq(tickets.tenantId, tenantId))
      ).limit(1);
      const ticket = ticketResult[0] || null;
      console.log("[Ticket query] ticket result:", ticket);

      if (!ticket) return null;

      const airlineResult = ticket.airlineId
        ? await db.select().from(airlines).where(
            and(eq(airlines.id, ticket.airlineId), eq(airlines.tenantId, tenantId))
          ).limit(1)
        : [];
      console.log("[Ticket query] airline result:", airlineResult[0] || null);

      const passengerResult = await db.select().from(ticketPassengers).where(
        eq(ticketPassengers.ticketId, ticket.id)
      );
      console.log("[Ticket query] passengers count:", passengerResult.length);

      return {
        ...ticket,
        airline: airlineResult[0] || null,
        passengers: passengerResult,
      };
    }),

  // =====================================================
  // CREATE TICKET
  // =====================================================

  create: agentQuery
    .input(
      z.object({
        ticketNumber: z.string().min(1),

        pnrCode: z.string().optional(),

        airlineId: z.number(),

        customerId: z.number().optional(),

        walletId: z.number(),

        travelDate: z
          .string()
          .refine(
            (value) =>
              !isNaN(
                new Date(value).getTime(),
              ),
            {
              message:
                "Valid travel date is required",
            },
          ),

        returnDate: z
          .string()
          .optional()
          .refine(
            (value) =>
              !value ||
              !isNaN(
                new Date(value).getTime(),
              ),
            {
              message:
                "Return date must be valid",
            },
          ),

        routeFrom: z
          .string()
          .min(2)
          .max(10),

        routeTo: z
          .string()
          .min(2)
          .max(10),

        tripType: z
          .enum([
            "one_way",
            "round_trip",
            "multi_city",
          ])
          .default("one_way"),

        class: z
          .enum([
            "economy",
            "premium_economy",
            "business",
            "first",
          ])
          .default("economy"),

        baseFare: z.string(),

        taxAmount: z.string(),

        totalAmount: z.string(),

        commissionAmount: z.string(),

        paidAmount: z.string().optional(),

        supplierCost: z.string().optional(),

        expense: z.string().optional(),

        netPayable: z.string(),

        notes: z.string().optional(),

        passengers: z
          .array(
            z.object({
              firstName: z.string(),

              lastName: z.string(),

              passengerType: z
                .enum([
                  "adult",
                  "child",
                  "infant",
                ])
                .default("adult"),

              passportNumber:
                z.string().optional(),

              nationality:
                z.string().optional(),

              seatNumber:
                z.string().optional(),
            }),
          )
          .optional(),
      }),
    )

    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      const { passengers, ...ticketData } = input;
      const tenantId = ctx.user!.tenantId as number;
      console.log("[Ticket create] input:", input);

      // Calculate auto fields
      const ticketPrice = Number(ticketData.totalAmount || "0");
      const paidAmount = Number(ticketData.paidAmount || "0");
      console.log("[ticket total]", ticketPrice);
      let paymentStatus: "pending" | "partial" | "paid" = "pending";
      if (paidAmount >= ticketPrice && ticketPrice > 0) paymentStatus = "paid";
      else if (paidAmount > 0) paymentStatus = "partial";

      // =====================================================
      // WALLET VALIDATION (early check, no deduction yet)
      // =====================================================
      const userWallet = await db.query.wallets.findFirst({
        where: and(
          eq(wallets.id, input.walletId),
          eq(wallets.tenantId, tenantId),
          eq(wallets.status, "active"),
        ),
      });
      if (!userWallet) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Wallet not found or inactive" });
      }

      // =====================================================
      // ACCOUNTING ACCOUNTS VALIDATION (early check)
      // =====================================================
      const cashAccount = await db.query.chartOfAccounts.findFirst({
        where: and(eq(chartOfAccounts.code, "1000"), eq(chartOfAccounts.tenantId, tenantId)),
      });
      const revenueAccount = await db.query.chartOfAccounts.findFirst({
        where: and(eq(chartOfAccounts.code, "4000"), eq(chartOfAccounts.tenantId, tenantId)),
      });
      if (!cashAccount || !revenueAccount) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Accounting accounts missing" });
      }

      // =====================================================
      // AIRLINE VALIDATION
      // =====================================================
      const airline = await db.query.airlines.findFirst({
        where: and(eq(airlines.id, input.airlineId), eq(airlines.tenantId, tenantId)),
      });
      if (!airline) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Airline not found" });
      }

      // =====================================================
      // CREATE TICKET (pending, no financial posting)
      // =====================================================
      const result = await db.insert(tickets).values({
        ...ticketData,
        tenantId,
        travelDate: new Date(input.travelDate),
        returnDate: input.returnDate ? new Date(input.returnDate) : undefined,
        status: "pending",
        paymentStatus,
        issuedBy: ctx.user!.id,
        metadata: { walletId: input.walletId },
      });

      const ticketId = Number(result[0].insertId);

      // =====================================================
      // PASSENGERS
      // =====================================================
      if (passengers && passengers.length > 0) {
        await db.insert(ticketPassengers).values(
          passengers.map((p) => ({ ...p, ticketId })),
        );
      }

      // =====================================================
      // NOTIFICATION
      // =====================================================
      try {
        await db.insert(notifications).values({
          tenantId,
          userId: ctx.user!.id,
          title: "New Ticket Pending Approval",
          message: `Ticket ${input.ticketNumber} has been created and is awaiting approval.`,
          type: "info",
          category: "ticket",
          referenceType: "ticket",
          referenceId: ticketId,
        });

        // Notify admins / accountants
        const admins = await db.select({ id: users.id }).from(users).where(
          and(eq(users.tenantId, tenantId), inArray(users.role, ["admin", "accountant", "super_admin"]))
        );
        if (admins.length > 0) {
          await db.insert(notifications).values(
            admins.map((u) => ({
              tenantId,
              userId: u.id,
              title: "New Ticket Pending Approval",
              message: `Ticket ${input.ticketNumber} has been created and is awaiting approval.`,
              type: "info" as const,
              category: "ticket" as const,
              referenceType: "ticket" as const,
              referenceId: ticketId,
            }))
          );
        }
      } catch {
        // Non-critical: notification failure should not block ticket creation
      }

      await auditLog({
        ctx,
        action: "create",
        entityType: "ticket",
        entityId: ticketId,
        newValues: { ticketNumber: input.ticketNumber, status: "pending", amount: input.totalAmount },
      });

      return { id: ticketId };
    }),

  // =====================================================
  // APPROVE TICKET
  // =====================================================

  approve: tenantAdminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const existing = await db.query.tickets.findFirst({
        where: and(eq(tickets.id, input.id), eq(tickets.tenantId, tenantId)),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      }
      if (existing.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ticket is not pending approval" });
      }

      const result = await db.transaction(async (tx) => {
        const fresh = await tx.query.tickets.findFirst({
          where: and(eq(tickets.id, input.id), eq(tickets.tenantId, tenantId)),
        });
        if (!fresh || fresh.status !== "pending") {
          throw new TRPCError({ code: "CONFLICT", message: "Ticket is not pending approval" });
        }
        return approveTicket(tx, fresh, ctx.user!);
      });
      await auditLog({
        ctx,
        action: "approve",
        entityType: "ticket",
        entityId: input.id,
        oldValues: { status: existing.status },
        newValues: { status: "confirmed" },
      });
      return result;
    }),

  // =====================================================
  // REJECT TICKET
  // =====================================================

  reject: tenantAdminQuery
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const existing = await db.query.tickets.findFirst({
        where: and(eq(tickets.id, input.id), eq(tickets.tenantId, tenantId)),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      }
      if (existing.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ticket is not pending approval" });
      }

      await db.update(tickets).set({ status: "cancelled", paymentStatus: "cancelled" }).where(eq(tickets.id, input.id));

      try {
        await db.insert(notifications).values({
          tenantId,
          userId: ctx.user!.id,
          title: "Ticket Rejected",
          message: `Ticket ${existing.ticketNumber} has been rejected. ${input.reason || ""}`,
          type: "warning",
          category: "ticket",
          referenceType: "ticket",
          referenceId: existing.id,
        });

        // Notify creator
        if (existing.issuedBy && existing.issuedBy !== ctx.user!.id) {
          await db.insert(notifications).values({
            tenantId,
            userId: existing.issuedBy,
            title: "Ticket Rejected",
            message: `Your ticket ${existing.ticketNumber} has been rejected. ${input.reason || ""}`,
            type: "warning",
            category: "ticket",
            referenceType: "ticket",
            referenceId: existing.id,
          });
        }
      } catch {
        // Non-critical
      }

      await auditLog({
        ctx,
        action: "reject",
        entityType: "ticket",
        entityId: input.id,
        oldValues: { status: existing.status },
        newValues: { status: "cancelled", reason: input.reason },
      });

      return { success: true };
    }),

  // =====================================================
  // REFUND TICKET
  // =====================================================

  refund: tenantAdminQuery
    .input(z.object({
      id: z.number(),
      refundAmount: z.string().min(1),
      penaltyAmount: z.string().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const refundAmount = Number(input.refundAmount);
      const penaltyAmount = Number(input.penaltyAmount || "0");

      if (isNaN(refundAmount) || refundAmount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Refund amount must be positive" });
      }
      if (isNaN(penaltyAmount) || penaltyAmount < 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Penalty amount cannot be negative" });
      }

      const existing = await db.query.tickets.findFirst({
        where: and(eq(tickets.id, input.id), eq(tickets.tenantId, tenantId)),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      }
      if (!["confirmed", "completed"].includes(existing.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only confirmed or completed tickets can be refunded" });
      }

      const totalAmount = Number(existing.totalAmount);
      if (refundAmount + penaltyAmount > totalAmount) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Refund + penalty cannot exceed ticket total" });
      }

      // Concurrency protection: prevent double-refund
      if (existing.status === "refunded") {
        throw new TRPCError({ code: "CONFLICT", message: "Ticket already refunded" });
      }

      const result = await db.transaction(async (tx) => {
        const fresh = await tx.query.tickets.findFirst({
          where: and(eq(tickets.id, input.id), eq(tickets.tenantId, tenantId)),
        });
        if (!fresh || !["confirmed", "completed"].includes(fresh.status)) {
          throw new TRPCError({ code: "CONFLICT", message: "Ticket cannot be refunded" });
        }
        if (fresh.status === "refunded") {
          throw new TRPCError({ code: "CONFLICT", message: "Ticket already refunded" });
        }
        return refundTicket(tx, fresh, ctx.user!, refundAmount, penaltyAmount, input.reason || "");
      });

      await auditLog({
        ctx,
        action: "refund",
        entityType: "ticket",
        entityId: input.id,
        oldValues: { status: existing.status, totalAmount: existing.totalAmount },
        newValues: { status: "refunded", refundAmount: input.refundAmount, penaltyAmount: input.penaltyAmount, reason: input.reason },
      });

      return result;
    }),

  // =====================================================
  // UPDATE STATUS (simple transitions, approval goes through approve/reject)
  // =====================================================

  updateStatus: tenantAdminQuery
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["confirmed", "pending", "cancelled", "refunded", "completed"]),
        paymentStatus: z.enum(["pending", "partial", "paid", "refunded", "cancelled"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const existing = await db.query.tickets.findFirst({
        where: and(eq(tickets.id, input.id), eq(tickets.tenantId, tenantId)),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      }

      // Redirect pending→confirmed to approve workflow
      if (existing.status === "pending" && input.status === "confirmed") {
        return db.transaction(async (tx) => {
          const fresh = await tx.query.tickets.findFirst({
            where: and(eq(tickets.id, input.id), eq(tickets.tenantId, tenantId)),
          });
          if (!fresh || fresh.status !== "pending") {
            throw new TRPCError({ code: "CONFLICT", message: "Ticket is not pending approval" });
          }
          return approveTicket(tx, fresh, ctx.user!);
        });
      }

      const update: Record<string, string> = { status: input.status };
      if (input.paymentStatus) update.paymentStatus = input.paymentStatus;

      await db.update(tickets).set(update).where(eq(tickets.id, input.id));

      return { success: true };
    }),

  // =====================================================
  // AIRLINES
  // =====================================================

  airlines: authedQuery.query(
    async ({ ctx }) => {
      const db = getDb();

      return db.query.airlines.findMany(
        {
          where: and(
            eq(
              airlines.status,
              "active",
            ),

            eq(
              airlines.tenantId,
              ctx.user!
                .tenantId as number,
            ),
          ),

          orderBy: [
            asc(airlines.name),
          ],
        },
      );
    },
  ),

  // =====================================================
  // STATS
  // =====================================================

  stats: authedQuery.query(
    async ({ ctx }) => {
      const db = getDb();

      const tenantId =
        ctx.user!.tenantId as number;

      const statusCounts =
        await db
          .select({
            status:
              tickets.status,

            count:
              sql<number>`count(*)`,
          })
          .from(tickets)
          .where(
            eq(
              tickets.tenantId,
              tenantId,
            ),
          )
          .groupBy(
            tickets.status,
          );

      const revenue =
        await db
          .select({
            total:
              sql<number>`COALESCE(SUM(total_amount), 0)`,
          })
          .from(tickets)
          .where(
            eq(
              tickets.tenantId,
              tenantId,
            ),
          );

      return {
        statusCounts,

        totalRevenue: Number(
          revenue[0]?.total ?? 0,
        ),
      };
    },
  ),

  // =====================================================
  // DELETE
  // =====================================================

  delete: tenantAdminQuery
    .input(
      z.object({
        id: z.number(),
      }),
    )

    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      // Soft delete: mark ticket as deleted instead of hard delete
      await db.update(tickets).set({
        deletedAt: new Date(),
        deletedBy: ctx.user!.id,
      }).where(
        and(
          eq(tickets.id, input.id),
          eq(tickets.tenantId, tenantId),
        ),
      );

      return {
        success: true,
      };
    }),
});