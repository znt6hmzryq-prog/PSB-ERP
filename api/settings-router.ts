import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, tenantAdminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { systemSettings } from "@db/schema";
import { eq, and } from "drizzle-orm";
import {
  getAllSettings,
  getSetting,
  setSetting,
  seedDefaultSettings,
  SETTING_DEFINITIONS,
} from "./lib/settings";
import { auditLog } from "./lib/audit";

export const settingsRouter = createRouter({
  // ─── LIST ALL SETTINGS (grouped by category) ───────────────────────────────
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;
    await seedDefaultSettings(db, tenantId, ctx.user!.id);
    return getAllSettings(db, tenantId);
  }),

  // ─── GET SINGLE SETTING ────────────────────────────────────────────────────
  get: authedQuery
    .input(z.object({ key: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const value = await getSetting(db, tenantId, input.key);
      const def = SETTING_DEFINITIONS.find((d) => d.key === input.key);
      return {
        key: input.key,
        value: value ?? def?.defaultValue ?? null,
        category: def?.category ?? "general",
        type: def?.type ?? "string",
        description: def?.description ?? "",
      };
    }),

  // ─── UPDATE SETTING ────────────────────────────────────────────────────────
  update: tenantAdminQuery
    .input(
      z.object({
        key: z.string().min(1),
        value: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const userId = ctx.user!.id;

      const def = SETTING_DEFINITIONS.find((d) => d.key === input.key);

      // Validate type
      if (def?.type === "number" && isNaN(Number(input.value))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `"${input.key}" must be a number` });
      }
      if (def?.type === "boolean" && !["true", "false", "1", "0"].includes(input.value)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `"${input.key}" must be true or false` });
      }
      if (def?.type === "json") {
        try {
          JSON.parse(input.value);
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: `"${input.key}" must be valid JSON` });
        }
      }

      await setSetting(db, tenantId, input.key, input.value, userId);

      await auditLog({
        ctx,
        action: "update_setting",
        entityType: "system_setting",
        oldValues: { key: input.key },
        newValues: { key: input.key, value: input.value },
      });

      return { success: true };
    }),

  // ─── BULK UPDATE SETTINGS ──────────────────────────────────────────────────
  bulkUpdate: tenantAdminQuery
    .input(
      z.object({
        settings: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const userId = ctx.user!.id;

      for (const [key, value] of Object.entries(input.settings)) {
        await setSetting(db, tenantId, key, value, userId);
      }

      await auditLog({
        ctx,
        action: "bulk_update_settings",
        entityType: "system_setting",
        newValues: { keys: Object.keys(input.settings) },
      });

      return { success: true, updated: Object.keys(input.settings).length };
    }),

  // ─── DELETE CUSTOM SETTING ─────────────────────────────────────────────────
  delete: tenantAdminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const existing = await db
        .select({ id: systemSettings.id, key: systemSettings.key })
        .from(systemSettings)
        .where(and(eq(systemSettings.id, input.id), eq(systemSettings.tenantId, tenantId)))
        .limit(1);

      if (!existing[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Setting not found" });
      }

      await db.delete(systemSettings).where(eq(systemSettings.id, input.id));

      await auditLog({
        ctx,
        action: "delete_setting",
        entityType: "system_setting",
        oldValues: { key: existing[0].key },
      });

      return { success: true };
    }),

  // ─── GET NUMBERING PREFIXES (convenience endpoint) ─────────────────────────
  numbering: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;
    const keys = [
      "invoice_prefix",
      "deposit_prefix",
      "ticket_prefix",
      "bill_prefix",
      "payment_prefix",
      "supplier_prefix",
      "expense_prefix",
      "journal_prefix",
      "numbering_year_reset",
    ];
    const result: Record<string, string> = {};
    for (const key of keys) {
      result[key] = (await getSetting(db, tenantId, key)) || "";
    }
    return result;
  }),

  // ─── GET APPROVAL RULES (convenience endpoint) ─────────────────────────────
  approvalRules: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;
    const keys = [
      "ticket_approval_required",
      "expense_approval_required",
      "deposit_approval_required",
    ];
    const result: Record<string, boolean> = {};
    for (const key of keys) {
      const val = await getSetting(db, tenantId, key);
      result[key] = val === "true" || val === "1";
    }
    return result;
  }),

  // ─── GET CURRENCY CONFIG (convenience endpoint) ────────────────────────────
  currency: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;
    const defaultCurrency = (await getSetting(db, tenantId, "default_currency")) || "USD";
    const supportedRaw = (await getSetting(db, tenantId, "supported_currencies")) || '["USD"]';

    let supported: string[] = [];
    try {
      supported = JSON.parse(supportedRaw);
    } catch {
      supported = ["USD"];
    }

    return { defaultCurrency, supported };
  }),
});
