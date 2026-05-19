import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, CheckCircle, XCircle, Clock, DollarSign, Download } from "lucide-react";
import { generateDepositReceiptPDF } from "@/lib/pdf-generator";

const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
  pending: { color: "bg-amber-100 text-amber-700", icon: Clock, label: "Pending" },
  under_review: { color: "bg-blue-100 text-blue-700", icon: Clock, label: "Under Review" },
  approved: { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle, label: "Approved" },
  rejected: { color: "bg-red-100 text-red-700", icon: XCircle, label: "Rejected" },
  expired: { color: "bg-slate-100 text-slate-700", icon: Clock, label: "Expired" },
};

const canApproveRoles = new Set(["super_admin", "admin", "accountant"]);

export default function DepositsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newDeposit, setNewDeposit] = useState({
    walletId: "",
    customerId: "",
    amount: "",
    paymentMethod: "cash" as "cash" | "bank_transfer" | "cheque",
    referenceNumber: "",
    locationId: "",
    notes: "",
  });

  const { user } = useAuth();
  const canApprove = canApproveRoles.has(user?.role || "");

  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.deposit.list.useQuery(
    { status: statusFilter || undefined, limit: 50 }
  );
  const { data: wallets } = trpc.wallet.list.useQuery();
  const { data: locations } = trpc.paymentLocation.list.useQuery({ status: "active" });
  const { data: customersData } = trpc.crm.customers.useQuery({ limit: 1000 });
  const customers = customersData?.items ?? [];
  const { data: stats } = trpc.deposit.stats.useQuery();
  const createDeposit = trpc.deposit.create.useMutation({
    onSuccess: () => {
      refetch();
      setCreateOpen(false);
      setNewDeposit({ walletId: "", customerId: "", amount: "", paymentMethod: "cash", referenceNumber: "", locationId: "", notes: "" });
    },
    onError: (err) => alert(err.message),
  });
  const updateStatus = trpc.deposit.updateStatus.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => alert(err.message),
  });

  const statusCounts: Record<string, { count: number; total: number }> = {};
  (stats?.statusCounts || []).forEach((s: any) => statusCounts[s.status] = { count: s.count, total: s.total });

  const filtered = search
    ? data?.items?.filter((d: any) =>
        d.depositCode.toLowerCase().includes(search.toLowerCase()) ||
        (d.customer?.firstName || "").toLowerCase().includes(search.toLowerCase()) ||
        (d.customer?.lastName || "").toLowerCase().includes(search.toLowerCase())
      )
    : data?.items;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Deposit Management</h1>
          <p className="text-slate-500 mt-1 text-sm">Track and approve customer deposits</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" /> Create Deposit</Button>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined} className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Deposit Request</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-4">
              <div>
                <label className="text-sm text-slate-500">Wallet</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-white" value={newDeposit.walletId} onChange={e => setNewDeposit(s => ({ ...s, walletId: e.target.value }))}>
                  <option value="">Select wallet</option>
                  {(wallets || []).map((w: any) => <option key={w.id} value={w.id}>{w.name} (${Number(w.balance).toLocaleString()})</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-500">Customer</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-white" value={newDeposit.customerId} onChange={e => setNewDeposit(s => ({ ...s, customerId: e.target.value }))}>
                  <option value="">Select customer (optional)</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName} {c.company ? `(${c.company})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-500">Payment Method</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-white" value={newDeposit.paymentMethod} onChange={e => setNewDeposit(s => ({ ...s, paymentMethod: e.target.value as any }))}>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-500">Amount</label>
                <Input type="number" step="0.01" value={newDeposit.amount} onChange={e => setNewDeposit(s => ({ ...s, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="text-sm text-slate-500">Reference Number</label>
                <Input value={newDeposit.referenceNumber} onChange={e => setNewDeposit(s => ({ ...s, referenceNumber: e.target.value }))} placeholder="Receipt / cheque number" />
              </div>
              <div>
                <label className="text-sm text-slate-500">Payment Location</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-white" value={newDeposit.locationId} onChange={e => setNewDeposit(s => ({ ...s, locationId: e.target.value }))}>
                  <option value="">Select location</option>
                  {(locations?.items || []).map((l: any) => <option key={l.id} value={l.id}>{l.name} — {l.city}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-500">Notes</label>
                <Input value={newDeposit.notes} onChange={e => setNewDeposit(s => ({ ...s, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
              <Button className="w-full bg-indigo-600" disabled={!newDeposit.walletId || !newDeposit.amount || createDeposit.isPending} onClick={() => createDeposit.mutate({
                walletId: Number(newDeposit.walletId),
                customerId: newDeposit.customerId ? Number(newDeposit.customerId) : undefined,
                amount: newDeposit.amount,
                paymentMethod: newDeposit.paymentMethod,
                referenceNumber: newDeposit.referenceNumber || undefined,
                locationId: newDeposit.locationId ? Number(newDeposit.locationId) : undefined,
                notes: newDeposit.notes || undefined,
              })}>
                {createDeposit.isPending ? "Creating..." : "Create Deposit"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
        {["pending", "under_review", "approved", "rejected", "expired"].map(status => {
          const s = statusCounts[status];
          const cfg = statusConfig[status];
          const Icon = cfg?.icon || DollarSign;
          return (
            <Card key={status} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(statusFilter === status ? "" : status)}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center ${cfg?.color?.split(" ")[0]}`}>
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs text-slate-500">{cfg?.label}</p>
                    <p className="text-lg sm:text-xl font-bold">${(s?.total || 0).toLocaleString()}</p>
                  </div>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-500 mt-1">{s?.count || 0} deposits</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input placeholder="Search by code or customer..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : error ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-red-500 mb-2">Failed to load deposits</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deposit Code</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">No deposits found.</TableCell>
                </TableRow>
              )}
              {filtered?.map((d: any) => {
                const cfg = statusConfig[d.status] || statusConfig.pending;
                const Icon = cfg.icon;
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="font-mono text-sm font-medium">{d.depositCode}</div>
                      <div className="text-xs text-slate-500">{d.customer ? `${d.customer.firstName} ${d.customer.lastName}` : "Walk-in"}</div>
                    </TableCell>
                    <TableCell className="font-medium">${Number(d.amount).toLocaleString()}</TableCell>
                    <TableCell className="capitalize text-sm">{d.paymentMethod.replace("_", " ")}</TableCell>
                    <TableCell className="text-sm">{d.wallet?.name || "-"}</TableCell>
                    <TableCell>
                      <Badge className={cfg.color}>
                        <Icon className="h-3 w-3 mr-1" /> {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {d.status === "pending" && canApprove && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="text-emerald-600 h-7 text-xs px-2" onClick={() => updateStatus.mutate({ id: d.id, status: "approved" })} disabled={updateStatus.isPending}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-600 h-7 text-xs px-2" onClick={() => updateStatus.mutate({ id: d.id, status: "rejected" })} disabled={updateStatus.isPending}>
                            <XCircle className="h-3 w-3 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                      {d.status === "pending" && !canApprove && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded">Pending</span>
                      )}
                      {d.status === "approved" && (
                        <Button size="sm" variant="ghost" className="text-indigo-600 h-7 text-xs px-2" onClick={async () => {
                          const data = await utils.document.depositReceiptData.fetch({ id: d.id });
                          if (data) {
                            const doc = generateDepositReceiptPDF(data);
                            doc.save(`receipt-${data.deposit.depositCode}.pdf`);
                          }
                        }}>
                          <Download className="h-3 w-3 mr-1" /> Receipt
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
