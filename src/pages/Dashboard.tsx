import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComponentType, SVGProps } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import {
  Ticket,
  Users,
  Wallet,
  Receipt,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Bell,
} from "lucide-react";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

type StatCard = {
  title: string;
  value: string | number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  color: string;
  bg: string;
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();
  const { data: ticketTrend } = trpc.dashboard.ticketTrend.useQuery();
  const { data: recentTickets } = trpc.dashboard.recentTickets.useQuery();
  const { data: recentTransactions } = trpc.dashboard.recentTransactions.useQuery();
  const { data: statusDist } = trpc.dashboard.ticketStatusDistribution.useQuery();
  const { data: topCustomers } = trpc.dashboard.topCustomers.useQuery();
  const { data: expenseCats } = trpc.dashboard.expenseByCategory.useQuery();
  const { data: notifications } = trpc.dashboard.unreadNotifications.useQuery();

  const statusColor: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    cancelled: "bg-red-100 text-red-800",
    refunded: "bg-slate-100 text-slate-800",
    completed: "bg-blue-100 text-blue-800",
  };

  const statCards: StatCard[] = [
    { title: "Total Tickets", value: stats?.totalTickets ?? 0, icon: Ticket, color: "text-indigo-600", bg: "bg-indigo-50" },
    { title: "Customers", value: stats?.totalCustomers ?? 0, icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: "Wallet Balance", value: `$${(stats?.walletBalance ?? 0).toLocaleString()}`, icon: Wallet, color: "text-amber-600", bg: "bg-amber-50" },
    { title: "Total Revenue", value: `$${(stats?.totalRevenue ?? 0).toLocaleString()}`, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "Total Expenses", value: `$${(stats?.totalExpenses ?? 0).toLocaleString()}`, icon: Receipt, color: "text-rose-600", bg: "bg-rose-50" },
    { title: "Pending Tickets", value: stats?.pendingTickets ?? 0, icon: Clock, color: "text-orange-600", bg: "bg-orange-50" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Overview of your travel agency operations</p>
        </div>
        {(notifications && notifications.length > 0) && (
          <Badge variant="secondary" className="self-start sm:self-auto">
            <Bell className="h-3 w-3 mr-1" /> {notifications.length} unread
          </Badge>
        )}
      </div>

      {/* Stats Grid - FIXED: 2 cols mobile, 3 tablet, 6 desktop */}
      {statsLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_: unknown, i: number) => (
            <Skeleton key={i} className="h-24 sm:h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {statCards.map((stat: StatCard) => (
            <Card key={stat.title} className="border-0 shadow-sm">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className={`p-1.5 sm:p-2 rounded-lg ${stat.bg}`}>
                    <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
                  </div>
                </div>
                <p className="text-lg sm:text-2xl font-bold mt-2 sm:mt-3 text-slate-900 dark:text-white">
                  {stat.value}
                </p>
                <p className="text-[10px] sm:text-xs text-slate-500 mt-1">{stat.title}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts Row 1 - FIXED: stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Revenue Trend */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full" style={{ minHeight: 180 }}>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={ticketTrend || []}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number | string) => [`$${Number(value).toLocaleString()}`, "Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke="#6366f1" fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Ticket Status Distribution */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Ticket Status Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center">
            <div className="w-full sm:w-1/2" style={{ minHeight: 160 }}>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={statusDist || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    dataKey="count"
                    nameKey="status"
                  >
                    {(statusDist || []).map((_: unknown, index: number) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full sm:w-1/2 space-y-2 mt-3 sm:mt-0">
              {(statusDist || []).map((item: { status: string; count: number }, index: number) => (
                <div key={item.status} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-xs sm:text-sm capitalize text-slate-600 dark:text-slate-400">{item.status}</span>
                  <span className="text-xs sm:text-sm font-medium ml-auto">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Expense by Category */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full" style={{ minHeight: 160 }}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={expenseCats || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="categoryName" tick={{ fontSize: 9 }} stroke="#94a3b8" angle={-25} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip formatter={(value: number | string) => [`$${Number(value).toLocaleString()}`, ""]} />
                  <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Customers */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Top Customers by Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 sm:space-y-3">
              {(topCustomers || []).map((customer: { id: number; firstName: string; lastName: string; company?: string; totalRevenue: number; totalBookings: number }, i: number) => (
                <div key={customer.id} className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white truncate">{customer.firstName} {customer.lastName}</p>
                    <p className="text-[10px] text-slate-500">{customer.company}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">${Number(customer.totalRevenue).toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500">{customer.totalBookings} bookings</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Tickets */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Recent Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(recentTickets || []).map((ticket: { id: number; ticketNumber: string; routeFrom: string; routeTo: string; totalAmount: number; status: string }) => (
                <div key={ticket.id} className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Ticket className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white truncate">{ticket.ticketNumber}</p>
                    <p className="text-[10px] text-slate-500">{ticket.routeFrom} → {ticket.routeTo}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs sm:text-sm font-semibold">${Number(ticket.totalAmount).toLocaleString()}</p>
                    <Badge variant="secondary" className={`text-[10px] ${statusColor[ticket.status] || ""}`}>{ticket.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Recent Wallet Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(recentTransactions || []).map((tx: { id: number; type: string; description: string; wallet?: { name?: string }; amount: number; balanceAfter: number }) => (
                <div key={tx.id} className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type === "credit" ? "bg-emerald-100" : tx.type === "debit" ? "bg-red-100" : "bg-amber-100"}`}>
                    {tx.type === "credit" ? <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600" /> :
                     tx.type === "debit" ? <ArrowDownRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-600" /> :
                     <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white truncate">{tx.description}</p>
                    <p className="text-[10px] text-slate-500">{tx.wallet?.name}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs sm:text-sm font-semibold ${tx.type === "credit" ? "text-emerald-600" : "text-red-600"}`}>
                      {tx.type === "credit" ? "+" : "-"}${Number(tx.amount).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-500">${Number(tx.balanceAfter).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
