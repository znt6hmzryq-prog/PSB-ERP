import { authRouter } from "./auth-router";
import { dashboardRouter } from "./dashboard-router";
import { walletRouter } from "./wallet-router";
import { ticketRouter } from "./ticket-router";
import { crmRouter } from "./crm-router";
import { expenseRouter } from "./expense-router";
import { accountingRouter } from "./accounting-router";
import { receivableRouter } from "./receivable-router";
import { invoiceRouter } from "./invoice-router";
import { aiRouter } from "./ai-router";
import { auditRouter } from "./audit-router";
import { notificationRouter } from "./notification-router";
import { paymentLocationRouter } from "./payment-location-router";
import { depositRouter } from "./deposit-router";
import { supplierRouter } from "./supplier-router";
import { payableRouter } from "./payable-router";
import { exchangeRateRouter } from "./exchange-rate-router";
import { bankReconciliationRouter } from "./bank-reconciliation-router";
import { reportRouter } from "./report-router";
import { documentRouter } from "./document-router";
import { settingsRouter } from "./settings-router";
import { registrationRouter } from "./registration-router";
import { adminRouter } from "./admin-router";
import { usersRouter } from "./users-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  dashboard: dashboardRouter,
  wallet: walletRouter,
  ticket: ticketRouter,
  crm: crmRouter,
  expense: expenseRouter,
  accounting: accountingRouter,
  receivable: receivableRouter,
  invoice: invoiceRouter,
  ai: aiRouter,
  audit: auditRouter,
  notification: notificationRouter,
  paymentLocation: paymentLocationRouter,
  deposit: depositRouter,
  supplier: supplierRouter,
  payable: payableRouter,
  exchangeRate: exchangeRateRouter,
  bankReconciliation: bankReconciliationRouter,
  report: reportRouter,
  document: documentRouter,
  settings: settingsRouter,
  registration: registrationRouter,
  admin: adminRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
