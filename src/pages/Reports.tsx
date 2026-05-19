import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  FileText, Download, TrendingUp, Users, Receipt,
  Landmark, Wallet, BookOpen,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToPDF(title: string, headers: string[], rows: (string | number)[][]) {
  const doc = new jsPDF();
  doc.text(title, 14, 16);
  autoTable(doc, {
    head: [headers],
    body: rows.map(r => r.map(String)),
    startY: 24,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [99, 102, 241] },
  });
  doc.save(`${title.replace(/\s+/g, "_").toLowerCase()}.pdf`);
}

export default function ReportsPage() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [granularity, setGranularity] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [reportTab, setReportTab] = useState("revenue");

  const { data: revenueData, isLoading: revenueLoading } = trpc.report.revenueByCustomer.useQuery({ fromDate, toDate });
  const { data: expenseData, isLoading: expenseLoading } = trpc.report.expenseBreakdown.useQuery({ fromDate, toDate });
  const { data: payablesData } = trpc.report.supplierPayables.useQuery();
  const { data: cashFlowData } = trpc.report.cashFlow.useQuery({ fromDate, toDate, granularity });
  const { data: trialBalanceData } = trpc.report.trialBalance.useQuery({});
  const { data: ledgerData } = trpc.report.generalLedger.useQuery({ fromDate, toDate, limit: 100 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Reports & Analytics</h1>
          <p className="text-slate-500 mt-1 text-sm">Advanced reporting with export options</p>
        </div>
      </div>

      {/* Date Filter */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="grid grid-cols-2 gap-3 flex-1 w-full">
              <div>
                <Label className="text-xs">From Date</Label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">To Date</Label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
            </div>
            {reportTab === "cashflow" && (
              <Select value={granularity} onValueChange={v => setGranularity(v as any)}>
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs value={reportTab} onValueChange={setReportTab}>
        <TabsList className="w-full sm:w-auto overflow-x-auto flex-wrap h-auto">
          <TabsTrigger value="revenue"><TrendingUp className="h-3 w-3 mr-1" /> Revenue</TabsTrigger>
          <TabsTrigger value="expenses"><Receipt className="h-3 w-3 mr-1" /> Expenses</TabsTrigger>
          <TabsTrigger value="payables"><Users className="h-3 w-3 mr-1" /> Payables</TabsTrigger>
          <TabsTrigger value="cashflow"><Wallet className="h-3 w-3 mr-1" /> Cash Flow</TabsTrigger>
          <TabsTrigger value="trial"><BookOpen className="h-3 w-3 mr-1" /> Trial Balance</TabsTrigger>
          <TabsTrigger value="ledger"><Landmark className="h-3 w-3 mr-1" /> Ledger</TabsTrigger>
        </TabsList>

        {/* Revenue by Customer */}
        <TabsContent value="revenue" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              if (!revenueData) return;
              const headers = ["Customer", "Tickets", "Revenue", "Commission"];
              const rows = revenueData.map(r => [r.customerName || "Walk-in", r.totalTickets, r.totalRevenue, r.totalCommission]);
              downloadCSV("revenue_by_customer.csv", headers, rows);
            }}><Download className="h-3 w-3 mr-1" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={() => {
              if (!revenueData) return;
              exportToPDF("Revenue by Customer", ["Customer", "Tickets", "Revenue", "Commission"],
                revenueData.map(r => [r.customerName || "Walk-in", r.totalTickets, `$${r.totalRevenue.toLocaleString()}`, `$${r.totalCommission.toLocaleString()}`]));
            }}><FileText className="h-3 w-3 mr-1" /> PDF</Button>
          </div>

          {revenueLoading ? <Skeleton className="h-64" /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue by Customer</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={revenueData?.slice(0, 10) || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="customerName" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => typeof v === "number" ? `$${v.toLocaleString()}` : String(v)} />
                      <Bar dataKey="totalRevenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Tickets</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Commission</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(revenueData || []).map(r => (
                      <TableRow key={r.customerId || 0}>
                        <TableCell className="text-xs font-medium">{r.customerName || "Walk-in"}</TableCell>
                        <TableCell className="text-xs">{r.totalTickets}</TableCell>
                        <TableCell className="text-xs">${r.totalRevenue.toLocaleString()}</TableCell>
                        <TableCell className="text-xs">${r.totalCommission.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Expense Breakdown */}
        <TabsContent value="expenses" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              if (!expenseData) return;
              downloadCSV("expense_breakdown.csv", ["Vendor", "Count", "Total"], expenseData.map(r => [r.vendor || "Uncategorized", r.count, r.total]));
            }}><Download className="h-3 w-3 mr-1" /> CSV</Button>
          </div>
          {expenseLoading ? <Skeleton className="h-64" /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Expense Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={expenseData || []} dataKey="total" nameKey="vendor" cx="50%" cy="50%" outerRadius={80}>
                        {(expenseData || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => typeof v === "number" ? `$${v.toLocaleString()}` : String(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Vendor</TableHead><TableHead>Count</TableHead><TableHead>Total</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {(expenseData || []).map(r => (
                      <TableRow key={r.vendor || "uncategorized"}>
                        <TableCell className="text-xs font-medium">{r.vendor || "Uncategorized"}</TableCell>
                        <TableCell className="text-xs">{r.count}</TableCell>
                        <TableCell className="text-xs">${r.total.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Supplier Payables */}
        <TabsContent value="payables" className="mt-4">
          <div className="flex justify-end gap-2 mb-3">
            <Button size="sm" variant="outline" onClick={() => {
              if (!payablesData) return;
              downloadCSV("supplier_payables.csv", ["Supplier", "Bills", "Total", "Paid", "Balance"],
                payablesData.map(r => [r.supplierName || "—", r.totalBills, r.totalAmount, r.totalPaid, r.balanceDue]));
            }}><Download className="h-3 w-3 mr-1" /> CSV</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Open Bills</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(payablesData || []).map(r => (
                  <TableRow key={r.supplierId}>
                    <TableCell className="text-xs font-medium">{r.supplierName || "—"}</TableCell>
                    <TableCell className="text-xs">{r.totalBills}</TableCell>
                    <TableCell className="text-xs">${r.totalAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-xs">${r.totalPaid.toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-semibold text-amber-600">${r.balanceDue.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Cash Flow */}
        <TabsContent value="cashflow" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Cash Flow ({granularity})</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={cashFlowData?.items || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => typeof v === "number" ? `$${v.toLocaleString()}` : String(v)} />
                  <Bar dataKey="inflows" fill="#10b981" name="Inflows" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="outflows" fill="#ef4444" name="Outflows" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trial Balance */}
        <TabsContent value="trial" className="mt-4">
          <div className="flex justify-end gap-2 mb-3">
            <Button size="sm" variant="outline" onClick={() => {
              if (!trialBalanceData) return;
              downloadCSV("trial_balance.csv", ["Code", "Account", "Type", "Debit", "Credit", "Balance"],
                trialBalanceData.map(r => [r.code, r.name, r.type, r.totalDebit, r.totalCredit, r.netBalance]));
            }}><Download className="h-3 w-3 mr-1" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={() => {
              if (!trialBalanceData) return;
              exportToPDF("Trial Balance", ["Code", "Account", "Type", "Debit", "Credit", "Balance"],
                trialBalanceData.map(r => [r.code, r.name, r.type, `$${r.totalDebit.toLocaleString()}`, `$${r.totalCredit.toLocaleString()}`, `$${r.netBalance.toLocaleString()}`]));
            }}><FileText className="h-3 w-3 mr-1" /> PDF</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Debit</TableHead>
                  <TableHead>Credit</TableHead>
                  <TableHead>Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(trialBalanceData || []).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-medium">{r.code}</TableCell>
                    <TableCell className="text-xs">{r.name}</TableCell>
                    <TableCell className="text-xs capitalize">{r.type}</TableCell>
                    <TableCell className="text-xs">${r.totalDebit.toLocaleString()}</TableCell>
                    <TableCell className="text-xs">${r.totalCredit.toLocaleString()}</TableCell>
                    <TableCell className={`text-xs font-semibold ${r.netBalance >= 0 ? "text-emerald-600" : "text-red-600"}`}>${r.netBalance.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* General Ledger */}
        <TabsContent value="ledger" className="mt-4">
          <div className="flex justify-end gap-2 mb-3">
            <Button size="sm" variant="outline" onClick={() => {
              if (!ledgerData) return;
              downloadCSV("general_ledger.csv", ["Date", "Account", "Description", "Debit", "Credit", "Balance"],
                ledgerData.items.map(r => [String(r.date), (r as any).account?.name || "—", r.description || "", r.debit, r.credit, r.balance]));
            }}><Download className="h-3 w-3 mr-1" /> CSV</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Debit</TableHead>
                  <TableHead>Credit</TableHead>
                  <TableHead>Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ledgerData?.items || []).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{String(r.date)}</TableCell>
                    <TableCell className="text-xs font-medium">{(r as any).account?.name || "—"}</TableCell>
                    <TableCell className="text-xs">{r.description || "—"}</TableCell>
                    <TableCell className="text-xs">{Number(r.debit) > 0 ? `$${Number(r.debit).toLocaleString()}` : "—"}</TableCell>
                    <TableCell className="text-xs">{Number(r.credit) > 0 ? `$${Number(r.credit).toLocaleString()}` : "—"}</TableCell>
                    <TableCell className="text-xs font-semibold">${Number(r.balance).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
