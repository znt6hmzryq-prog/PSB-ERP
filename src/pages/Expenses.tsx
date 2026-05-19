import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Receipt, Search, Plus, CheckCircle, XCircle, Clock, DollarSign, BookOpen } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const statusConfig: Record<string, { color: string; icon: any }> = {
  approved: { color: "bg-emerald-100 text-emerald-800", icon: CheckCircle },
  pending: { color: "bg-amber-100 text-amber-800", icon: Clock },
  rejected: { color: "bg-red-100 text-red-800", icon: XCircle },
  reimbursed: { color: "bg-blue-100 text-blue-800", icon: DollarSign },
};

export default function ExpensesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: expensesData, refetch } = trpc.expense.list.useQuery({ search, status: statusFilter });
  const { data: categories } = trpc.expense.categories.useQuery();
  const { data: stats } = trpc.expense.stats.useQuery();
  const createExpense = trpc.expense.create.useMutation({
    onSuccess: async () => {
      await utils.expense.list.invalidate();
      await utils.expense.stats.invalidate();
      await utils.dashboard.stats.invalidate();
      await utils.dashboard.expenseByCategory.invalidate();
      refetch();
      setCreateOpen(false);
      setNewExpense({ categoryId: 0, title: "", description: "", amount: "", expenseDate: "", paymentMethod: "card" as const, vendor: "", receiptNumber: "", notes: "" });
    },
    onError: (err) => alert(err.message),
  });
  const updateStatus = trpc.expense.updateStatus.useMutation({
    onSuccess: async () => {
      await utils.expense.list.invalidate();
      await utils.expense.stats.invalidate();
      await utils.dashboard.stats.invalidate();
      await utils.dashboard.expenseByCategory.invalidate();
      refetch();
    },
    onError: (err) => alert(err.message),
  });

  const [newExpense, setNewExpense] = useState<{
    categoryId: number; title: string; description: string; amount: string; expenseDate: string;
    paymentMethod: "cash" | "card" | "bank_transfer" | "cheque" | "wallet" | "other"; vendor: string; receiptNumber: string; notes: string;
  }>({
    categoryId: 0, title: "", description: "", amount: "", expenseDate: "",
    paymentMethod: "card", vendor: "", receiptNumber: "", notes: "",
  });

  const statusCounts: Record<string, { count: number; total: number }> = {};
  (stats?.statusCounts || []).forEach(s => statusCounts[s.status] = { count: s.count, total: s.total });
  const totalAll = Object.values(statusCounts).reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Expense Management</h1>
          <p className="text-slate-500 mt-1 text-sm">Track, approve, and manage business expenses</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" /> Submit Expense</Button>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined} className="max-w-[95vw] sm:max-w-lg">
            <DialogHeader><DialogTitle>Submit New Expense</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-4">
              <div>
                <Label>Category</Label>
                <Select onValueChange={v => setNewExpense({...newExpense, categoryId: Number(v)})}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {(categories || []).length === 0 ? (
                      <SelectItem value="__empty__" disabled>No records found</SelectItem>
                    ) : (
                      (categories || []).map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Title</Label><Input value={newExpense.title} onChange={e => setNewExpense({...newExpense, title: e.target.value})} placeholder="Expense title" /></div>
              <div><Label>Amount</Label><Input type="number" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} placeholder="0.00" /></div>
              <div><Label>Date</Label><Input type="date" onChange={e => setNewExpense({...newExpense, expenseDate: e.target.value})} /></div>
              <div>
                <Label>Payment Method</Label>
                <Select value={newExpense.paymentMethod} onValueChange={v => setNewExpense({...newExpense, paymentMethod: v as "cash" | "card" | "bank_transfer" | "cheque" | "wallet" | "other"})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="wallet">Wallet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Vendor</Label><Input value={newExpense.vendor} onChange={e => setNewExpense({...newExpense, vendor: e.target.value})} placeholder="Vendor name" /></div>
              <Button className="w-full bg-indigo-600" onClick={() => createExpense.mutate(newExpense)} disabled={!newExpense.title || !newExpense.amount || !newExpense.categoryId || !newExpense.expenseDate || createExpense.isPending}>Submit Expense</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats - FIXED: 2 cols on mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {["approved", "pending", "rejected", "reimbursed"].map(status => {
          const s = statusCounts[status];
          const pct = totalAll > 0 ? ((s?.total || 0) / totalAll) * 100 : 0;
          const cfg = statusConfig[status];
          const Icon = cfg?.icon || Receipt;
          return (
            <Card key={status} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(statusFilter === status ? "" : status)}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center ${cfg?.color?.split(" ")[0]}`}>
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs text-slate-500 capitalize">{status}</p>
                    <p className="text-lg sm:text-xl font-bold">${(s?.total || 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-2"><Progress value={pct} className="h-1.5" /></div>
                <p className="text-[10px] sm:text-xs text-slate-500 mt-1">{s?.count || 0} expenses</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Chart */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-600">Monthly Expense Trend</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats?.monthly || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={v => `$${v}`} />
              <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, ""]} />
              <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input className="pl-9" placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b"><tr>
                <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Expense</th>
                <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Category</th>
                <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Vendor</th>
                <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Date</th>
                <th className="text-right p-2 sm:p-3 font-medium text-slate-500 text-xs">Amount</th>
                <th className="text-center p-2 sm:p-3 font-medium text-slate-500 text-xs">Status</th>
                <th className="text-center p-2 sm:p-3 font-medium text-slate-500 text-xs">Actions</th>
              </tr></thead>
              <tbody>
                {(expensesData?.items || []).map((expense) => (
                  <tr key={expense.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="p-2 sm:p-3">
                      <p className="font-medium text-xs sm:text-sm">{expense.title}</p>
                      <p className="text-[10px] text-slate-500">{expense.receiptNumber}</p>
                    </td>
                    <td className="p-2 sm:p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: expense.category?.color || "#6366f1" }} />
                        <span className="text-xs sm:text-sm">{expense.category?.name}</span>
                      </div>
                    </td>
                    <td className="p-2 sm:p-3 text-xs sm:text-sm">{expense.vendor}</td>
                    <td className="p-2 sm:p-3 text-xs sm:text-sm">{expense.expenseDate ? new Date(expense.expenseDate).toLocaleDateString() : "-"}</td>
                    <td className="p-2 sm:p-3 text-right font-medium text-xs sm:text-sm">${Number(expense.amount).toLocaleString()}</td>
                    <td className="p-2 sm:p-3 text-center">
                      <Badge className={`text-[10px] ${statusConfig[expense.status]?.color || ""}`}>{expense.status}</Badge>
                    </td>
                    <td className="p-2 sm:p-3 text-center">
                      {expense.status === "pending" && (
                        <div className="flex justify-center gap-1 flex-wrap">
                          <Button size="sm" variant="ghost" className="text-emerald-600 h-7 text-xs px-2" onClick={() => updateStatus.mutate({ id: expense.id, status: "approved" })}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-600 h-7 text-xs px-2" onClick={() => updateStatus.mutate({ id: expense.id, status: "rejected" })}>
                            <XCircle className="h-3 w-3 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                      {expense.status === "approved" && (
                        <div className="flex justify-center gap-1 flex-wrap items-center">
                          <span className="inline-flex items-center text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded" title="Journal entry auto-posted on approval">
                            <BookOpen className="h-3 w-3 mr-1" /> Posted
                          </span>
                          <Button size="sm" variant="ghost" className="text-blue-600 h-7 text-xs px-2" onClick={() => updateStatus.mutate({ id: expense.id, status: "reimbursed" })}>
                            <DollarSign className="h-3 w-3 mr-1" /> Reimburse
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
