import { useEffect } from "react";
import { Routes, Route, useLocation, useNavigate, Navigate } from "react-router";
import AppLayout from "./components/layout/AppLayout";
import HomePage from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Wallets from "./pages/Wallets";
import Tickets from "./pages/Tickets";
import CRM from "./pages/CRM";
import CustomerDetail from "./pages/CustomerDetail";
import Invoices from "./pages/Invoices";
import Receivables from "./pages/Receivables";
import Deposits from "./pages/Deposits";
import PaymentActivation from "./pages/PaymentActivation";
import PaymentLocations from "./pages/PaymentLocations";
import Suppliers from "./pages/Suppliers";
import SupplierDetail from "./pages/SupplierDetail";
import Payables from "./pages/Payables";
import ExchangeRates from "./pages/ExchangeRates";
import BankReconciliation from "./pages/BankReconciliation";
import Reports from "./pages/Reports";
import Documents from "./pages/Documents";
import Expenses from "./pages/Expenses";
import Accounting from "./pages/Accounting";
import AIAssistant from "./pages/AIAssistant";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Register from "./pages/Register";
import RegisterSuccess from "./pages/RegisterSuccess";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import { useAuth } from "@/hooks/useAuth";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isLoggedIn) {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    }
  }, [navigate, location.pathname, loading, isLoggedIn]);

  if (loading || !isLoggedIn) return null;
  return <>{children}</>;
}

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoggedIn, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isLoggedIn) {
      navigate("/login", { replace: true, state: { from: location.pathname } });
      return;
    }
    if (!loading && user?.role !== "super_admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, location.pathname, loading, isLoggedIn, user]);

  if (loading || !isLoggedIn || user?.role !== "super_admin") return null;
  return <>{children}</>;
}

function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { isLoggedIn, loading, user } = useAuth();

  useEffect(() => {
    if (!loading && isLoggedIn) {
      if (user && user.role !== "super_admin" && (user as any).subscription?.status !== "active") {
        navigate("/payment-activation", { replace: true });
        return;
      }
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, loading, isLoggedIn]);

  if (loading || isLoggedIn) return null;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<RedirectIfAuth><Login /></RedirectIfAuth>} />
      <Route path="/register" element={<RedirectIfAuth><Register /></RedirectIfAuth>} />
      <Route path="/register/success" element={<RegisterSuccess />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            {user && user.role !== "super_admin" && (user as any).subscription?.status !== "active" ? (
              <Navigate to="/payment-activation" replace />
            ) : (
              <AppLayout><Dashboard /></AppLayout>
            )}
          </RequireAuth>
        }
      />
      <Route
        path="/wallets"
        element={
          <RequireAuth>
            <AppLayout><Wallets /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/tickets"
        element={
          <RequireAuth>
            <AppLayout><Tickets /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/crm"
        element={
          <RequireAuth>
            <AppLayout><CRM /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/crm/customers/:id"
        element={
          <RequireAuth>
            <AppLayout><CustomerDetail /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/invoices"
        element={
          <RequireAuth>
            <AppLayout><Invoices /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/receivables"
        element={
          <RequireAuth>
            <AppLayout><Receivables /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/deposits"
        element={
          <RequireAuth>
            <AppLayout><Deposits /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/payment-locations"
        element={
          <RequireAuth>
            <AppLayout><PaymentLocations /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/suppliers"
        element={
          <RequireAuth>
            <AppLayout><Suppliers /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/suppliers/:id"
        element={
          <RequireAuth>
            <AppLayout><SupplierDetail /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/payables"
        element={
          <RequireAuth>
            <AppLayout><Payables /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/exchange-rates"
        element={
          <RequireAuth>
            <AppLayout><ExchangeRates /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/bank-reconciliation"
        element={
          <RequireAuth>
            <AppLayout><BankReconciliation /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/reports"
        element={
          <RequireAuth>
            <AppLayout><Reports /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/documents"
        element={
          <RequireAuth>
            <AppLayout><Documents /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/expenses"
        element={
          <RequireAuth>
            <AppLayout><Expenses /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/accounting"
        element={
          <RequireAuth>
            <AppLayout><Accounting /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/ai"
        element={
          <RequireAuth>
            <AppLayout><AIAssistant /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
 path="/payment-activation"
 element={
   <RequireAuth>
      <AppLayout>
         <PaymentActivation/>
      </AppLayout>
   </RequireAuth>
 }
/>
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <AppLayout><Settings /></AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireSuperAdmin>
            <AppLayout><Admin /></AppLayout>
          </RequireSuperAdmin>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
