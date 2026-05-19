import {
  mysqlTable,
  mysqlEnum,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  decimal,
  json,
  boolean,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─────────────────────────────────────────────────────────────────────────────
// 1. TENANCY
// ─────────────────────────────────────────────────────────────────────────────
export const tenants = mysqlTable("tenants", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  domain: varchar("domain", { length: 255 }),
  logo: text("logo"),
  settings: json("settings"),
  status: mysqlEnum("status", ["active", "suspended", "trial", "cancelled", "pending", "rejected"]).default("trial").notNull(),
  plan: mysqlEnum("plan", ["free", "starter", "professional", "enterprise"]).default("free").notNull(),
  trialEndsAt: timestamp("trial_ends_at"),
  registrationToken: varchar("registration_token", { length: 50 }),
  ownerName: varchar("owner_name", { length: 255 }),
  ownerEmail: varchar("owner_email", { length: 320 }),
  ownerPhone: varchar("owner_phone", { length: 50 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("tenants_token_unique").on(table.registrationToken),
]);

export type Tenant = typeof tenants.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 1b. SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────────────────────
export const subscriptions = mysqlTable("subscriptions", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  plan: mysqlEnum("plan", ["free", "starter", "professional", "enterprise"]).default("free").notNull(),
  durationMonths: int("duration_months").default(1).notNull(),
  status: mysqlEnum("status", ["pending", "active", "expired", "cancelled"]).default("pending").notNull(),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  approvedBy: bigint("approved_by", { mode: "number", unsigned: true }).references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("subs_tenant_idx").on(table.tenantId),
  index("subs_status_idx").on(table.status),
  index("subs_expires_idx").on(table.expiresAt),
]);

export type Subscription = typeof subscriptions.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTHENTICATION & RBAC
// ─────────────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).references(() => tenants.id),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["super_admin", "admin", "manager", "accountant", "agent", "viewer"]).default("agent").notNull(),
  status: mysqlEnum("status", ["active", "inactive", "suspended"]).default("active").notNull(),
  department: varchar("department", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  lastSignInAt: timestamp("last_sign_in_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;

export const roles = mysqlTable("roles", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  description: text("description"),
  permissions: json("permissions"),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Role = typeof roles.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 3. WALLETS
// ─────────────────────────────────────────────────────────────────────────────
export const wallets = mysqlTable("wallets", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number", unsigned: true }).references(() => users.id),
  customerId: bigint("customer_id", { mode: "number", unsigned: true }),
  name: varchar("name", { length: 255 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  reservedBalance: decimal("reserved_balance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  creditLimit: decimal("credit_limit", { precision: 15, scale: 2 }).default("0.00").notNull(),
  dueBalance: decimal("due_balance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  status: mysqlEnum("status", ["active", "frozen", "closed"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Wallet = typeof wallets.$inferSelect;

export const walletTransactions = mysqlTable("wallet_transactions", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  walletId: bigint("wallet_id", { mode: "number", unsigned: true }).notNull().references(() => wallets.id),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  type: mysqlEnum("type", ["credit", "debit", "refund", "transfer", "fee", "commission", "lock", "unlock"]).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: bigint("reference_id", { mode: "number", unsigned: true }),
  metadata: json("metadata"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("wallet_id_idx").on(table.walletId),
  index("tenant_id_idx").on(table.tenantId),
]);

export type WalletTransaction = typeof walletTransactions.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 4. TICKETING
// ─────────────────────────────────────────────────────────────────────────────
export const airlines = mysqlTable("airlines", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  code: varchar("code", { length: 10 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  logo: text("logo"),
  iataCode: varchar("iata_code", { length: 5 }),
  icaoCode: varchar("icao_code", { length: 5 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Airline = typeof airlines.$inferSelect;

export const tickets = mysqlTable("tickets", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  ticketNumber: varchar("ticket_number", { length: 50 }).notNull(),
  pnrCode: varchar("pnr_code", { length: 20 }),
  airlineId: bigint("airline_id", { mode: "number", unsigned: true }).references(() => airlines.id),
  customerId: bigint("customer_id", { mode: "number", unsigned: true }),
  bookingDate: timestamp("booking_date").defaultNow().notNull(),
  travelDate: date("travel_date"),
  returnDate: date("return_date"),
  routeFrom: varchar("route_from", { length: 10 }).notNull(),
  routeTo: varchar("route_to", { length: 10 }).notNull(),
  tripType: mysqlEnum("trip_type", ["one_way", "round_trip", "multi_city"]).default("one_way").notNull(),
  class: mysqlEnum("class", ["economy", "premium_economy", "business", "first"]).default("economy").notNull(),
  baseFare: decimal("base_fare", { precision: 12, scale: 2 }).default("0.00").notNull(),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  commissionAmount: decimal("commission_amount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  supplierCost: decimal("supplier_cost", { precision: 12, scale: 2 }).default("0.00").notNull(),
  expense: decimal("expense", { precision: 12, scale: 2 }).default("0.00").notNull(),
  netPayable: decimal("net_payable", { precision: 12, scale: 2 }).default("0.00").notNull(),
  paymentStatus: mysqlEnum("payment_status", ["pending", "partial", "paid", "refunded", "cancelled"]).default("pending").notNull(),
  status: mysqlEnum("status", ["confirmed", "pending", "cancelled", "refunded", "completed"]).default("pending").notNull(),
  issuedBy: bigint("issued_by", { mode: "number", unsigned: true }).references(() => users.id),
  notes: text("notes"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
  deletedBy: bigint("deleted_by", { mode: "number", unsigned: true }).references(() => users.id),
});

export type Ticket = typeof tickets.$inferSelect;

export const ticketPassengers = mysqlTable("ticket_passengers", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  ticketId: bigint("ticket_id", { mode: "number", unsigned: true }).notNull().references(() => tickets.id),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  passengerType: mysqlEnum("passenger_type", ["adult", "child", "infant"]).default("adult").notNull(),
  passportNumber: varchar("passport_number", { length: 50 }),
  nationality: varchar("nationality", { length: 100 }),
  dateOfBirth: date("date_of_birth"),
  seatNumber: varchar("seat_number", { length: 10 }),
  specialRequests: text("special_requests"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TicketPassenger = typeof ticketPassengers.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 5. CRM
// ─────────────────────────────────────────────────────────────────────────────
export const customers = mysqlTable("customers", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  customerCode: varchar("customer_code", { length: 50 }).notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  alternatePhone: varchar("alternate_phone", { length: 50 }),
  company: varchar("company", { length: 255 }),
  jobTitle: varchar("job_title", { length: 100 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  postalCode: varchar("postal_code", { length: 20 }),
  customerType: mysqlEnum("customer_type", ["individual", "corporate", "agent"]).default("individual").notNull(),
  status: mysqlEnum("status", ["active", "inactive", "blacklisted", "vip"]).default("active").notNull(),
  source: varchar("source", { length: 50 }),
  notes: text("notes"),
  totalBookings: int("total_bookings").default(0).notNull(),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).default("0.00").notNull(),
  lastBookingDate: timestamp("last_booking_date"),
  assignedTo: bigint("assigned_to", { mode: "number", unsigned: true }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
  deletedBy: bigint("deleted_by", { mode: "number", unsigned: true }).references(() => users.id),
});

export type Customer = typeof customers.$inferSelect;

export const leads = mysqlTable("leads", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 255 }),
  source: varchar("source", { length: 50 }),
  status: mysqlEnum("status", ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]).default("new").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
  estimatedValue: decimal("estimated_value", { precision: 12, scale: 2 }),
  notes: text("notes"),
  assignedTo: bigint("assigned_to", { mode: "number", unsigned: true }).references(() => users.id),
  expectedCloseDate: date("expected_close_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Lead = typeof leads.$inferSelect;

export const interactions = mysqlTable("interactions", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  customerId: bigint("customer_id", { mode: "number", unsigned: true }).references(() => customers.id),
  leadId: bigint("lead_id", { mode: "number", unsigned: true }).references(() => leads.id),
  type: mysqlEnum("type", ["call", "email", "meeting", "note", "task", "sms", "whatsapp"]).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description"),
  followUpDate: timestamp("follow_up_date"),
  status: mysqlEnum("status", ["pending", "completed", "overdue"]).default("pending").notNull(),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Interaction = typeof interactions.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 6. EXPENSES
// ─────────────────────────────────────────────────────────────────────────────
export const expenseCategories = mysqlTable("expense_categories", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 20 }).default("#6366f1"),
  icon: varchar("icon", { length: 50 }),
  parentId: bigint("parent_id", { mode: "number", unsigned: true }),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ExpenseCategory = typeof expenseCategories.$inferSelect;

export const expenses = mysqlTable("expenses", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }).references(() => expenseCategories.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  expenseDate: date("expense_date").notNull(),
  paymentMethod: mysqlEnum("payment_method", ["cash", "card", "bank_transfer", "cheque", "wallet", "other"]).default("cash").notNull(),
  vendor: varchar("vendor", { length: 255 }),
  receiptNumber: varchar("receipt_number", { length: 100 }),
  receiptImage: text("receipt_image"),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "reimbursed"]).default("pending").notNull(),
  approvedBy: bigint("approved_by", { mode: "number", unsigned: true }).references(() => users.id),
  submittedBy: bigint("submitted_by", { mode: "number", unsigned: true }).references(() => users.id),
  notes: text("notes"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
  deletedBy: bigint("deleted_by", { mode: "number", unsigned: true }).references(() => users.id),
});

export type Expense = typeof expenses.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 7. ACCOUNTING & IMMUTABLE LEDGER
// ─────────────────────────────────────────────────────────────────────────────
export const chartOfAccounts = mysqlTable("chart_of_accounts", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["asset", "liability", "equity", "revenue", "expense"]).notNull(),
  subtype: varchar("subtype", { length: 50 }),
  parentId: bigint("parent_id", { mode: "number", unsigned: true }),
  description: text("description"),
  isBankAccount: boolean("is_bank_account").default(false).notNull(),
  bankName: varchar("bank_name", { length: 255 }),
  accountNumber: varchar("account_number", { length: 100 }),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  currentBalance: decimal("current_balance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;

export const journalEntries = mysqlTable("journal_entries", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  entryNumber: varchar("entry_number", { length: 50 }).notNull(),
  date: date("date").notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: bigint("reference_id", { mode: "number", unsigned: true }),
  description: text("description").notNull(),
  totalDebit: decimal("total_debit", { precision: 15, scale: 2 }).notNull(),
  totalCredit: decimal("total_credit", { precision: 15, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["draft", "posted", "reversed"]).default("draft").notNull(),
  postedBy: bigint("posted_by", { mode: "number", unsigned: true }).references(() => users.id),
  postedAt: timestamp("posted_at"),
  notes: text("notes"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type JournalEntry = typeof journalEntries.$inferSelect;

export const journalEntryLines = mysqlTable("journal_entry_lines", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  journalEntryId: bigint("journal_entry_id", { mode: "number", unsigned: true }).notNull().references(() => journalEntries.id),
  accountId: bigint("account_id", { mode: "number", unsigned: true }).notNull().references(() => chartOfAccounts.id),
  description: text("description"),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0.00").notNull(),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0.00").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type JournalEntryLine = typeof journalEntryLines.$inferSelect;

export const ledgerEntries = mysqlTable("ledger_entries", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  journalEntryId: bigint("journal_entry_id", { mode: "number", unsigned: true }).references(() => journalEntries.id),
  accountId: bigint("account_id", { mode: "number", unsigned: true }).notNull().references(() => chartOfAccounts.id),
  date: date("date").notNull(),
  description: text("description"),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0.00").notNull(),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0.00").notNull(),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull(),
  entryType: mysqlEnum("entry_type", ["opening", "transaction", "adjustment", "closing", "reversal"]).default("transaction").notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: bigint("reference_id", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LedgerEntry = typeof ledgerEntries.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 8. AI CONVERSATIONS
// ─────────────────────────────────────────────────────────────────────────────
export const aiConversations = mysqlTable("ai_conversations", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number", unsigned: true }).references(() => users.id),
  title: varchar("title", { length: 255 }),
  model: varchar("model", { length: 50 }).default("gpt-4"),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type AiConversation = typeof aiConversations.$inferSelect;

export const aiMessages = mysqlTable("ai_messages", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  conversationId: bigint("conversation_id", { mode: "number", unsigned: true }).notNull().references(() => aiConversations.id),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  tokensUsed: int("tokens_used"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AiMessage = typeof aiMessages.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 9. CUSTOMER FINANCIALS
// ─────────────────────────────────────────────────────────────────────────────
export const customerTransactions = mysqlTable("customer_transactions", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  customerId: bigint("customer_id", { mode: "number", unsigned: true }).notNull().references(() => customers.id),
  ticketId: bigint("ticket_id", { mode: "number", unsigned: true }).references(() => tickets.id),
  invoiceId: bigint("invoice_id", { mode: "number", unsigned: true }).references(() => invoices.id),
  type: mysqlEnum("type", ["receivable", "payment", "deposit", "credit", "refund", "adjustment"]).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  referenceNumber: varchar("reference_number", { length: 100 }),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CustomerTransaction = typeof customerTransactions.$inferSelect;

export const invoices = mysqlTable("invoices", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  customerId: bigint("customer_id", { mode: "number", unsigned: true }).notNull().references(() => customers.id),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  ticketId: bigint("ticket_id", { mode: "number", unsigned: true }).references(() => tickets.id),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0.00").notNull(),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "partial", "paid", "overdue", "cancelled"]).default("draft").notNull(),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
  deletedBy: bigint("deleted_by", { mode: "number", unsigned: true }).references(() => users.id),
}, (table) => [
  index("invoices_tenant_idx").on(table.tenantId),
  index("invoices_customer_idx").on(table.customerId),
  index("invoices_ticket_idx").on(table.ticketId),
  uniqueIndex("invoices_number_unique").on(table.tenantId, table.invoiceNumber),
]);

export type Invoice = typeof invoices.$inferSelect;

export const invoiceItems = mysqlTable("invoice_items", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  invoiceId: bigint("invoice_id", { mode: "number", unsigned: true }).notNull().references(() => invoices.id),
  description: text("description").notNull(),
  quantity: int("quantity").default(1).notNull(),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).default("0.00").notNull(),
  totalPrice: decimal("total_price", { precision: 15, scale: 2 }).default("0.00").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type InvoiceItem = typeof invoiceItems.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 10. NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────
export const notifications = mysqlTable("notifications", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number", unsigned: true }).references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", ["info", "success", "warning", "error", "system"]).default("info").notNull(),
  category: mysqlEnum("category", ["ticket", "wallet", "expense", "accounting", "crm", "system", "security"]).default("system").notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: bigint("reference_id", { mode: "number", unsigned: true }),
  isRead: boolean("is_read").default(false).notNull(),
  readAt: timestamp("read_at"),
  actionUrl: text("action_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 11. ACCOUNTING PERIODS
// ─────────────────────────────────────────────────────────────────────────────
export const accountingPeriods = mysqlTable("accounting_periods", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  year: int("year").notNull(),
  month: int("month"),
  status: mysqlEnum("status", ["open", "closing", "closed"]).default("open").notNull(),
  closedBy: bigint("closed_by", { mode: "number", unsigned: true }).references(() => users.id),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("ap_tenant_year_month_idx").on(table.tenantId, table.year, table.month),
]);

export type AccountingPeriod = typeof accountingPeriods.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 12. SECURITY - AUDIT LOGS
// ─────────────────────────────────────────────────────────────────────────────
export const auditLogs = mysqlTable("audit_logs", {
  id: bigint("id", { mode: "number", unsigned: true })
  .autoincrement()
  .primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).references(() => tenants.id),
  userId: bigint("user_id", { mode: "number", unsigned: true }).references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 50 }),
  oldValues: json("old_values"),
  newValues: json("new_values"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: bigint("deleted_by", { mode: "number", unsigned: true }).references(() => users.id),
}, (table) => [
  index("audit_tenant_idx").on(table.tenantId),
  index("audit_user_idx").on(table.userId),
  index("audit_action_idx").on(table.action),
]);

// ─────────────────────────────────────────────────────────────────────────────
// 12. SESSIONS
// ─────────────────────────────────────────────────────────────────────────────
export const sessions = mysqlTable("sessions", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull().references(() => users.id),
  token: varchar("token", { length: 255 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("sessions_user_idx").on(table.userId),
  index("sessions_token_idx").on(table.token),
]);

export type Session = typeof sessions.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 13. PAYMENT LOCATIONS
// ─────────────────────────────────────────────────────────────────────────────
export const paymentLocations = mysqlTable("payment_locations", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  openingHours: varchar("opening_hours", { length: 255 }),
  supportedMethods: json("supported_methods"),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("pl_tenant_idx").on(table.tenantId),
]);

export type PaymentLocation = typeof paymentLocations.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 14. DEPOSITS
// ─────────────────────────────────────────────────────────────────────────────
export const deposits = mysqlTable("deposits", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  customerId: bigint("customer_id", { mode: "number", unsigned: true }).references(() => customers.id),
  walletId: bigint("wallet_id", { mode: "number", unsigned: true }).notNull().references(() => wallets.id),
  depositCode: varchar("deposit_code", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("payment_method", ["cash", "bank_transfer", "cheque"]).notNull(),
  referenceNumber: varchar("reference_number", { length: 100 }),
  locationId: bigint("location_id", { mode: "number", unsigned: true }).references(() => paymentLocations.id),
  proofImageUrl: text("proof_image_url"),
  status: mysqlEnum("status", ["pending", "under_review", "approved", "rejected", "expired"]).default("pending").notNull(),
  approvedBy: bigint("approved_by", { mode: "number", unsigned: true }).references(() => users.id),
  approvedAt: timestamp("approved_at"),
  expiresAt: timestamp("expires_at"),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
  deletedBy: bigint("deleted_by", { mode: "number", unsigned: true }).references(() => users.id),
}, (table) => [
  index("deposits_tenant_idx").on(table.tenantId),
  index("deposits_code_idx").on(table.depositCode),
  index("deposits_status_idx").on(table.status),
  uniqueIndex("deposits_code_unique").on(table.tenantId, table.depositCode),
]);

export type Deposit = typeof deposits.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 15. SUPPLIERS (VENDORS)
// ─────────────────────────────────────────────────────────────────────────────
export const suppliers = mysqlTable("suppliers", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  supplierCode: varchar("supplier_code", { length: 50 }).notNull(),
  companyName: varchar("company_name", { length: 200 }).notNull(),
  tradeName: varchar("trade_name", { length: 200 }),
  supplierType: mysqlEnum("supplier_type", ["airline", "hotel", "tour_operator", "car_rental", "insurance", "visa_service", "other"]).default("other").notNull(),
  taxId: varchar("tax_id", { length: 50 }),
  email: varchar("email", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  website: varchar("website", { length: 200 }),
  creditLimit: decimal("credit_limit", { precision: 15, scale: 2 }).default("0.00").notNull(),
  balanceDue: decimal("balance_due", { precision: 15, scale: 2 }).default("0.00").notNull(),
  paymentTerms: int("payment_terms").default(30),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: mysqlEnum("status", ["active", "inactive", "blocked"]).default("active").notNull(),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("suppliers_tenant_idx").on(table.tenantId),
  index("suppliers_code_idx").on(table.supplierCode),
  index("suppliers_status_idx").on(table.status),
  uniqueIndex("suppliers_code_unique").on(table.tenantId, table.supplierCode),
]);

export type Supplier = typeof suppliers.$inferSelect;

export const supplierContacts = mysqlTable("supplier_contacts", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  supplierId: bigint("supplier_id", { mode: "number", unsigned: true }).notNull().references(() => suppliers.id),
  name: varchar("name", { length: 100 }).notNull(),
  position: varchar("position", { length: 100 }),
  email: varchar("email", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("sc_supplier_idx").on(table.supplierId),
]);

export type SupplierContact = typeof supplierContacts.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 16. BILLS (ACCOUNTS PAYABLE)
// ─────────────────────────────────────────────────────────────────────────────
export const bills = mysqlTable("bills", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  supplierId: bigint("supplier_id", { mode: "number", unsigned: true }).notNull().references(() => suppliers.id),
  billNumber: varchar("bill_number", { length: 100 }).notNull(),
  referenceNumber: varchar("reference_number", { length: 100 }),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(),
  amountPaid: decimal("amount_paid", { precision: 15, scale: 2 }).default("0.00").notNull(),
  balanceDue: decimal("balance_due", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  description: text("description"),
  status: mysqlEnum("status", ["draft", "open", "partial", "paid", "overdue", "cancelled"]).default("draft").notNull(),
  category: varchar("category", { length: 100 }),
  journalEntryId: bigint("journal_entry_id", { mode: "number", unsigned: true }).references(() => journalEntries.id),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
  deletedBy: bigint("deleted_by", { mode: "number", unsigned: true }).references(() => users.id),
}, (table) => [
  index("bills_tenant_idx").on(table.tenantId),
  index("bills_supplier_idx").on(table.supplierId),
  index("bills_number_idx").on(table.billNumber),
  index("bills_status_idx").on(table.status),
  index("bills_due_date_idx").on(table.dueDate),
  uniqueIndex("bills_number_unique").on(table.tenantId, table.billNumber),
]);

export type Bill = typeof bills.$inferSelect;

export const billItems = mysqlTable("bill_items", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  billId: bigint("bill_id", { mode: "number", unsigned: true }).notNull().references(() => bills.id),
  description: varchar("description", { length: 255 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1.00").notNull(),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  accountId: bigint("account_id", { mode: "number", unsigned: true }).references(() => chartOfAccounts.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("bi_bill_idx").on(table.billId),
]);

export type BillItem = typeof billItems.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 17. SUPPLIER PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────
export const supplierPayments = mysqlTable("supplier_payments", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  supplierId: bigint("supplier_id", { mode: "number", unsigned: true }).notNull().references(() => suppliers.id),
  billId: bigint("bill_id", { mode: "number", unsigned: true }).references(() => bills.id),
  paymentNumber: varchar("payment_number", { length: 100 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("payment_method", ["cash", "bank_transfer", "cheque", "credit_card", "wallet"]).notNull(),
  paymentDate: date("payment_date").notNull(),
  referenceNumber: varchar("reference_number", { length: 100 }),
  bankAccountId: bigint("bank_account_id", { mode: "number", unsigned: true }),
  notes: text("notes"),
  journalEntryId: bigint("journal_entry_id", { mode: "number", unsigned: true }).references(() => journalEntries.id),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: bigint("deleted_by", { mode: "number", unsigned: true }).references(() => users.id),
}, (table) => [
  index("sp_tenant_idx").on(table.tenantId),
  index("sp_supplier_idx").on(table.supplierId),
  index("sp_bill_idx").on(table.billId),
  index("sp_number_idx").on(table.paymentNumber),
  uniqueIndex("sp_number_unique").on(table.tenantId, table.paymentNumber),
]);

export type SupplierPayment = typeof supplierPayments.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 18. EXCHANGE RATES (Multi-Currency)
// ─────────────────────────────────────────────────────────────────────────────
export const exchangeRates = mysqlTable("exchange_rates", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  fromCurrency: varchar("from_currency", { length: 3 }).notNull(),
  toCurrency: varchar("to_currency", { length: 3 }).notNull(),
  rate: decimal("rate", { precision: 15, scale: 6 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
  source: mysqlEnum("source", ["manual", "api", "system"]).default("manual").notNull(),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("er_tenant_idx").on(table.tenantId),
  index("er_currency_idx").on(table.fromCurrency, table.toCurrency),
  index("er_date_idx").on(table.effectiveDate),
]);

export type ExchangeRate = typeof exchangeRates.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 19. BANK STATEMENTS
// ─────────────────────────────────────────────────────────────────────────────
export const bankStatements = mysqlTable("bank_statements", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  accountId: bigint("account_id", { mode: "number", unsigned: true }).notNull().references(() => chartOfAccounts.id),
  statementDate: date("statement_date").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  openingBalance: decimal("opening_balance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  closingBalance: decimal("closing_balance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  fileUrl: text("file_url"),
  status: mysqlEnum("status", ["pending", "processing", "partial", "reconciled"]).default("pending").notNull(),
  totalDebits: decimal("total_debits", { precision: 15, scale: 2 }).default("0.00").notNull(),
  totalCredits: decimal("total_credits", { precision: 15, scale: 2 }).default("0.00").notNull(),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("bs_tenant_idx").on(table.tenantId),
  index("bs_account_idx").on(table.accountId),
  index("bs_status_idx").on(table.status),
]);

export type BankStatement = typeof bankStatements.$inferSelect;

export const bankStatementLines = mysqlTable("bank_statement_lines", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  statementId: bigint("statement_id", { mode: "number", unsigned: true }).notNull().references(() => bankStatements.id),
  transactionDate: date("transaction_date").notNull(),
  description: text("description"),
  reference: varchar("reference", { length: 100 }),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0.00").notNull(),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0.00").notNull(),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  matchedJournalEntryId: bigint("matched_journal_entry_id", { mode: "number", unsigned: true }).references(() => journalEntries.id),
  matchedLedgerEntryId: bigint("matched_ledger_entry_id", { mode: "number", unsigned: true }).references(() => ledgerEntries.id),
  matchConfidence: decimal("match_confidence", { precision: 5, scale: 2 }).default("0.00"),
  status: mysqlEnum("status", ["unmatched", "matched", "ignored"]).default("unmatched").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("bsl_tenant_idx").on(table.tenantId),
  index("bsl_statement_idx").on(table.statementId),
  index("bsl_status_idx").on(table.status),
]);

export type BankStatementLine = typeof bankStatementLines.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 20. DOCUMENT SEQUENCES (Atomic Numbering Engine)
// ─────────────────────────────────────────────────────────────────────────────
export const documentSequences = mysqlTable("document_sequences", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  prefix: varchar("prefix", { length: 20 }).notNull(),
  year: int("year").notNull(),
  lastNumber: bigint("last_number", { mode: "number", unsigned: true }).default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("ds_tenant_idx").on(table.tenantId),
  uniqueIndex("ds_tenant_prefix_year_unique").on(table.tenantId, table.prefix, table.year),
]);

export type DocumentSequence = typeof documentSequences.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 21. SYSTEM SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
export const systemSettings = mysqlTable("system_settings", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  key: varchar("key", { length: 100 }).notNull(),
  value: text("value"),
  category: varchar("category", { length: 50 }).default("general"),
  description: text("description"),
  updatedBy: bigint("updated_by", { mode: "number", unsigned: true }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("ss_tenant_key_idx").on(table.tenantId, table.key),
  index("ss_category_idx").on(table.category),
]);

export type SystemSetting = typeof systemSettings.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 22. DOCUMENTS (Generated PDFs & Attachments)
// ─────────────────────────────────────────────────────────────────────────────
export const documents = mysqlTable("documents", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number", unsigned: true }).notNull().references(() => tenants.id),
  entityType: mysqlEnum("entity_type", ["invoice", "ticket", "deposit", "supplier_payment", "expense", "report", "customer", "other"]).notNull(),
  entityId: bigint("entity_id", { mode: "number", unsigned: true }).notNull(),
  documentType: mysqlEnum("document_type", ["invoice", "receipt", "voucher", "statement", "report", "attachment"]).notNull(),
  documentNumber: varchar("document_number", { length: 100 }),
  fileName: varchar("file_name", { length: 255 }),
  fileUrl: text("file_url"),
  fileSize: bigint("file_size", { mode: "number" }),
  mimeType: varchar("mime_type", { length: 50 }),
  status: mysqlEnum("status", ["draft", "generated", "sent", "archived"]).default("draft").notNull(),
  generatedBy: bigint("generated_by", { mode: "number", unsigned: true }).references(() => users.id),
  generatedAt: timestamp("generated_at"),
  sentAt: timestamp("sent_at"),
  sentTo: varchar("sent_to", { length: 320 }),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: bigint("deleted_by", { mode: "number", unsigned: true }).references(() => users.id),
}, (table) => [
  index("docs_tenant_idx").on(table.tenantId),
  index("docs_entity_idx").on(table.entityType, table.entityId),
  index("docs_type_idx").on(table.documentType),
]);

export type Document = typeof documents.$inferSelect;

export type AuditLog = typeof auditLogs.$inferSelect;
