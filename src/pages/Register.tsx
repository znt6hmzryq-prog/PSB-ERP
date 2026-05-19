import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Check,
  Plane,
  Star,
  Crown,
} from "lucide-react";

const plans = [
  { id: "starter" as const, label: "Starter", icon: Plane, price: 50, features: ["Up to 3 users", "Basic reports", "Email support"] },
  { id: "professional" as const, label: "Professional", icon: Star, price: 100, features: ["Up to 10 users", "Advanced reports", "Priority support", "Multi-branch"] },
  { id: "enterprise" as const, label: "Enterprise", icon: Crown, price: 200, features: ["Unlimited users", "Custom reports", "24/7 support", "API access"] },
];

const durations = [
  { months: 1, label: "1month", discount: 0 },
  { months: 3, label: "3months", discount: 5 },
  { months: 6, label: "6months", discount: 10 },
  { months: 12, label: "12months", discount: 15 },
];

export default function RegisterPage() {
  const { t } = useTranslation("register");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    agencyName: "",
    ownerName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    password: "",
    plan: "starter" as "starter" | "professional" | "enterprise",
    durationMonths: 1,
  });

  const registerMutation = trpc.registration.register.useMutation({
    onSuccess: (data) => {
      navigate("/register/success", {
        state: {
          token: data.token,
          agencyName: data.agencyName,
          plan: data.plan,
          durationMonths: data.durationMonths,
        },
      });
    },
    onError: (err) => {
      const msg = err.message;
      if (msg.includes("Email already")) setError(t("duplicateEmail"));
      else if (msg.includes("Agency name already")) setError(t("duplicateAgency"));
      else setError(msg || tc("error"));
    },
  });

  const handleChange = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const validateStep1 = () => {
    if (!form.agencyName.trim() || form.agencyName.length < 2) return false;
    if (!form.ownerName.trim() || form.ownerName.length < 2) return false;
    if (!form.email.trim() || !form.email.includes("@")) return false;
    if (!form.phone.trim() || form.phone.length < 5) return false;
    if (!form.address.trim() || form.address.length < 5) return false;
    if (!form.city.trim() || form.city.length < 2) return false;
    if (!form.password || form.password.length < 8) {
      setError(t("weakPassword"));
      return false;
    }
    return true;
  };

  const handleNext = () => {
    setError("");
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    setError("");
    setStep((s) => s - 1);
  };

  const handleSubmit = () => {
    setError("");
    registerMutation.mutate(form);
  };

  const selectedPlan = plans.find((p) => p.id === form.plan)!;
  const selectedDuration = durations.find((d) => d.months === form.durationMonths)!;
  const totalPrice = selectedPlan.price * form.durationMonths * (1 - selectedDuration.discount / 100);

  const stepLabels = [t("step1"), t("step2"), t("step3")];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-indigo-600 shadow-lg mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">PSB-ERP</h1>
          <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center mb-6">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    step > i + 1
                      ? "bg-emerald-500 text-white"
                      : step === i + 1
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {step > i + 1 ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className="text-[10px] mt-1 text-slate-500">{label}</span>
              </div>
              {i < stepLabels.length - 1 && (
                <div className={`w-12 sm:w-20 h-0.5 mx-2 ${step > i + 1 ? "bg-emerald-500" : "bg-slate-200"}`} />
              )}
            </div>
          ))}
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">{t("title")}</CardTitle>
            <CardDescription className="text-center text-sm">
              {step === 1 ? t("step1") : step === 2 ? t("step2") : t("step3")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Step 1: Agency Info */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="agencyName">{t("agencyName")}</Label>
                    <Input
                      id="agencyName"
                      placeholder={t("agencyNamePlaceholder")}
                      value={form.agencyName}
                      onChange={(e) => handleChange("agencyName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ownerName">{t("ownerName")}</Label>
                    <Input
                      id="ownerName"
                      placeholder={t("ownerNamePlaceholder")}
                      value={form.ownerName}
                      onChange={(e) => handleChange("ownerName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t("emailPlaceholder")}
                      value={form.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t("phone")}</Label>
                    <Input
                      id="phone"
                      placeholder={t("phonePlaceholder")}
                      value={form.phone}
                      onChange={(e) => handleChange("phone", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="address">{t("address")}</Label>
                    <Input
                      id="address"
                      placeholder={t("addressPlaceholder")}
                      value={form.address}
                      onChange={(e) => handleChange("address", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">{t("city")}</Label>
                    <Input
                      id="city"
                      placeholder={t("cityPlaceholder")}
                      value={form.city}
                      onChange={(e) => handleChange("city", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">{t("password")}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={t("passwordPlaceholder")}
                        value={form.password}
                        onChange={(e) => handleChange("password", e.target.value)}
                        className="pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400">{t("passwordHint")}</p>
                  </div>
                </div>

                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-11" onClick={handleNext}>
                  {t("next", "Next")} <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}

            {/* Step 2: Plan Selection */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <Label className="mb-3 block">{t("plan")}</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {plans.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleChange("plan", p.id)}
                        className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                          form.plan === p.id
                            ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {form.plan === p.id && (
                          <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-indigo-600 flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <p.icon className={`h-6 w-6 mb-2 ${form.plan === p.id ? "text-indigo-600" : "text-slate-400"}`} />
                        <p className="font-semibold text-sm">{p.label}</p>
                        <p className="text-xs text-slate-500 mt-1">${p.price}/mo</p>
                        <ul className="mt-2 space-y-1">
                          {p.features.map((f) => (
                            <li key={f} className="text-[10px] text-slate-500 flex items-center gap-1">
                              <Check className="h-3 w-3 text-emerald-500" /> {f}
                            </li>
                          ))}
                        </ul>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="mb-3 block">{t("duration")}</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {durations.map((d) => (
                      <button
                        key={d.months}
                        type="button"
                        onClick={() => handleChange("durationMonths", d.months)}
                        className={`p-3 rounded-lg border text-center transition-all ${
                          form.durationMonths === d.months
                            ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <p className="text-sm font-medium">{t(d.label as any)}</p>
                        {d.discount > 0 && (
                          <p className="text-[10px] text-emerald-600">-{d.discount}%</p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 h-11" onClick={handleBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> {t("back", "Back")}
                  </Button>
                  <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700 h-11" onClick={handleNext}>
                    {t("next", "Next")} <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("agencyName")}</span>
                    <span className="font-medium">{form.agencyName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("ownerName")}</span>
                    <span className="font-medium">{form.ownerName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("email")}</span>
                    <span className="font-medium">{form.email}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("phone")}</span>
                    <span className="font-medium">{form.phone}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("selectedPlan")}</span>
                    <span className="font-medium">{selectedPlan.label}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("selectedDuration")}</span>
                    <span className="font-medium">{form.durationMonths} {t("months", "months")}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                    <span>{t("totalPrice", "Total Price")}</span>
                    <span className="text-indigo-600">${totalPrice.toFixed(0)}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 h-11" onClick={handleBack} disabled={registerMutation.isPending}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> {t("back", "Back")}
                  </Button>
                  <Button
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 h-11"
                    onClick={handleSubmit}
                    disabled={registerMutation.isPending}
                  >
                    {registerMutation.isPending ? t("submitting") : t("submit")}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-4 text-center">
              <span className="text-xs text-slate-500">{tc("alreadyHaveAccount", "Already have an account?")} </span>
              <Link to="/login" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                {t("signIn", "Sign In")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
