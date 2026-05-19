import { useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Plane, Receipt, DollarSign, MessageSquare, User, Phone, Mail, MapPin, BookOpen } from "lucide-react";
import { Link } from "react-router";

const statusColors: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-slate-100 text-slate-800",
  completed: "bg-blue-100 text-blue-800",
};

const txTypeColors: Record<string, string> = {
  receivable: "bg-orange-100 text-orange-700",
  payment: "bg-green-100 text-green-700",
  deposit: "bg-blue-100 text-blue-700",
  credit: "bg-purple-100 text-purple-700",
  refund: "bg-red-100 text-red-700",
  adjustment: "bg-gray-100 text-gray-700",
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);

  const { data, isLoading, error } = trpc.crm.customerDetail.useQuery(
    { id: customerId },
    { enabled: !!customerId }
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">Failed to load customer details</p>
        <Button variant="outline" asChild>
          <Link to="/crm"><ArrowLeft className="h-4 w-4 mr-2" /> Back to CRM</Link>
        </Button>
      </div>
    );
  }

  const { customer, stats, recentTickets, recentInvoices, recentTransactions, recentInteractions } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link to="/crm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">
            {customer.firstName} {customer.lastName}
          </h1>
          <p className="text-slate-500 text-sm">{customer.customerCode}</p>
        </div>
        <Badge className={customer.status === "active" ? "bg-emerald-100 text-emerald-700" : customer.status === "vip" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"}>
          {customer.status}
        </Badge>
      </div>

      {/* Contact Info */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            {customer.email && <span className="flex items-center gap-1"><Mail className="h-4 w-4" /> {customer.email}</span>}
            {customer.phone && <span className="flex items-center gap-1"><Phone className="h-4 w-4" /> {customer.phone}</span>}
            {customer.company && <span className="flex items-center gap-1"><User className="h-4 w-4" /> {customer.company}</span>}
            {(customer.city || customer.country) && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {[customer.city, customer.country].filter(Boolean).join(", ")}</span>}
            {customer.customerType && <span className="flex items-center gap-1"><BookOpen className="h-4 w-4" /> {customer.customerType}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <Plane className="h-4 w-4" /> Bookings
            </div>
            <p className="text-2xl font-bold">{stats.totalBookings}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <Receipt className="h-4 w-4" /> Total Revenue
            </div>
            <p className="text-2xl font-bold">${stats.totalRevenue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <DollarSign className="h-4 w-4" /> Total Paid
            </div>
            <p className="text-2xl font-bold">${stats.totalPaid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <DollarSign className="h-4 w-4" /> Balance Due
            </div>
            <p className={`text-2xl font-bold ${stats.balanceDue > 0 ? "text-red-600" : "text-emerald-600"}`}>
              ${stats.balanceDue.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="bookings">
        <TabsList className="bg-white border w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="bookings"><Plane className="h-4 w-4 mr-1" /> Bookings</TabsTrigger>
          <TabsTrigger value="invoices"><Receipt className="h-4 w-4 mr-1" /> Invoices</TabsTrigger>
          <TabsTrigger value="transactions"><DollarSign className="h-4 w-4 mr-1" /> Transactions</TabsTrigger>
          <TabsTrigger value="interactions"><MessageSquare className="h-4 w-4 mr-1" /> Interactions</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Recent Bookings</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket #</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Travel Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTickets.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No bookings found.</TableCell></TableRow>
                  )}
                  {recentTickets.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.ticketNumber}</TableCell>
                      <TableCell>{t.routeFrom} → {t.routeTo}</TableCell>
                      <TableCell>{t.travelDate ? new Date(t.travelDate).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>${Number(t.totalAmount).toLocaleString()}</TableCell>
                      <TableCell><Badge className={statusColors[t.status] || "bg-gray-100"}>{t.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Recent Invoices</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentInvoices.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No invoices found.</TableCell></TableRow>
                  )}
                  {recentInvoices.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell>{new Date(inv.issueDate).toLocaleDateString()}</TableCell>
                      <TableCell>${Number(inv.totalAmount).toLocaleString()}</TableCell>
                      <TableCell>${Number(inv.paidAmount).toLocaleString()}</TableCell>
                      <TableCell><Badge className={inv.status === "paid" ? "bg-green-100 text-green-700" : inv.status === "overdue" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}>{inv.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Transaction History</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransactions.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">No transactions found.</TableCell></TableRow>
                  )}
                  {recentTransactions.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell>{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell><Badge className={txTypeColors[tx.type] || "bg-gray-100"}>{tx.type}</Badge></TableCell>
                      <TableCell>${Number(tx.amount).toLocaleString()}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{tx.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interactions" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Recent Interactions</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {recentInteractions.length === 0 && (
                  <p className="text-center py-8 text-slate-500">No interactions found.</p>
                )}
                {recentInteractions.map((ia: any) => (
                  <div key={ia.id} className="p-4 hover:bg-slate-50">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{ia.subject}</p>
                      <Badge variant="outline" className="text-[10px]">{ia.type}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{ia.description}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{new Date(ia.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
