import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import {
  Building2, ArrowRight, Plane, Wallet, Users, Receipt,
  BookOpen, Brain, Shield, CheckCircle2, BarChart3,
  Globe, Zap, Lock, Sparkles, TrendingUp, Clock,
  Play, Layers, Database
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/* ─── Animated Particles Canvas ─────────────────────────────────────────── */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const w = () => canvas.offsetWidth;
    const h = () => canvas.offsetHeight;

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * w(),
        y: Math.random() * h(),
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 2 + 1,
        o: Math.random() * 0.5 + 0.2,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, w(), h());
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w()) p.vx *= -1;
        if (p.y < 0 || p.y > h()) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99, 102, 241, ${p.o})`;
        ctx.fill();

        // Connections
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[j].x - p.x;
          const dy = particles[j].y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(99, 102, 241, ${0.1 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      });
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

/* ─── Floating Orbs ─────────────────────────────────────────────────────── */
function FloatingOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-3xl"
        style={{ top: "10%", left: "-10%" }}
        animate={{ x: [0, 50, 0], y: [0, 30, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full bg-violet-500/10 blur-3xl"
        style={{ top: "40%", right: "-5%" }}
        animate={{ x: [0, -40, 0], y: [0, -20, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-[300px] h-[300px] rounded-full bg-cyan-500/10 blur-3xl"
        style={{ bottom: "10%", left: "30%" }}
        animate={{ x: [0, 30, 0], y: [0, -40, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/* ─── Animated Counter ──────────────────────────────────────────────────── */
function Counter({ target, prefix = "", suffix = "" }: { target: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const duration = 2000;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, target]);

  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

/* ─── Feature Card ──────────────────────────────────────────────────────── */
function FeatureCard({ icon: Icon, title, description, color, delay }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; color: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      className="group relative bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors shadow-sm hover:shadow-lg"
    >
      <div className={`h-12 w-12 rounded-xl ${color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
    </motion.div>
  );
}

/* ─── MAIN HOME PAGE ────────────────────────────────────────────────────── */
export default function HomePage() {
  const { isLoggedIn } = useAuth();

  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.15], [1, 0.95]);

  const features = [
    { icon: Wallet, title: "Wallet Management", description: "Multi-currency wallets with real-time balance tracking, automated transfers, and commission allocation across teams.", color: "bg-emerald-500", delay: 0 },
    { icon: Plane, title: "Ticket Management", description: "Full airline ticket lifecycle from booking to refund with PNR tracking, passenger management, and automated invoicing.", color: "bg-blue-500", delay: 0.1 },
    { icon: Users, title: "Customer CRM", description: "360-degree customer view with VIP classification, lead pipeline management, and interaction history tracking.", color: "bg-violet-500", delay: 0.2 },
    { icon: Receipt, title: "Expense Control", description: "Streamlined expense submission with multi-level approval workflows, receipt storage, and budget analytics.", color: "bg-amber-500", delay: 0.3 },
    { icon: BookOpen, title: "Accounting & Ledger", description: "Double-entry bookkeeping with chart of accounts, journal entries, immutable audit trails, and financial reporting.", color: "bg-rose-500", delay: 0.4 },
    { icon: Brain, title: "AI Assistant", description: "Intelligent insights for revenue forecasting, expense anomaly detection, customer analysis, and automated reporting.", color: "bg-indigo-500", delay: 0.5 },
    { icon: Shield, title: "Security & RBAC", description: "Role-based access control with 6 permission levels, immutable audit logs, and complete activity tracking.", color: "bg-cyan-500", delay: 0.6 },
    { icon: BarChart3, title: "Real-time Analytics", description: "Interactive dashboards with revenue trends, ticket distribution, expense breakdowns, and predictive insights.", color: "bg-orange-500", delay: 0.7 },
  ];

  const stats = [
    { value: 10000, suffix: "+", label: "Tickets Processed", icon: Plane },
    { value: 500, suffix: "+", label: "Active Agencies", icon: Building2 },
    { value: 50, suffix: "M+", label: "Revenue Tracked", icon: TrendingUp, prefix: "$" },
    { value: 99.9, suffix: "%", label: "Uptime SLA", icon: Clock },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* ─── Navigation ──────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xl text-slate-900 dark:text-white">PSB-ERP</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">Features</a>
              <a href="#modules" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">Modules</a>
              <a href="#pricing" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">Pricing</a>
            </div>
            <div className="flex items-center gap-3">
              <Link to={isLoggedIn ? "/dashboard" : "/login"}>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                  {isLoggedIn ? "Dashboard" : "Sign In"} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ────────────────────────────────────────────── */}
      <motion.section
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden"
      >
        <FloatingOrbs />
        <ParticleField />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm font-medium bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300">
              <Sparkles className="h-3.5 w-3.5 mr-1.5 inline" />
              Trusted by 500+ Travel Agencies Worldwide
            </Badge>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-7xl font-bold text-slate-900 dark:text-white leading-tight tracking-tight"
          >
            The Complete ERP for{" "}
            <span className="relative">
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                Travel Agencies
              </span>
              <motion.svg
                className="absolute -bottom-2 left-0 w-full"
                viewBox="0 0 300 12"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: 0.8 }}
              >
                <motion.path
                  d="M2 8C50 2 150 2 298 8"
                  stroke="url(#grad1)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1, delay: 0.8 }}
                />
                <defs>
                  <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </motion.svg>
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-6 text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed"
          >
            Multi-tenant ERP platform built specifically for travel agencies. Manage wallets,
            tickets, customers, expenses, accounting, and AI-powered insights — all in one place.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link to={isLoggedIn ? "/dashboard" : "/login"}>
              <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-base px-8 h-12 w-full sm:w-auto">
                {isLoggedIn ? "Go to Dashboard" : "Get Started Free"} <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="text-base px-8 h-12 w-full sm:w-auto">
              <Play className="h-4 w-4 mr-2" /> Watch Demo
            </Button>
          </motion.div>

          {/* Trusted By */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.6 }}
            className="mt-16 pt-8 border-t border-slate-200 dark:border-slate-800"
          >
            <p className="text-sm text-slate-500 mb-6">Trusted by leading travel agencies</p>
            <div className="flex flex-wrap justify-center gap-8 opacity-50">
              {["American Airlines", "Delta", "Emirates", "Singapore Air", "British Airways"].map((name) => (
                <span key={name} className="text-sm font-semibold text-slate-400">{name}</span>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* ─── Stats Section ───────────────────────────────────────────── */}
      <section className="py-16 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="text-center"
              >
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-indigo-100 dark:bg-indigo-950 mb-3">
                  <stat.icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <p className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white">
                  <Counter target={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
                </p>
                <p className="text-sm text-slate-500 mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Dashboard Preview ───────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge variant="outline" className="mb-4">Dashboard</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white">
              Everything at a Glance
            </h2>
            <p className="mt-4 text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
              Real-time KPIs, revenue trends, ticket status distribution, expense analytics,
              and top customer insights in one unified dashboard.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-900"
          >
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-white dark:bg-slate-700 rounded-md px-3 py-1 text-xs text-slate-500 text-center">
                  psb-erp.com/dashboard
                </div>
              </div>
            </div>
            {/* Dashboard preview content */}
            <div className="p-6 grid grid-cols-6 gap-4">
              {/* Stat cards */}
              {["Total Tickets", "Customers", "Wallet Balance", "Revenue", "Expenses", "Pending"].map((title, i) => (
                <div key={title} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                  <div className="h-2 w-2 rounded-full bg-indigo-400 mb-2" />
                  <p className="text-[10px] text-slate-400">{title}</p>
                  <p className="text-sm font-bold">{["2,847", "1,240", "$485K", "$1.2M", "$320K", "48"][i]}</p>
                </div>
              ))}
              {/* Chart placeholders */}
              <div className="col-span-3 bg-slate-50 dark:bg-slate-800 rounded-lg p-4 h-48">
                <p className="text-xs text-slate-400 mb-2">Revenue Trend</p>
                <div className="flex items-end gap-2 h-32">
                  {[40, 55, 45, 70, 60, 85, 75, 90, 80, 95, 88, 100].map((h, i) => (
                    <motion.div
                      key={i}
                      className="flex-1 bg-indigo-500/30 rounded-t"
                      initial={{ height: 0 }}
                      whileInView={{ height: `${h}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: i * 0.05 }}
                    />
                  ))}
                </div>
              </div>
              <div className="col-span-3 bg-slate-50 dark:bg-slate-800 rounded-lg p-4 h-48">
                <p className="text-xs text-slate-400 mb-2">Ticket Distribution</p>
                <div className="flex items-center justify-center h-32">
                  <div className="relative h-24 w-24">
                    <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                      <motion.circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                      <motion.circle
                        cx="18" cy="18" r="15.9" fill="none" stroke="#6366f1" strokeWidth="4"
                        strokeDasharray={`${0.55 * 100} ${100}`}
                        strokeLinecap="round"
                        initial={{ strokeDasharray: "0 100" }}
                        whileInView={{ strokeDasharray: `${0.55 * 100} ${100}` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: 0.3 }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold">55%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Features Section ────────────────────────────────────────── */}
      <section id="features" className="py-20 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="mb-4">Features</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white">
              Built for Travel Agency Operations
            </h2>
            <p className="mt-4 text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
              Every feature designed specifically for the unique challenges of travel agencies —
              from multi-airline bookings to complex commission structures.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ────────────────────────────────────────────── */}
      <section id="modules" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="mb-4">How It Works</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white">
              Streamlined Workflow
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Connect & Configure", description: "Set up your agency profile, connect airlines, configure wallets, and invite your team with role-based permissions.", icon: Layers },
              { step: "02", title: "Manage Operations", description: "Process bookings, track expenses, manage customer relationships, and monitor real-time financial data.", icon: Database },
              { step: "03", title: "Analyze & Optimize", description: "Leverage AI-powered insights, generate reports, audit trails, and optimize your agency performance.", icon: Zap },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="relative text-center"
              >
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-indigo-600 mb-6">
                  <item.icon className="h-8 w-8 text-white" />
                </div>
                <span className="absolute -top-2 -right-2 text-6xl font-bold text-slate-100 dark:text-slate-800 -z-10">{item.step}</span>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">{item.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing Section ─────────────────────────────────────────── */}
      <section id="pricing" className="py-20 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="mb-4">Pricing</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-4 text-slate-500 dark:text-slate-400">
              Start free and scale as your agency grows
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { name: "Free", price: "$0", desc: "Perfect for startups", features: ["1 User", "50 Tickets/month", "Basic CRM", "1 Wallet", "Email Support"], highlighted: false },
              { name: "Professional", price: "$99", desc: "For growing agencies", features: ["10 Users", "Unlimited Tickets", "Full CRM & Leads", "5 Wallets", "Expense Management", "Accounting Module", "Priority Support"], highlighted: true },
              { name: "Enterprise", price: "Custom", desc: "For large operations", features: ["Unlimited Users", "Everything in Pro", "AI Assistant", "Custom Integrations", "Dedicated Support", "SLA Guarantee", "On-premise Option"], highlighted: false },
            ].map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`relative rounded-2xl p-8 ${
                  plan.highlighted
                    ? "bg-indigo-600 text-white shadow-xl scale-105"
                    : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                }`}
              >
                {plan.highlighted && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white border-0">
                    Most Popular
                  </Badge>
                )}
                <h3 className={`text-lg font-semibold ${plan.highlighted ? "text-white" : "text-slate-900 dark:text-white"}`}>{plan.name}</h3>
                <div className="mt-4">
                  <span className={`text-4xl font-bold ${plan.highlighted ? "text-white" : "text-slate-900 dark:text-white"}`}>{plan.price}</span>
                  {plan.price !== "Custom" && <span className={`text-sm ${plan.highlighted ? "text-indigo-200" : "text-slate-500"}`}>/month</span>}
                </div>
                <p className={`mt-2 text-sm ${plan.highlighted ? "text-indigo-200" : "text-slate-500"}`}>{plan.desc}</p>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className={`h-4 w-4 ${plan.highlighted ? "text-indigo-200" : "text-emerald-500"}`} />
                      <span className={plan.highlighted ? "text-indigo-100" : "text-slate-600 dark:text-slate-400"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to={isLoggedIn ? "/dashboard" : "/login"} className="block mt-8">
                  <Button className={`w-full ${plan.highlighted ? "bg-white text-indigo-600 hover:bg-indigo-50" : "bg-indigo-600 hover:bg-indigo-700"}`}>
                    {plan.price === "Custom" ? "Contact Sales" : isLoggedIn ? "Open App" : "Get Started"}
                  </Button>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-12 lg:p-16 text-center"
          >
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 left-0 w-72 h-72 bg-white rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
              <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-400 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
            </div>
            <div className="relative z-10">
              <h2 className="text-3xl lg:text-4xl font-bold text-white">
                Ready to Transform Your Agency?
              </h2>
              <p className="mt-4 text-indigo-100 max-w-2xl mx-auto text-lg">
                Join 500+ travel agencies already using PSB-ERP to streamline operations,
                boost revenue, and delight customers.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                <Link to={isLoggedIn ? "/dashboard" : "/login"}>
                  <Button size="lg" className="bg-white text-indigo-600 hover:bg-indigo-50 text-base px-8 h-12 w-full sm:w-auto">
                    {isLoggedIn ? "Open Dashboard" : "Start Free Trial"} <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 text-base px-8 h-12 w-full sm:w-auto">
                  <Lock className="h-4 w-4 mr-2" /> Schedule a Demo
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-12 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-lg text-slate-900 dark:text-white">PSB-ERP</span>
              </div>
              <p className="text-sm text-slate-500">
                Pioneer System Building. The complete ERP solution built specifically for travel agencies worldwide.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#features" className="hover:text-indigo-600 transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-indigo-600 transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">API</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Integrations</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#" className="hover:text-indigo-600 transition-colors">About</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Security</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Compliance</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-500"> 2026 PSB-ERP by Pioneer System Building. All rights reserved.</p>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-500">Global • Multi-tenant • Secure</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
