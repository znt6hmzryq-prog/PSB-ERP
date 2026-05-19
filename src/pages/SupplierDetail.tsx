import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Phone, Mail, MapPin, Globe, Building2,
  CreditCard, Receipt, DollarSign, Users, Calendar, AlertCircle,
} from "lucide-react";

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-slate-100 text-slate-800",
  blocked: "bg-red-100 text-red-800",
};

const billStatusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  open: "bg-blue-100 text-blue-800",
  partial: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const typeLabels: Record<string, string> = {
  airline: "Airline",
  hotel: "Hotel",
  tour_operator: "Tour Operator",
  car_rental: "Car Rental",
  insurance: "Insurance",
  visa_service: "Visa Service",
  other: "Other",
};

const paymentMethodLabels: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  credit_card: "Credit Card",
  wallet: "Wallet",
};

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supplierId = Number(id);

  const { data, isLoading, error } = trpc.supplier.detail.useQuery(
    { id: supplierId },
    { enabled: !!supplierId }
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
        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-red-400" />
        <p className="text-lg font-medium">Supplier not found</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/suppliers"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Suppliers</Link>
        </Button>
      </div>
    );
  }

  const { supplier, contacts, recentBills, recentPayments, stats } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link to="/suppliers"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg">
            {supplier.companyName[0]}
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{supplier.companyName}</h1>
            <p className="text-sm text-slate-500">{supplier.supplierCode} · {typeLabels[supplier.supplierType] || supplier.supplierType}</p>
          </div>
        </div>
        <Badge className={`self-start sm:self-auto ${statusColors[supplier.status] || ""}`}>{supplier.status}</Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-slate-500">Total Bills</p>
            <p className="text-xl font-bold mt-1">{stats.totalBills}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-slate-500">Total Amount</p>
            <p className="text-xl font-bold mt-1">${stats.totalAmount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-slate-500">Balance Due</p>
            <p className="text-xl font-bold mt-1 text-amber-600">${stats.totalDue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-slate-500">Overdue</p>
            <p className="text-xl font-bold mt-1 text-red-600">{stats.overdueBills}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Company Info</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {supplier.tradeName && <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400" /> {supplier.tradeName}</p>}
                {supplier.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /> {supplier.email}</p>}
                {supplier.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" /> {supplier.phone}</p>}
                {(supplier.address || supplier.city || supplier.country) && (
                  <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" />
                    {[supplier.address, supplier.city, supplier.country].filter(Boolean).join(", ")}
                  </p>
                )}
                {supplier.website && <p className="flex items-center gap-2"><Globe className="h-4 w-4 text-slate-400" /> {supplier.website}</p>}
                {supplier.taxId && <p className="text-slate-500">Tax ID: {supplier.taxId}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Financial Terms</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-slate-400" /> Credit Limit: ${Number(supplier.creditLimit).toLocaleString()}</p>
                <p className="flex items-center gap-2"><Calendar className="h-4 w-4 text-slate-400" /> Payment Terms: {supplier.paymentTerms} days</p>
                <p className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-slate-400" /> Currency: {supplier.currency}</p>
                <p className="flex items-center gap-2"><Receipt className="h-4 w-4 text-slate-400" /> Balance Due: ${Number(supplier.balanceDue).toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>
          {supplier.notes && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Notes</CardTitle></CardHeader>
              <CardContent className="text-sm text-slate-600">{supplier.notes}</CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Bills */}
        <TabsContent value="bills" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Recent Bills</CardTitle></CardHeader>
            <CardContent>
              {recentBills.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">No bills yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentBills.map(bill => (
                        <TableRow key={bill.id}>
                          <TableCell className="font-medium text-xs">{bill.billNumber}</TableCell>
                          <TableCell className="text-xs">{String(bill.issueDate)}</TableCell>
                          <TableCell className="text-xs">{String(bill.dueDate)}</TableCell>
                          <TableCell className="text-xs">${Number(bill.totalAmount).toLocaleString()}</TableCell>
                          <TableCell className="text-xs">${Number(bill.amountPaid).toLocaleString()}</TableCell>
                          <TableCell className="text-xs font-semibold">${Number(bill.balanceDue).toLocaleString()}</TableCell>
                          <TableCell><Badge className={`text-[10px] ${billStatusColors[bill.status] || ""}`}>{bill.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Recent Payments</CardTitle></CardHeader>
            <CardContent>
              {recentPayments.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">No payments yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentPayments.map(payment => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium text-xs">{payment.paymentNumber}</TableCell>
                          <TableCell className="text-xs">{String(payment.paymentDate)}</TableCell>
                          <TableCell className="text-xs font-semibold">${Number(payment.amount).toLocaleString()}</TableCell>
                          <TableCell className="text-xs">{paymentMethodLabels[payment.paymentMethod] || payment.paymentMethod}</TableCell>
                          <TableCell className="text-xs">{payment.referenceNumber || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts */}
        <TabsContent value="contacts" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Contacts</CardTitle></CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">No contacts added</p>
              ) : (
                <div className="space-y-3">
                  {contacts.map(contact => (
                    <div key={contact.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Users className="h-5 w-5 text-slate-400 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{contact.name}</p>
                          {contact.isPrimary && <Badge className="text-[10px] bg-indigo-100 text-indigo-800">Primary</Badge>}
                        </div>
                        {contact.position && <p className="text-xs text-slate-500">{contact.position}</p>}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-600">
                          {contact.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {contact.email}</span>}
                          {contact.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {contact.phone}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
