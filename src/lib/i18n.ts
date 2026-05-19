import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "@/locales/en/common.json";
import enLogin from "@/locales/en/login.json";
import enRegister from "@/locales/en/register.json";
import enDashboard from "@/locales/en/dashboard.json";
import enSidebar from "@/locales/en/sidebar.json";
import enAdmin from "@/locales/en/admin.json";
import enTickets from "@/locales/en/tickets.json";
import enCustomers from "@/locales/en/customers.json";
import enReports from "@/locales/en/reports.json";
import enInvoices from "@/locales/en/invoices.json";

import faCommon from "@/locales/fa/common.json";
import faLogin from "@/locales/fa/login.json";
import faRegister from "@/locales/fa/register.json";
import faDashboard from "@/locales/fa/dashboard.json";
import faSidebar from "@/locales/fa/sidebar.json";
import faAdmin from "@/locales/fa/admin.json";
import faTickets from "@/locales/fa/tickets.json";
import faCustomers from "@/locales/fa/customers.json";
import faReports from "@/locales/fa/reports.json";
import faInvoices from "@/locales/fa/invoices.json";

import psCommon from "@/locales/ps/common.json";
import psLogin from "@/locales/ps/login.json";
import psRegister from "@/locales/ps/register.json";
import psDashboard from "@/locales/ps/dashboard.json";
import psSidebar from "@/locales/ps/sidebar.json";
import psAdmin from "@/locales/ps/admin.json";
import psTickets from "@/locales/ps/tickets.json";
import psCustomers from "@/locales/ps/customers.json";
import psReports from "@/locales/ps/reports.json";
import psInvoices from "@/locales/ps/invoices.json";

export const resources = {
  en: {
    common: enCommon,
    login: enLogin,
    register: enRegister,
    dashboard: enDashboard,
    sidebar: enSidebar,
    admin: enAdmin,
    tickets: enTickets,
    customers: enCustomers,
    reports: enReports,
    invoices: enInvoices,
  },
  fa: {
    common: faCommon,
    login: faLogin,
    register: faRegister,
    dashboard: faDashboard,
    sidebar: faSidebar,
    admin: faAdmin,
    tickets: faTickets,
    customers: faCustomers,
    reports: faReports,
    invoices: faInvoices,
  },
  ps: {
    common: psCommon,
    login: psLogin,
    register: psRegister,
    dashboard: psDashboard,
    sidebar: psSidebar,
    admin: psAdmin,
    tickets: psTickets,
    customers: psCustomers,
    reports: psReports,
    invoices: psInvoices,
  },
};

export const RTL_LANGUAGES = ["fa", "ps"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "fa",
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export function isRTL(lng?: string): boolean {
  return RTL_LANGUAGES.includes(lng || i18n.language);
}

export function changeLanguage(lng: string) {
  i18n.changeLanguage(lng);
  document.documentElement.dir = isRTL(lng) ? "rtl" : "ltr";
  document.documentElement.lang = lng;
}

export default i18n;
