import { useState, useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { Plane, Search, Plus, Eye, CheckCircle, XCircle, RotateCcw, FileText, Download } from "lucide-react";
import { generateTicketVoucherPDF } from "@/lib/pdf-generator";

const statusColors: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-slate-100 text-slate-800",
  completed: "bg-blue-100 text-blue-800",
};

const classLabels: Record<string, string> = {
  economy: "Economy",
  premium_economy: "Premium",
  business: "Business",
  first: "First",
};

const canApproveRoles = new Set(["super_admin", "admin", "accountant"]);

function formatDate(dateStr: string | Date | null) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return "-";
  }
}

export default function TicketsPage() {
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewTicket, setViewTicket] = useState<number | null>(null);
  const [refundTicketId, setRefundTicketId] = useState<number | null>(null);
  const [refundForm, setRefundForm] = useState({ refundAmount: "", penaltyAmount: "", reason: "" });

  const { user } = useAuth();
  const canApprove = canApproveRoles.has(user?.role || "");

  const { data: wallets } = trpc.wallet.list.useQuery();
  const { data: customersData } = trpc.crm.customers.useQuery({ limit: 1000 });
  const customers = customersData?.items ?? [];

  const utils = trpc.useUtils();
  const {
    data: ticketsData,
    isLoading,
    isError,
    refetch,
  } = trpc.ticket.list.useQuery({ status, search, page, limit: 10 });
  const { data: airlines } = trpc.ticket.airlines.useQuery();
  const { data: stats } = trpc.ticket.stats.useQuery();

  const [newTicket, setNewTicket] = useState<{
    ticketNumber: string; pnrCode: string; airlineId: number; customerId: number | undefined;
    travelDate: string; returnDate: string; routeFrom: string; routeTo: string;
    tripType: "one_way" | "round_trip" | "multi_city"; class: "economy" | "premium_economy" | "business" | "first";
    ticketPrice: string; taxAmount: string; commissionAmount: string; notes: string;
    passengerFirstName: string; passengerLastName: string;
    walletId: number; paidAmount: string;
  }>({
    ticketNumber: "", pnrCode: "", airlineId: 0, customerId: undefined,
    travelDate: "", returnDate: "", routeFrom: "", routeTo: "",
    tripType: "one_way", class: "economy",
    ticketPrice: "", taxAmount: "", commissionAmount: "", notes: "",
    passengerFirstName: "", passengerLastName: "",
    walletId: 0, paidAmount: "",
  });

  const resetForm = () => setNewTicket({
    ticketNumber: "", pnrCode: "", airlineId: 0, customerId: undefined,
    travelDate: "", returnDate: "", routeFrom: "", routeTo: "",
    tripType: "one_way" as const, class: "economy" as const,
    ticketPrice: "", taxAmount: "", commissionAmount: "", notes: "",
    passengerFirstName: "", passengerLastName: "",
    walletId: 0, paidAmount: "",
  });

  const computed = useMemo(() => {
    const ticketPrice = Math.max(0, Number(newTicket.ticketPrice) || 0);
    const tax = Math.max(0, Number(newTicket.taxAmount) || 0);
    const commission = Math.max(0, Number(newTicket.commissionAmount) || 0);
    const baseFare = Math.max(0, ticketPrice - tax);
    const totalAmount = ticketPrice;
    const netPayable = Math.max(0, ticketPrice - commission);
    const paidAmount = Math.max(0, Number(newTicket.paidAmount) || 0);
    const remainingDue = Math.max(0, totalAmount - paidAmount);
    return { ticketPrice, tax, commission, baseFare, totalAmount, netPayable, paidAmount, remainingDue };
  }, [newTicket.ticketPrice, newTicket.taxAmount, newTicket.commissionAmount, newTicket.paidAmount]);

  const createTicket = trpc.ticket.create.useMutation({
    onSuccess: async () => {
      await utils.ticket.list.invalidate();
      await utils.ticket.stats.invalidate();
      await utils.dashboard.stats.invalidate();
      await utils.dashboard.ticketTrend.invalidate();
      await utils.dashboard.ticketStatusDistribution.invalidate();
      await utils.dashboard.recentTickets.invalidate();
      refetch();
      setCreateOpen(false);
      resetForm();
    },
    onError: (err) => alert(err.message),
  });

  const approveTicket = trpc.ticket.approve.useMutation({
    onSuccess: async () => {
      await utils.ticket.list.invalidate();
      await utils.ticket.stats.invalidate();
      await utils.dashboard.stats.invalidate();
      await utils.dashboard.recentTickets.invalidate();
      refetch();
    },
    onError: (err) => alert(err.message),
  });

  const rejectTicket = trpc.ticket.reject.useMutation({
    onSuccess: async () => {
      await utils.ticket.list.invalidate();
      await utils.ticket.stats.invalidate();
      await utils.dashboard.stats.invalidate();
      await utils.dashboard.recentTickets.invalidate();
      refetch();
    },
    onError: (err) => alert(err.message),
  });

  const refundTicket = trpc.ticket.refund.useMutation({
    onSuccess: async () => {
      await utils.ticket.list.invalidate();
      await utils.ticket.stats.invalidate();
      await utils.dashboard.stats.invalidate();
      await utils.dashboard.recentTickets.invalidate();
      refetch();
      setRefundTicketId(null);
      setRefundForm({ refundAmount: "", penaltyAmount: "", reason: "" });
    },
    onError: (err) => alert(err.message),
  });

  if (isLoading) return <div className="py-8 text-center text-slate-500">Loading tickets...</div>;
  if (isError) return <div className="py-8 text-center text-red-600">Error loading tickets</div>;

  const ticketCounts: Record<string, number> = {};
  (stats?.statusCounts || []).forEach(s => ticketCounts[s.status] = s.count);

  const handleCreate = () => {
    const payload = {
      ticketNumber: newTicket.ticketNumber,
      pnrCode: newTicket.pnrCode,
      airlineId: newTicket.airlineId,
      customerId: newTicket.customerId,
      travelDate: newTicket.travelDate,
      returnDate: newTicket.returnDate,
      routeFrom: newTicket.routeFrom,
      routeTo: newTicket.routeTo,
      tripType: newTicket.tripType,
      class: newTicket.class,
      baseFare: computed.baseFare.toString(),
      taxAmount: newTicket.taxAmount,
      totalAmount: computed.totalAmount.toString(),
      paidAmount: newTicket.paidAmount,
      commissionAmount: newTicket.commissionAmount,
      netPayable: computed.netPayable.toString(),
      notes: newTicket.notes,
      walletId: newTicket.walletId,
      passengers: newTicket.passengerFirstName || newTicket.passengerLastName ? [{
        firstName: newTicket.passengerFirstName,
        lastName: newTicket.passengerLastName,
        passengerType: "adult" as const,
      }] : undefined,
    };
    console.log("[ticket form]", newTicket);
    console.log("[ticket payload]", payload);
    console.log("[ticket total]", computed.totalAmount);
    createTicket.mutate(payload);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Ticket Management</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage airline tickets, bookings, and reservations</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" /> New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined} className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader><DialogTitle>Create New Ticket</DialogTitle></DialogHeader>

            {/* Customer & Flight Information */}
            <div className="pt-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Flight Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="sm:col-span-2">
                  <Label>Customer</Label>
                  <Select onValueChange={v => setNewTicket({...newTicket, customerId: Number(v) || undefined})}>
                    <SelectTrigger><SelectValue placeholder="Select customer (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="walkin">Walk-in (no customer)</SelectItem>
                      {(customers || []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id.toString()}>
                          {c.firstName} {c.lastName} {c.company ? `(${c.company})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>From</Label><Input value={newTicket.routeFrom} onChange={e => setNewTicket({...newTicket, routeFrom: e.target.value.toUpperCase()})} placeholder="JFK" maxLength={10} /></div>
                <div><Label>To</Label><Input value={newTicket.routeTo} onChange={e => setNewTicket({...newTicket, routeTo: e.target.value.toUpperCase()})} placeholder="LHR" maxLength={10} /></div>
                <div><Label>Travel Date</Label><Input type="date" value={newTicket.travelDate} onChange={e => setNewTicket({...newTicket, travelDate: e.target.value})} /></div>
                <div><Label>Return Date</Label><Input type="date" value={newTicket.returnDate} onChange={e => setNewTicket({...newTicket, returnDate: e.target.value})} /></div>
                <div>
                  <Label>Trip Type</Label>
                  <Select value={newTicket.tripType} onValueChange={v => setNewTicket({...newTicket, tripType: v as "one_way" | "round_trip" | "multi_city"})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_way">One Way</SelectItem>
                      <SelectItem value="round_trip">Round Trip</SelectItem>
                      <SelectItem value="multi_city">Multi City</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Class</Label>
                  <Select value={newTicket.class} onValueChange={v => setNewTicket({...newTicket, class: v as "economy" | "premium_economy" | "business" | "first"})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="economy">Economy</SelectItem>
                      <SelectItem value="premium_economy">Premium Economy</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="first">First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Passenger Information */}
            <div className="pt-4 border-t">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Passenger Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div><Label>First Name</Label><Input value={newTicket.passengerFirstName} onChange={e => setNewTicket({...newTicket, passengerFirstName: e.target.value})} placeholder="John" /></div>
                <div><Label>Last Name</Label><Input value={newTicket.passengerLastName} onChange={e => setNewTicket({...newTicket, passengerLastName: e.target.value})} placeholder="Doe" /></div>
              </div>
            </div>

            {/* Financial Information */}
            <div className="pt-4 border-t">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Financial Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div><Label>Ticket Price</Label><Input type="number" value={newTicket.ticketPrice} onChange={e => setNewTicket({...newTicket, ticketPrice: e.target.value})} placeholder="0.00" /></div>
                <div><Label>Tax Amount</Label><Input type="number" value={newTicket.taxAmount} onChange={e => setNewTicket({...newTicket, taxAmount: e.target.value})} placeholder="0.00" /></div>
                <div><Label>Paid Amount</Label><Input type="number" value={newTicket.paidAmount} onChange={e => setNewTicket({...newTicket, paidAmount: e.target.value})} placeholder="0.00" /></div>
                <div><Label>Commission</Label><Input type="number" value={newTicket.commissionAmount} onChange={e => setNewTicket({...newTicket, commissionAmount: e.target.value})} placeholder="0.00" /></div>
                <div><Label>Total Amount</Label><Input type="number" value={computed.totalAmount || ""} disabled className="bg-slate-50 dark:bg-slate-800" /></div>
                <div><Label>Remaining Due</Label><Input type="number" value={computed.remainingDue || ""} disabled className="bg-slate-50 dark:bg-slate-800" /></div>
              </div>

              {/* Amount Preview */}
              {(computed.ticketPrice > 0 || computed.tax > 0 || computed.commission > 0) && (
                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border">
                  <p className="text-xs font-medium text-slate-500 mb-2">Amount Preview</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-600">Ticket Price:</span><span className="text-right font-medium">${computed.ticketPrice.toLocaleString()}</span>
                    <span className="text-slate-600">Tax:</span><span className="text-right font-medium">${computed.tax.toLocaleString()}</span>
                    <span className="text-slate-600">Base Fare:</span><span className="text-right font-medium">${computed.baseFare.toLocaleString()}</span>
                    <span className="text-slate-600">Paid:</span><span className="text-right font-medium">${computed.paidAmount.toLocaleString()}</span>
                    <span className="text-slate-600">Commission:</span><span className="text-right font-medium">${computed.commission.toLocaleString()}</span>
                    <span className="text-slate-600 font-bold">Net Payable:</span><span className="text-right font-bold">${computed.netPayable.toLocaleString()}</span>
                    <span className="text-slate-600 font-bold text-amber-600">Remaining Due:</span><span className="text-right font-bold text-amber-600">${computed.remainingDue.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Booking Information */}
            <div className="pt-4 border-t">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Booking Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div><Label>Ticket Number</Label><Input value={newTicket.ticketNumber} onChange={e => setNewTicket({...newTicket, ticketNumber: e.target.value})} placeholder="TKT-2026-XXX" /></div>
                <div><Label>PNR Code</Label><Input value={newTicket.pnrCode} onChange={e => setNewTicket({...newTicket, pnrCode: e.target.value})} placeholder="ABC123" /></div>
                <div>
                  <Label>Airline</Label>
                  <Select onValueChange={v => setNewTicket({...newTicket, airlineId: Number(v)})}>
                    <SelectTrigger><SelectValue placeholder="Select airline" /></SelectTrigger>
                    <SelectContent>
                      {(airlines || []).length === 0 ? (
                        <SelectItem value="__empty__" disabled>No records found</SelectItem>
                      ) : (
                        (airlines || []).map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Booking Wallet</Label>
                  <Select onValueChange={(v) => setNewTicket({ ...newTicket, walletId: Number(v) })}>
                    <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                    <SelectContent>
                      {(wallets || []).length === 0 ? (
                        <SelectItem value="__empty__" disabled>No records found</SelectItem>
                      ) : (
                        (wallets || []).map((w) => (
                          <SelectItem key={w.id} value={w.id.toString()}>
                            {w.name} (${Number(w.balance).toLocaleString()})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2"><Label>Notes</Label><Input value={newTicket.notes} onChange={e => setNewTicket({...newTicket, notes: e.target.value})} placeholder="Additional notes" /></div>
              </div>
            </div>

            <Button
              className="w-full mt-4 bg-indigo-600"
              onClick={handleCreate}
              disabled={!newTicket.ticketNumber || !newTicket.walletId || !newTicket.airlineId || !newTicket.routeFrom || !newTicket.routeTo || !newTicket.travelDate || createTicket.isPending}
            >
              {createTicket.isPending ? "Creating..." : "Create Ticket"}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {["confirmed", "pending", "cancelled", "refunded", "completed"].map(s => (
          <Card key={s} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatus(status === s ? "" : s)}>
            <CardContent className="p-2 sm:p-3 text-center">
              <p className="text-[10px] sm:text-xs text-slate-500 capitalize">{s}</p>
              <p className="text-lg sm:text-xl font-bold">{ticketCounts[s] || 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input className="pl-9" placeholder="Search tickets..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {/* Tickets Info Under Search */}
      {ticketsData && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
          <span>
            Showing <strong>{ticketsData.items.length}</strong> of <strong>{ticketsData.total}</strong> tickets
            {status && <span className="ml-1">(filtered by <span className="capitalize">{status}</span>)</span>}
          </span>
          <span>Page {ticketsData.page} of {Math.max(1, Math.ceil(ticketsData.total / ticketsData.limit))}</span>
        </div>
      )}

      {/* Tickets Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b">
                <tr>
                  <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Ticket #</th>
                  <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Passenger</th>
                  <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Route</th>
                  <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Airline</th>
                  <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Class</th>
                  <th className="text-right p-2 sm:p-3 font-medium text-slate-500 text-xs">Amount</th>
                  <th className="text-center p-2 sm:p-3 font-medium text-slate-500 text-xs">Status</th>
                  <th className="text-center p-2 sm:p-3 font-medium text-slate-500 text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2 sm:p-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-2 sm:p-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="p-2 sm:p-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-2 sm:p-3"><Skeleton className="h-4 w-16" /></td>
                      <td className="p-2 sm:p-3"><Skeleton className="h-4 w-14" /></td>
                      <td className="p-2 sm:p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="p-2 sm:p-3"><Skeleton className="h-5 w-14 mx-auto" /></td>
                      <td className="p-2 sm:p-3"><Skeleton className="h-7 w-20 mx-auto" /></td>
                    </tr>
                  ))
                )}
                {!isLoading && !isError && (ticketsData?.items || []).map((ticket) => {
                  const firstPax = ticket.passengers?.[0];
                  const paxName = firstPax ? `${firstPax.firstName} ${firstPax.lastName}` : "-";
                  return (
                    <tr key={ticket.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="p-2 sm:p-3">
                        <div className="font-medium text-xs sm:text-sm">{ticket.ticketNumber}</div>
                        <div className="text-[10px] text-slate-500">PNR: {ticket.pnrCode}</div>
                      </td>
                      <td className="p-2 sm:p-3 text-xs sm:text-sm">{paxName}</td>
                      <td className="p-2 sm:p-3">
                        <div className="flex items-center gap-1 text-xs sm:text-sm">
                          <span className="font-medium">{ticket.routeFrom}</span>
                          <Plane className="h-3 w-3 text-slate-400" />
                          <span className="font-medium">{ticket.routeTo}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">{ticket.tripType.replace("_", " ")} · {formatDate(ticket.travelDate)}</div>
                      </td>
                      <td className="p-2 sm:p-3 text-slate-600 text-xs sm:text-sm">{ticket.airline?.name || "-"}</td>
                      <td className="p-2 sm:p-3 text-xs sm:text-sm">{classLabels[ticket.class]}</td>
                      <td className="p-2 sm:p-3 text-right font-medium text-xs sm:text-sm">${Number(ticket.totalAmount).toLocaleString()}</td>
                      <td className="p-2 sm:p-3 text-center">
                        <Badge className={`text-[10px] sm:text-xs ${statusColors[ticket.status] || ""}`}>{ticket.status}</Badge>
                      </td>
                      <td className="p-2 sm:p-3 text-center">
                        <div className="flex justify-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewTicket(ticket.id)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          {ticket.status === "pending" && canApprove && (
                            <>
                              <Button size="sm" variant="ghost" className="text-emerald-600 h-7 text-xs px-2" onClick={() => approveTicket.mutate({ id: ticket.id })} disabled={approveTicket.isPending}>
                                <CheckCircle className="h-3 w-3 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600 h-7 text-xs px-2" onClick={() => rejectTicket.mutate({ id: ticket.id })} disabled={rejectTicket.isPending}>
                                <XCircle className="h-3 w-3 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          {ticket.status === "pending" && !canApprove && (
                            <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded">Pending</span>
                          )}
                          {ticket.status === "confirmed" && (
                            <span className="inline-flex items-center text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded" title="Invoice auto-generated on approval">
                              <FileText className="h-3 w-3 mr-1" /> Invoice
                            </span>
                          )}
                          {(ticket.status === "confirmed" || ticket.status === "completed") && (
                            <Button size="sm" variant="ghost" className="text-indigo-600 h-7 text-xs px-2" onClick={async () => {
                              const data = await utils.document.ticketVoucherData.fetch({ id: ticket.id });
                              if (data) {
                                const doc = generateTicketVoucherPDF(data);
                                doc.save(`voucher-${data.ticket.ticketNumber || ticket.id}.pdf`);
                              }
                            }}>
                              <Download className="h-3 w-3 mr-1" /> Voucher
                            </Button>
                          )}
                          {ticket.status === "confirmed" && canApprove && (
                            <Button size="sm" variant="ghost" className="text-slate-600 h-7 text-xs px-2" onClick={() => { setRefundTicketId(ticket.id); setRefundForm({ refundAmount: String(ticket.totalAmount), penaltyAmount: "", reason: "" }); }}>
                              <RotateCcw className="h-3 w-3 mr-1" /> Refund
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Empty / Error States */}
          {isError && (
            <div className="p-6 text-center">
              <p className="text-sm text-red-500 mb-2">Failed to load tickets</p>
              <Button size="sm" variant="outline" onClick={() => (refetch as () => Promise<unknown>)()}>Retry</Button>
            </div>
          )}
          {!isLoading && !isError && (ticketsData?.items || []).length === 0 && (
            <div className="p-6 text-center text-slate-500 text-sm">
              No tickets found. {search && "Try adjusting your search."}
            </div>
          )}
          {ticketsData && ticketsData.total > ticketsData.limit && (
            <div className="flex justify-center p-3 gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm text-slate-500 py-2">Page {page} of {Math.ceil(ticketsData.total / ticketsData.limit)}</span>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(ticketsData.total / ticketsData.limit)} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Ticket Dialog */}
      <Dialog open={!!viewTicket} onOpenChange={() => setViewTicket(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader><DialogTitle>Ticket Details</DialogTitle></DialogHeader>
          {viewTicket && <TicketDetails id={viewTicket} />}
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={!!refundTicketId} onOpenChange={() => setRefundTicketId(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader><DialogTitle>Process Ticket Refund</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-4">
            <div>
              <label className="text-sm text-slate-500">Refund Amount (to customer)</label>
              <Input type="number" step="0.01" value={refundForm.refundAmount} onChange={e => setRefundForm(s => ({ ...s, refundAmount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className="text-sm text-slate-500">Penalty Amount (kept by agency)</label>
              <Input type="number" step="0.01" value={refundForm.penaltyAmount} onChange={e => setRefundForm(s => ({ ...s, penaltyAmount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className="text-sm text-slate-500">Reason</label>
              <Input value={refundForm.reason} onChange={e => setRefundForm(s => ({ ...s, reason: e.target.value }))} placeholder="Refund reason..." />
            </div>
            {refundForm.refundAmount && refundForm.penaltyAmount && Number(refundForm.refundAmount) + Number(refundForm.penaltyAmount) > 0 && (
              <div className="bg-slate-50 p-3 rounded text-sm">
                <p>Total Reversal: <span className="font-bold">${(Number(refundForm.refundAmount) + Number(refundForm.penaltyAmount)).toLocaleString()}</span></p>
                <p className="text-xs text-slate-500">Customer receives ${Number(refundForm.refundAmount).toLocaleString()}</p>
              </div>
            )}
            <Button
              className="w-full bg-indigo-600"
              disabled={!refundForm.refundAmount || refundTicket.isPending}
              onClick={() => refundTicket.mutate({
                id: refundTicketId!,
                refundAmount: refundForm.refundAmount,
                penaltyAmount: refundForm.penaltyAmount || undefined,
                reason: refundForm.reason || undefined,
              })}
            >
              {refundTicket.isPending ? "Processing..." : "Confirm Refund"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TicketDetails({ id }: { id: number }) {
  const { data: ticket } = trpc.ticket.get.useQuery({ id });
  if (!ticket) return null;

  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><Label className="text-xs text-slate-500">Ticket Number</Label><p className="font-medium text-sm">{ticket.ticketNumber}</p></div>
        <div><Label className="text-xs text-slate-500">PNR Code</Label><p className="font-medium text-sm">{ticket.pnrCode}</p></div>
        <div><Label className="text-xs text-slate-500">Route</Label><p className="font-medium text-sm">{ticket.routeFrom} → {ticket.routeTo}</p></div>
        <div><Label className="text-xs text-slate-500">Airline</Label><p className="font-medium text-sm">{ticket.airline?.name}</p></div>
        <div><Label className="text-xs text-slate-500">Travel Date</Label><p className="font-medium text-sm">{ticket.travelDate ? new Date(ticket.travelDate).toLocaleDateString() : "-"}</p></div>
        <div><Label className="text-xs text-slate-500">Class</Label><p className="font-medium text-sm capitalize">{ticket.class.replace("_", " ")}</p></div>
      </div>
      <div className="border-t pt-4">
        <Label className="text-xs text-slate-500">Financial Breakdown</Label>
        <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
          <span className="text-slate-600">Due:</span><span className="text-right font-medium">${Number(ticket.totalAmount).toLocaleString()}</span>
          <span className="text-slate-600">Tax:</span><span className="text-right font-medium">${Number(ticket.taxAmount).toLocaleString()}</span>
          <span className="text-slate-600">Total:</span><span className="text-right font-bold">${Number(ticket.totalAmount).toLocaleString()}</span>
          <span className="text-slate-600">Commission:</span><span className="text-right font-medium">${Number(ticket.commissionAmount).toLocaleString()}</span>
          <span className="text-slate-600">Net Payable:</span><span className="text-right font-bold">${Number(ticket.netPayable).toLocaleString()}</span>
        </div>
      </div>
      {ticket.passengers && ticket.passengers.length > 0 && (
        <div className="border-t pt-4">
          <Label className="text-xs text-slate-500">Passengers</Label>
          <div className="space-y-1 mt-2">
            {ticket.passengers.map((p, i) => (
              <p key={i} className="text-sm">{p.firstName} {p.lastName} ({p.passengerType}) {p.seatNumber && `- Seat ${p.seatNumber}`}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
