/**
 * Centralized System Settings Service
 *
 * Provides typed access to tenant-scoped configuration stored in
 * the `system_settings` table. Supports both predefined typed settings
 * and arbitrary key-value storage.
 *
 * Categories:
 * - general: company info
 * - currency: default_currency, supported_currencies
 * - tax: default_tax_rate, tax_inclusive_pricing
 * - commission: default_commission_rate, commission_auto_post
 * - approval: *_approval_required flags
 * - numbering: prefix overrides, year_reset
 * - notifications: notification preferences
 */

import { eq, and } from "drizzle-orm";
import { systemSettings } from "@db/schema";
import type { DbOrTx } from "../queries/connection";

export type SettingCategory =
  | "general"
  | "currency"
  | "tax"
  | "commission"
  | "approval"
  | "numbering"
  | "notifications";

export interface SettingDefinition {
  key: string;
  category: SettingCategory;
  defaultValue: string;
  description: string;
  type: "string" | "number" | "boolean" | "json";
}

/** Predefined typed settings registry */
export const SETTING_DEFINITIONS: SettingDefinition[] = [
  // General
  { key: "company_name", category: "general", defaultValue: "", type: "string", description: "Company legal name" },
  { key: "company_address", category: "general", defaultValue: "", type: "string", description: "Company address" },
  { key: "company_phone", category: "general", defaultValue: "", type: "string", description: "Company phone" },
  { key: "company_email", category: "general", defaultValue: "", type: "string", description: "Company email" },

  // Currency
  { key: "default_currency", category: "currency", defaultValue: "USD", type: "string", description: "Default currency code" },
  { key: "supported_currencies", category: "currency", defaultValue: '["USD","AFN","EUR","AED"]', type: "json", description: "Supported currency codes" },

  // Tax
  { key: "default_tax_rate", category: "tax", defaultValue: "0", type: "number", description: "Default tax rate percentage" },
  { key: "tax_inclusive_pricing", category: "tax", defaultValue: "false", type: "boolean", description: "Prices include tax by default" },

  // Commission
  { key: "default_commission_rate", category: "commission", defaultValue: "0", type: "number", description: "Default commission rate percentage" },
  { key: "commission_auto_post", category: "commission", defaultValue: "true", type: "boolean", description: "Auto-post commission journal entries" },

  // Approval
  { key: "ticket_approval_required", category: "approval", defaultValue: "true", type: "boolean", description: "Tickets require manager approval" },
  { key: "expense_approval_required", category: "approval", defaultValue: "true", type: "boolean", description: "Expenses require manager approval" },
  { key: "deposit_approval_required", category: "approval", defaultValue: "true", type: "boolean", description: "Deposits require manager approval" },

  // Numbering
  { key: "invoice_prefix", category: "numbering", defaultValue: "INV", type: "string", description: "Invoice number prefix" },
  { key: "deposit_prefix", category: "numbering", defaultValue: "MZR", type: "string", description: "Deposit code prefix" },
  { key: "ticket_prefix", category: "numbering", defaultValue: "TCK", type: "string", description: "Ticket number prefix" },
  { key: "bill_prefix", category: "numbering", defaultValue: "BILL", type: "string", description: "Bill number prefix" },
  { key: "payment_prefix", category: "numbering", defaultValue: "SP", type: "string", description: "Supplier payment prefix" },
  { key: "supplier_prefix", category: "numbering", defaultValue: "SUP", type: "string", description: "Supplier code prefix" },
  { key: "expense_prefix", category: "numbering", defaultValue: "EXP", type: "string", description: "Expense reference prefix" },
  { key: "journal_prefix", category: "numbering", defaultValue: "JE", type: "string", description: "Journal entry prefix" },
  { key: "numbering_year_reset", category: "numbering", defaultValue: "true", type: "boolean", description: "Reset sequence numbers yearly" },

  // Notifications
  { key: "email_notifications_enabled", category: "notifications", defaultValue: "false", type: "boolean", description: "Enable email notifications" },
  { key: "notify_on_ticket_booking", category: "notifications", defaultValue: "true", type: "boolean", description: "Notify admins on new ticket" },
  { key: "notify_on_deposit", category: "notifications", defaultValue: "true", type: "boolean", description: "Notify admins on deposit request" },
  { key: "notify_on_expense", category: "notifications", defaultValue: "true", type: "boolean", description: "Notify admins on expense submission" },
];

const DEFINITION_MAP = new Map(SETTING_DEFINITIONS.map((d) => [d.key, d]));

/** Seed default settings for a tenant if they don't exist */
export async function seedDefaultSettings(
  db: DbOrTx,
  tenantId: number,
  userId: number
): Promise<void> {
  const existing = await db
    .select({ key: systemSettings.key })
    .from(systemSettings)
    .where(eq(systemSettings.tenantId, tenantId));

  const existingKeys = new Set(existing.map((r) => r.key));
  const missing = SETTING_DEFINITIONS.filter((d) => !existingKeys.has(d.key));

  if (missing.length > 0) {
    await db.insert(systemSettings).values(
      missing.map((d) => ({
        tenantId,
        key: d.key,
        value: d.defaultValue,
        category: d.category,
        description: d.description,
        updatedBy: userId,
      }))
    );
  }
}

/** Get a raw string value for a setting */
export async function getSetting(
  db: DbOrTx,
  tenantId: number,
  key: string
): Promise<string | null> {
  const row = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(and(eq(systemSettings.tenantId, tenantId), eq(systemSettings.key, key)))
    .limit(1);

  if (row[0]?.value !== undefined && row[0]?.value !== null) {
    return row[0].value;
  }

  const def = DEFINITION_MAP.get(key);
  return def?.defaultValue ?? null;
}

/** Set a setting value (insert or update) */
export async function setSetting(
  db: DbOrTx,
  tenantId: number,
  key: string,
  value: string,
  userId: number,
  category?: string,
  description?: string
): Promise<void> {
  const def = DEFINITION_MAP.get(key);
  const existing = await db
    .select({ id: systemSettings.id })
    .from(systemSettings)
    .where(and(eq(systemSettings.tenantId, tenantId), eq(systemSettings.key, key)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(systemSettings)
      .set({ value, updatedBy: userId, updatedAt: new Date() })
      .where(eq(systemSettings.id, existing[0].id));
  } else {
    await db.insert(systemSettings).values({
      tenantId,
      key,
      value,
      category: category || def?.category || "general",
      description: description || def?.description || "",
      updatedBy: userId,
    });
  }
}

/** Get all settings for a tenant grouped by category */
export async function getAllSettings(
  db: DbOrTx,
  tenantId: number
): Promise<Record<string, { key: string; value: string; category: string; description: string | null }[]>> {
  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.tenantId, tenantId))
    .orderBy(systemSettings.category, systemSettings.key);

  const grouped: Record<string, any[]> = {};
  for (const row of rows) {
    const cat = row.category || "general";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      key: row.key,
      value: row.value,
      category: row.category,
      description: row.description,
    });
  }

  // Fill in missing defaults
  for (const def of SETTING_DEFINITIONS) {
    const cat = def.category;
    if (!grouped[cat]) grouped[cat] = [];
    const exists = grouped[cat].some((r) => r.key === def.key);
    if (!exists) {
      grouped[cat].push({
        key: def.key,
        value: def.defaultValue,
        category: def.category,
        description: def.description,
      });
    }
  }

  return grouped;
}

/** Typed getters */
export async function getStringSetting(db: DbOrTx, tenantId: number, key: string): Promise<string> {
  return (await getSetting(db, tenantId, key)) || "";
}

export async function getNumberSetting(db: DbOrTx, tenantId: number, key: string): Promise<number> {
  const val = await getSetting(db, tenantId, key);
  return val ? Number(val) : 0;
}

export async function getBooleanSetting(db: DbOrTx, tenantId: number, key: string): Promise<boolean> {
  const val = await getSetting(db, tenantId, key);
  return val === "true" || val === "1";
}

export async function getJsonSetting<T = any>(db: DbOrTx, tenantId: number, key: string): Promise<T | null> {
  const val = await getSetting(db, tenantId, key);
  if (!val) return null;
  try {
    return JSON.parse(val) as T;
  } catch {
    return null;
  }
}
