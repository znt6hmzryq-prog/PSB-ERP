import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, LogIn, AlertCircle, Eye, EyeOff, Shield, User, Lock } from "lucide-react";

export default function LoginPage() {
  const { t } = useTranslation("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const loginMutation = trpc.auth.login.useMutation();
  const utils = trpc.useUtils();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await loginMutation.mutateAsync({ email, password });
      console.log("[login success]", result.user?.email);
      await utils.auth.me.invalidate();
      navigate("/dashboard", { replace: true });
    } catch (trpcErr: any) {
      const serverMessage = trpcErr?.message;
      // Fallback to local dev demo login only in development
      const { isLocalDemoAuthEnabled, loginLocal } = await import("@/lib/localAuth");
      if (isLocalDemoAuthEnabled) {
        const user = loginLocal(email, password);
        if (user) {
          navigate("/dashboard", { replace: true });
          return;
        }
      }
      setError(serverMessage || t("invalidCredentials", "Invalid email or password. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const demoAccounts = [
    { role: t("adminDemo"), email: "admin@psb-erp.com", password: "admin123", color: "bg-red-50 text-red-700 border-red-200" },
    { role: t("managerDemo"), email: "manager@psb-erp.com", password: "manager123", color: "bg-blue-50 text-blue-700 border-blue-200" },
    { role: t("agentDemo"), email: "agent@psb-erp.com", password: "agent123", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-indigo-600 shadow-lg mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">PSB-ERP</h1>
          <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">{t("title")}</CardTitle>
            <CardDescription className="text-center text-sm">
              {t("emailLabel")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    title={showPassword ? t("hidePassword") : t("showPassword")}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 h-11" disabled={loading}>
                <LogIn className="h-4 w-4 mr-2" />
                {loading ? t("signingIn") : t("signInButton")}
              </Button>
            </form>

            {/* Registration link */}
            <div className="mt-4 text-center text-sm">
              <span className="text-slate-500">{t("noAccount")} </span>
              <Link to="/register" className="text-indigo-600 hover:text-indigo-700 font-medium">
                {t("registerNow")}
              </Link>
            </div>

            {/* Demo Accounts */}
            <div className="mt-6 pt-4 border-t">
              <p className="text-xs text-center text-slate-500 mb-3 flex items-center justify-center gap-1">
                <Shield className="h-3 w-3" /> {t("demoAccounts")}
              </p>
              <div className="space-y-2">
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => { setEmail(acc.email); setPassword(acc.password); setError(""); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors hover:opacity-80 ${acc.color}`}
                  >
                    <div>
                      <p className="text-xs font-semibold">{acc.role}</p>
                      <p className="text-[10px] opacity-80">{acc.email}</p>
                    </div>
                    <p className="text-[10px] opacity-70">{acc.password}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 text-center">
              <Link to="/" className="text-xs text-slate-400 hover:text-indigo-600 transition-colors">
                Back to Home Page
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
