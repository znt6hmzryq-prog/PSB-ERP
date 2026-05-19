import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./router";
import { getDb } from "./queries/connection";
import { hashPassword } from "./lib/password";
import { eq, inArray } from "drizzle-orm";
import * as schema from "@db/schema";

const db = getDb();

let testTenantId: number;
let testUserId: number;
let testWalletId: number;
let testCustomerId: number;
let testTicketId: number;
let testInvoiceId: number;

function createCaller(user?: schema.User) {
  return appRouter.createCaller({
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    user,
  });
}

async function setup() {
  const tenantResult = await db.insert(schema.tenants).values({
    name: "Smoke Test Tenant",
    slug: `smoke-test-${Date.now()}`,
    status: "active",
    plan: "enterprise",
  });
  testTenantId = Number(tenantResult[0].insertId);

  const userResult = await db.insert(schema.users).values({
    unionId: `smoke-user-${Date.now()}`,
    tenantId: testTenantId,
    email: "smoke@test.com",
    passwordHash: hashPassword("test123"),
    name: "Smoke Tester",
    role: "admin",
    status: "active",
  });
  testUserId = Number(userResult[0].insertId);

  const walletResult = await db.insert(schema.wallets).values({
    tenantId: testTenantId,
    name: "Smoke Wallet",
    balance: "10000.00",
    reservedBalance: "0.00",
    status: "active",
  });
  testWalletId = Number(walletResult[0].insertId);

  const customerResult = await db.insert(schema.customers).values({
    tenantId: testTenantId,
    customerCode: `SMOKE-${Date.now()}`,
    firstName: "Smoke",
    lastName: "Customer",
    email: "customer@test.com",
    status: "active",
  });
  testCustomerId = Number(customerResult[0].insertId);

  // Seed required COA accounts
  await db.insert(schema.chartOfAccounts).values([
    { tenantId: testTenantId, code: "1000", name: "Cash", type: "asset", currentBalance: "0.00", status: "active" },
    { tenantId: testTenantId, code: "1200", name: "AR", type: "asset", currentBalance: "0.00", status: "active" },
    { tenantId: testTenantId, code: "4000", name: "Ticket Revenue", type: "revenue", currentBalance: "0.00", status: "active" },
    { tenantId: testTenantId, code: "4100", name: "Commission Revenue", type: "revenue", currentBalance: "0.00", status: "active" },
    { tenantId: testTenantId, code: "5000", name: "Office Expenses", type: "expense", currentBalance: "0.00", status: "active" },
  ]);
}

async function cleanup() {
  // 1. ledger entries
  const journals = await db.select({ id: schema.journalEntries.id })
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.tenantId, testTenantId));
  const journalIds = journals.map(j => j.id);
  if (journalIds.length > 0) {
    await db.delete(schema.ledgerEntries).where(inArray(schema.ledgerEntries.journalEntryId, journalIds));
    // 2. journal lines
    await db.delete(schema.journalEntryLines).where(inArray(schema.journalEntryLines.journalEntryId, journalIds));
  }
  // 3. journals
  await db.delete(schema.journalEntries).where(eq(schema.journalEntries.tenantId, testTenantId));

  // 4. transactions
  await db.delete(schema.customerTransactions).where(eq(schema.customerTransactions.tenantId, testTenantId));

  const invoices = await db.select({ id: schema.invoices.id })
    .from(schema.invoices)
    .where(eq(schema.invoices.tenantId, testTenantId));
  const invoiceIds = invoices.map(i => i.id);
  if (invoiceIds.length > 0) {
    await db.delete(schema.invoiceItems).where(inArray(schema.invoiceItems.invoiceId, invoiceIds));
  }
  await db.delete(schema.invoices).where(eq(schema.invoices.tenantId, testTenantId));

  await db.delete(schema.tickets).where(eq(schema.tickets.tenantId, testTenantId));
  await db.delete(schema.customers).where(eq(schema.customers.tenantId, testTenantId));
  await db.delete(schema.walletTransactions).where(eq(schema.walletTransactions.tenantId, testTenantId));
  await db.delete(schema.wallets).where(eq(schema.wallets.tenantId, testTenantId));
  await db.delete(schema.chartOfAccounts).where(eq(schema.chartOfAccounts.tenantId, testTenantId));

  // 5. document sequences (new table)
  await db.delete(schema.documentSequences).where(eq(schema.documentSequences.tenantId, testTenantId));
  // 6. notifications
  await db.delete(schema.notifications).where(eq(schema.notifications.tenantId, testTenantId));
  // 7. audit logs
  await db.delete(schema.auditLogs).where(eq(schema.auditLogs.tenantId, testTenantId));
  // 8. users
  await db.delete(schema.users).where(eq(schema.users.tenantId, testTenantId));
  // 9. tenants
  await db.delete(schema.tenants).where(eq(schema.tenants.id, testTenantId));
}

describe("Smoke Tests", () => {
  beforeAll(setup);
  afterAll(cleanup);

  it("login succeeds with valid credentials", async () => {
    const caller = createCaller(undefined);
    const result = await caller.auth.login({ email: "smoke@test.com", password: "test123" });
    expect(result.user.email).toBe("smoke@test.com");
    expect(result.user.role).toBe("admin");
  });

  it("ticket approval deducts wallet and creates journal", async () => {
    const ticketResult = await db.insert(schema.tickets).values({
      tenantId: testTenantId,
      ticketNumber: `SMOKE-TKT-${Date.now()}`,
      routeFrom: "JFK",
      routeTo: "LHR",
      baseFare: "100.00",
      taxAmount: "10.00",
      totalAmount: "110.00",
      commissionAmount: "11.00",
      netPayable: "99.00",
      status: "pending",
      paymentStatus: "pending",
      customerId: testCustomerId,
      issuedBy: testUserId,
      metadata: { walletId: testWalletId },
    });
    testTicketId = Number(ticketResult[0].insertId);

    const user = await db.query.users.findFirst({ where: eq(schema.users.id, testUserId) });
    const caller = createCaller(user);
    const result = await caller.ticket.approve({ id: testTicketId });
    expect(result.success).toBe(true);

    const wallet = await db.query.wallets.findFirst({ where: eq(schema.wallets.id, testWalletId) });
    expect(Number(wallet!.balance)).toBe(9890); // 10000 - 110

    const journal = await db.query.journalEntries.findFirst({
      where: eq(schema.journalEntries.referenceId, testTicketId),
    });
    expect(journal).toBeTruthy();
    expect(journal!.status).toBe("posted");
  });

  it("wallet transfer moves balance between wallets", async () => {
    const wallet2Result = await db.insert(schema.wallets).values({
      tenantId: testTenantId,
      name: "Smoke Wallet 2",
      balance: "0.00",
      status: "active",
    });
    const wallet2Id = Number(wallet2Result[0].insertId);

    const user = await db.query.users.findFirst({ where: eq(schema.users.id, testUserId) });
    const caller = createCaller(user);
    await caller.wallet.transfer({ fromWalletId: testWalletId, toWalletId: wallet2Id, amount: "100" });

    const fromWallet = await db.query.wallets.findFirst({ where: eq(schema.wallets.id, testWalletId) });
    const toWallet = await db.query.wallets.findFirst({ where: eq(schema.wallets.id, wallet2Id) });
    expect(Number(fromWallet!.balance)).toBe(9790); // 10000 - 110 (ticket) - 100 (transfer)
    expect(Number(toWallet!.balance)).toBe(100);

    await db.delete(schema.walletTransactions).where(
      eq(schema.walletTransactions.walletId, wallet2Id)
    );
    await db.delete(schema.wallets).where(eq(schema.wallets.id, wallet2Id));
  });

  it("invoice payment updates invoice and creates journal", async () => {
    const invoiceResult = await db.insert(schema.invoices).values({
      tenantId: testTenantId,
      customerId: testCustomerId,
      invoiceNumber: `INV-SMOKE-${Date.now()}`,
      issueDate: new Date(),
      dueDate: new Date(),
      subtotal: "100.00",
      taxAmount: "0.00",
      totalAmount: "100.00",
      paidAmount: "0.00",
      status: "sent",
    });
    testInvoiceId = Number(invoiceResult[0].insertId);

    const user = await db.query.users.findFirst({ where: eq(schema.users.id, testUserId) });
    const caller = createCaller(user);
    await caller.invoice.recordPayment({ id: testInvoiceId, amount: "50", paymentMethod: "cash" });

    const invoice = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, testInvoiceId) });
    expect(invoice!.status).toBe("partial");
    expect(Number(invoice!.paidAmount)).toBe(50);

    const journal = await db.query.journalEntries.findFirst({
      where: eq(schema.journalEntries.referenceId, testInvoiceId),
    });
    expect(journal).toBeTruthy();
    expect(journal!.status).toBe("posted");
  });
});
