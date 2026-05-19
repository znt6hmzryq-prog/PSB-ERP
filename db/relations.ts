import { relations } from "drizzle-orm";
import {
  tenants,
  users,
  roles,
  wallets,
  walletTransactions,
  airlines,
  tickets,
  ticketPassengers,
  customers,
  leads,
  interactions,
  expenseCategories,
  expenses,
  chartOfAccounts,
  journalEntries,
  journalEntryLines,
  ledgerEntries,
  aiConversations,
  aiMessages,
  notifications,
  auditLogs,
  customerTransactions,
  invoices,
  invoiceItems,
} from "./schema";

// ─── TENANTS ─────────────────────────────────────────────────────────────────
export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  roles: many(roles),
  wallets: many(wallets),
  airlines: many(airlines),
  tickets: many(tickets),
  customers: many(customers),
  leads: many(leads),
  interactions: many(interactions),
  expenseCategories: many(expenseCategories),
  expenses: many(expenses),
  chartOfAccounts: many(chartOfAccounts),
  journalEntries: many(journalEntries),
  ledgerEntries: many(ledgerEntries),
  aiConversations: many(aiConversations),
  notifications: many(notifications),
}));

// ─── USERS ───────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  walletTransactions: many(walletTransactions),
  auditLogs: many(auditLogs),
  notifications: many(notifications),
}));

// ─── ROLES ───────────────────────────────────────────────────────────────────
export const rolesRelations = relations(roles, ({ one }) => ({
  tenant: one(tenants, { fields: [roles.tenantId], references: [tenants.id] }),
}));

// ─── WALLETS ─────────────────────────────────────────────────────────────────
export const walletsRelations = relations(wallets, ({ one, many }) => ({
  tenant: one(tenants, { fields: [wallets.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [wallets.userId], references: [users.id] }),
  transactions: many(walletTransactions),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  wallet: one(wallets, { fields: [walletTransactions.walletId], references: [wallets.id] }),
  tenant: one(tenants, { fields: [walletTransactions.tenantId], references: [tenants.id] }),
  creator: one(users, { fields: [walletTransactions.createdBy], references: [users.id] }),
}));

// ─── AIRLINES & TICKETS ──────────────────────────────────────────────────────
export const airlinesRelations = relations(airlines, ({ one, many }) => ({
  tenant: one(tenants, { fields: [airlines.tenantId], references: [tenants.id] }),
  tickets: many(tickets),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  tenant: one(tenants, { fields: [tickets.tenantId], references: [tenants.id] }),
  airline: one(airlines, { fields: [tickets.airlineId], references: [airlines.id] }),
  issuer: one(users, { fields: [tickets.issuedBy], references: [users.id] }),
  passengers: many(ticketPassengers),
  invoices: many(invoices),
  customerTransactions: many(customerTransactions),
}));

export const ticketPassengersRelations = relations(ticketPassengers, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketPassengers.ticketId], references: [tickets.id] }),
}));

// ─── CRM ─────────────────────────────────────────────────────────────────────
export const customersRelations = relations(customers, ({ one, many }) => ({
  tenant: one(tenants, { fields: [customers.tenantId], references: [tenants.id] }),
  assignee: one(users, { fields: [customers.assignedTo], references: [users.id] }),
  interactions: many(interactions),
  customerTransactions: many(customerTransactions),
  invoices: many(invoices),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  tenant: one(tenants, { fields: [leads.tenantId], references: [tenants.id] }),
  assignee: one(users, { fields: [leads.assignedTo], references: [users.id] }),
  interactions: many(interactions),
}));

export const interactionsRelations = relations(interactions, ({ one }) => ({
  tenant: one(tenants, { fields: [interactions.tenantId], references: [tenants.id] }),
  customer: one(customers, { fields: [interactions.customerId], references: [customers.id] }),
  lead: one(leads, { fields: [interactions.leadId], references: [leads.id] }),
  creator: one(users, { fields: [interactions.createdBy], references: [users.id] }),
}));

// ─── EXPENSES ────────────────────────────────────────────────────────────────
export const expenseCategoriesRelations = relations(expenseCategories, ({ one, many }) => ({
  tenant: one(tenants, { fields: [expenseCategories.tenantId], references: [tenants.id] }),
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  tenant: one(tenants, { fields: [expenses.tenantId], references: [tenants.id] }),
  category: one(expenseCategories, { fields: [expenses.categoryId], references: [expenseCategories.id] }),
  approver: one(users, { fields: [expenses.approvedBy], references: [users.id] }),
  submitter: one(users, { fields: [expenses.submittedBy], references: [users.id] }),
}));

// ─── ACCOUNTING ──────────────────────────────────────────────────────────────
export const chartOfAccountsRelations = relations(chartOfAccounts, ({ one, many }) => ({
  tenant: one(tenants, { fields: [chartOfAccounts.tenantId], references: [tenants.id] }),
  journalEntryLines: many(journalEntryLines),
  ledgerEntries: many(ledgerEntries),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one, many }) => ({
  tenant: one(tenants, { fields: [journalEntries.tenantId], references: [tenants.id] }),
  poster: one(users, { fields: [journalEntries.postedBy], references: [users.id] }),
  lines: many(journalEntryLines),
}));

export const journalEntryLinesRelations = relations(journalEntryLines, ({ one }) => ({
  journalEntry: one(journalEntries, { fields: [journalEntryLines.journalEntryId], references: [journalEntries.id] }),
  account: one(chartOfAccounts, { fields: [journalEntryLines.accountId], references: [chartOfAccounts.id] }),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  tenant: one(tenants, { fields: [ledgerEntries.tenantId], references: [tenants.id] }),
  journalEntry: one(journalEntries, { fields: [ledgerEntries.journalEntryId], references: [journalEntries.id] }),
  account: one(chartOfAccounts, { fields: [ledgerEntries.accountId], references: [chartOfAccounts.id] }),
}));

export const customerTransactionsRelations = relations(customerTransactions, ({ one }) => ({
  tenant: one(tenants, { fields: [customerTransactions.tenantId], references: [tenants.id] }),
  customer: one(customers, { fields: [customerTransactions.customerId], references: [customers.id] }),
  ticket: one(tickets, { fields: [customerTransactions.ticketId], references: [tickets.id] }),
  invoice: one(invoices, { fields: [customerTransactions.invoiceId], references: [invoices.id] }),
  creator: one(users, { fields: [customerTransactions.createdBy], references: [users.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  tenant: one(tenants, { fields: [invoices.tenantId], references: [tenants.id] }),
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
  ticket: one(tickets, { fields: [invoices.ticketId], references: [tickets.id] }),
  creator: one(users, { fields: [invoices.createdBy], references: [users.id] }),
  items: many(invoiceItems),
  customerTransactions: many(customerTransactions),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
}));

// ─── AI ──────────────────────────────────────────────────────────────────────
export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [aiConversations.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [aiConversations.userId], references: [users.id] }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, { fields: [aiMessages.conversationId], references: [aiConversations.id] }),
}));

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant: one(tenants, { fields: [notifications.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// ─── AUDIT LOGS ──────────────────────────────────────────────────────────────
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, { fields: [auditLogs.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));
