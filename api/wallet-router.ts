import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, tenantAdminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { wallets, walletTransactions, notifications } from "@db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { auditLog } from "./lib/audit";

export const walletRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    console.log("[Wallet query] list tenantId:", ctx.user?.tenantId);
    return db.query.wallets.findMany({
      where: eq(wallets.tenantId, ctx.user!.tenantId as number),
      orderBy: [desc(wallets.createdAt)],
    });
  }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      console.log("[Wallet query] get input:", input, "tenantId:", ctx.user?.tenantId);
      return db.query.wallets.findFirst({
        where: and(
          eq(wallets.id, input.id),
          eq(wallets.tenantId, ctx.user!.tenantId as number),
        ),
      });
    }),

  allTransactions: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    console.log("[Wallet query] allTransactions tenantId:", ctx.user?.tenantId);
    return db.query.walletTransactions.findMany({
  where: eq(
    walletTransactions.tenantId,
    ctx.user!.tenantId as number,
  ),

  orderBy: [
    desc(walletTransactions.createdAt),
  ],

  limit: 100,
});
  }),

  transfer: tenantAdminQuery
    .input(
      z.object({
        fromWalletId: z.number(),
        toWalletId: z.number(),
        amount: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const amount = Number(input.amount);
      console.log("[Wallet transfer] input:", input, "tenantId:", ctx.user?.tenantId);

      if (input.fromWalletId === input.toWalletId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source and destination wallets must be different.",
        });
      }

      if (isNaN(amount) || amount <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transfer amount must be a positive number.",
        });
      }

      const description = input.description?.trim() || "Wallet transfer";

      await db.transaction(async (tx) => {
        const fromWallet = await tx.query.wallets.findFirst({
          where: and(eq(wallets.id, input.fromWalletId), eq(wallets.tenantId, ctx.user!.tenantId as number)),
        });
        const toWallet = await tx.query.wallets.findFirst({
          where: and(eq(wallets.id, input.toWalletId), eq(wallets.tenantId, ctx.user!.tenantId as number)),
        });

        if (!fromWallet) throw new TRPCError({ code: "NOT_FOUND", message: "Source wallet not found." });
        if (!toWallet) throw new TRPCError({ code: "NOT_FOUND", message: "Destination wallet not found." });
        if (fromWallet.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "Source wallet is not active." });
        if (toWallet.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "Destination wallet is not active." });

        const reservedBalance = Number(fromWallet.reservedBalance ?? 0);
        const availableBalance = Number(fromWallet.balance) - reservedBalance;
        if (availableBalance < amount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: reservedBalance > 0
              ? `Insufficient available balance. Reserved: $${reservedBalance.toLocaleString()}`
              : "Insufficient wallet balance.",
          });
        }

        // Atomic debit with WHERE guard against negative balance
        const debitResult = await tx
          .update(wallets)
          .set({ balance: sql`${wallets.balance} - ${amount.toFixed(2)}` })
          .where(and(eq(wallets.id, input.fromWalletId), sql`${wallets.balance} >= ${amount.toFixed(2)}`));
        if (debitResult[0].affectedRows === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient wallet balance." });
        }

        // Atomic credit
        await tx
          .update(wallets)
          .set({ balance: sql`${wallets.balance} + ${amount.toFixed(2)}` })
          .where(eq(wallets.id, input.toWalletId));

        // Read back actual balances for transaction log
        const updatedFrom = await tx.query.wallets.findFirst({
          where: eq(wallets.id, input.fromWalletId),
        });
        const updatedTo = await tx.query.wallets.findFirst({
          where: eq(wallets.id, input.toWalletId),
        });

        await tx.insert(walletTransactions).values([
          {
            walletId: input.fromWalletId,
            tenantId: ctx.user!.tenantId as number,
            type: "debit",
            amount: amount.toFixed(2),
            balanceAfter: updatedFrom!.balance,
            description: `${description} (outgoing)`,
            createdBy: ctx.user!.id,
          },
          {
            walletId: input.toWalletId,
            tenantId: ctx.user!.tenantId as number,
            type: "credit",
            amount: amount.toFixed(2),
            balanceAfter: updatedTo!.balance,
            description: `${description} (incoming)`,
            createdBy: ctx.user!.id,
          },
        ]);
      });

      await auditLog({
        ctx,
        action: "transfer",
        entityType: "wallet",
        entityId: input.fromWalletId,
        newValues: { fromWalletId: input.fromWalletId, toWalletId: input.toWalletId, amount: input.amount },
      });

      // Notify on transfer
      try {
        await getDb().insert(notifications).values({
          tenantId: ctx.user!.tenantId as number,
          userId: ctx.user!.id,
          title: "Wallet Transfer",
          message: `$${Number(input.amount).toLocaleString()} transferred between wallets.`,
          type: "info",
          category: "wallet",
          referenceType: "wallet",
          referenceId: input.fromWalletId,
        });
      } catch { /* non-critical */ }

      return {
        success: true,
      };
    }),

create: tenantAdminQuery
  .input(
    z.object({
      name: z.string().min(1),

      currency: z.string().default("USD"),

      initialBalance: z.string().refine((value) => !value || (!isNaN(Number(value)) && Number(value) >= 0), { message: "Initial balance must be a valid non-negative number" }).optional(),

      userId: z.number().optional(),

      customerId: z.number().optional(),
    }),
  )

  .mutation(async ({ input, ctx }) => {
    const db = getDb();

    const initialBalance = Number(
      input.initialBalance || "0",
    );
    console.log("[Wallet create] input:", input, "tenantId:", ctx.user?.tenantId);

    const tenantId = ctx.user!.tenantId as number;
    if (tenantId == null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context missing" });
    }

    const result = await db
      .insert(wallets)
      .values({
        tenantId,
        name: input.name,
        currency: input.currency,
        userId: input.userId ?? null,
        customerId: input.customerId,
        balance: initialBalance.toFixed(2),
        reservedBalance: "0.00",
        creditLimit: "0.00",
        dueBalance: "0.00",
        status: "active",
      });

    const walletId = Number(
      result[0].insertId,
    );

    // Create initial transaction
    if (initialBalance > 0) {
      await db
        .insert(walletTransactions)
        .values({
          walletId,

          tenantId: ctx.user!.tenantId as number,

          type: "credit",

          amount:
            initialBalance.toFixed(2),

          balanceAfter:
            initialBalance.toFixed(2),

          description:
            "Initial wallet funding",

          createdBy: ctx.user!.id,
        });
    }

    return {
      id: walletId,
    };
  }),

  lockFunds: tenantAdminQuery
    .input(z.object({
      walletId: z.number(),
      amount: z.string().min(1),
      description: z.string().optional(),
      referenceType: z.string().optional(),
      referenceId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const amount = Number(input.amount);

      if (isNaN(amount) || amount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Amount must be positive" });
      }

      await db.transaction(async (tx) => {
        const wallet = await tx.query.wallets.findFirst({
          where: and(eq(wallets.id, input.walletId), eq(wallets.tenantId, tenantId)),
        });
        if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });
        if (wallet.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "Wallet is not active" });

        const balance = Number(wallet.balance);
        const reserved = Number(wallet.reservedBalance ?? 0);
        const available = balance - reserved;

        if (available < amount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Insufficient available balance. Available: $${available.toLocaleString()}, Requested: $${amount.toLocaleString()}`,
          });
        }

        // Atomic increment of reserved balance
        await tx.update(wallets)
          .set({ reservedBalance: sql`${wallets.reservedBalance} + ${amount.toFixed(2)}` })
          .where(eq(wallets.id, wallet.id));

        const updated = await tx.query.wallets.findFirst({
          where: eq(wallets.id, wallet.id),
        });

        await tx.insert(walletTransactions).values({
          walletId: wallet.id,
          tenantId,
          type: "lock",
          amount: amount.toFixed(2),
          balanceAfter: updated!.balance,
          description: input.description || "Funds locked",
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          createdBy: ctx.user!.id,
        });

        await auditLog({ ctx, action: "lock", entityType: "wallet", entityId: wallet.id, newValues: { amount: input.amount, description: input.description } });
        return { success: true, reservedBalance: updated!.reservedBalance };
      });
    }),

  unlockFunds: tenantAdminQuery
    .input(z.object({
      walletId: z.number(),
      amount: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const amount = Number(input.amount);

      if (isNaN(amount) || amount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Amount must be positive" });
      }

      await db.transaction(async (tx) => {
        const wallet = await tx.query.wallets.findFirst({
          where: and(eq(wallets.id, input.walletId), eq(wallets.tenantId, tenantId)),
        });
        if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });

        const reserved = Number(wallet.reservedBalance ?? 0);
        if (reserved < amount) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot unlock more than reserved amount. Reserved: $${reserved.toLocaleString()}` });
        }

        // Atomic decrement with guard
        const result = await tx.update(wallets)
          .set({ reservedBalance: sql`${wallets.reservedBalance} - ${amount.toFixed(2)}` })
          .where(and(eq(wallets.id, wallet.id), sql`${wallets.reservedBalance} >= ${amount.toFixed(2)}`));
        if (result[0].affectedRows === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot unlock more than reserved amount." });
        }

        const updated = await tx.query.wallets.findFirst({
          where: eq(wallets.id, wallet.id),
        });

        await tx.insert(walletTransactions).values({
          walletId: wallet.id,
          tenantId,
          type: "unlock",
          amount: amount.toFixed(2),
          balanceAfter: updated!.balance,
          description: input.description || "Funds unlocked",
          createdBy: ctx.user!.id,
        });

        await auditLog({ ctx, action: "unlock", entityType: "wallet", entityId: wallet.id, newValues: { amount: input.amount, description: input.description } });
        return { success: true, reservedBalance: updated!.reservedBalance };
      });
    }),

  statement: authedQuery
    .input(z.object({ walletId: z.number(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const wallet = await db.query.wallets.findFirst({
        where: and(eq(wallets.id, input.walletId), eq(wallets.tenantId, tenantId)),
      });
      if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });

      const items = await db.select().from(walletTransactions)
        .where(and(eq(walletTransactions.walletId, input.walletId), eq(walletTransactions.tenantId, tenantId)))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(input.limit)
        .offset((input.page - 1) * input.limit);

      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(walletTransactions)
        .where(and(eq(walletTransactions.walletId, input.walletId), eq(walletTransactions.tenantId, tenantId)));

      return { wallet, items, total: countResult[0]?.count ?? 0 };
    }),

  reconcile: authedQuery
    .input(z.object({ walletId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const wallet = await db.query.wallets.findFirst({
        where: and(eq(wallets.id, input.walletId), eq(wallets.tenantId, tenantId)),
      });
      if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });

      const txSum = await db.select({
        credits: sql<number>`COALESCE(SUM(CASE WHEN type IN ('credit','refund','unlock') THEN amount ELSE 0 END), 0)`,
        debits: sql<number>`COALESCE(SUM(CASE WHEN type IN ('debit','lock','fee','commission') THEN amount ELSE 0 END), 0)`,
      })
        .from(walletTransactions)
        .where(and(eq(walletTransactions.walletId, input.walletId), eq(walletTransactions.tenantId, tenantId)));

      const expectedBalance = Number(txSum[0]?.credits ?? 0) - Number(txSum[0]?.debits ?? 0);
      const actualBalance = Number(wallet.balance);
      const discrepancy = actualBalance - expectedBalance;

      return {
        walletId: wallet.id,
        walletName: wallet.name,
        expectedBalance,
        actualBalance,
        discrepancy,
        isBalanced: Math.abs(discrepancy) < 0.01,
      };
    }),
});