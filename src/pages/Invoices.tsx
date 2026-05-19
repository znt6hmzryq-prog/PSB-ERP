import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Eye, DollarSign, Download } from "lucide-react";
import { generateInvoicePDF } from "@/lib/invoicePdf";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-orange-100 text-orange-700",
};

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading, error, refetch } = trpc.invoice.list.useQuery(
    { search: search || undefined, status: statusFilter || undefined, page: 1, limit: 50 }
  );
  const { data: invoiceDetail } = trpc.invoice.get.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const recordPayment = trpc.invoice.recordPayment.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedId(null);
    },
  });

  const [paymentForm, setPaymentForm] = useState({ amount: "" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invoices</h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search invoices..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-white"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-red-500 mb-2">Failed to load invoices</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    No invoices found.
                  </TableCell>
                </TableRow>
              )}
              {data?.items?.map((inv: any) => {
                const balance = Number(inv.totalAmount) - Number(inv.paidAmount);
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                    <TableCell>
                      {inv.customer ? `${inv.customer.firstName || ""} ${inv.customer.lastName || ""}`.trim() || "—" : "—"}
                    </TableCell>
                    <TableCell>{new Date(inv.issueDate).toLocaleDateString()}</TableCell>
                    <TableCell>${Number(inv.totalAmount).toLocaleString()}</TableCell>
                    <TableCell>${Number(inv.paidAmount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[inv.status] || "bg-gray-100"}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => setSelectedId(inv.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Invoice {inv.invoiceNumber}</DialogTitle>
                          </DialogHeader>
                          {invoiceDetail ? (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-gray-500">Customer</p>
                                  <p className="font-medium">
                                    {invoiceDetail.customer?.firstName} {invoiceDetail.customer?.lastName}
                                  </p>
                                  <p>{invoiceDetail.customer?.email}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-gray-500">Issue Date</p>
                                  <p>{new Date(invoiceDetail.issueDate).toLocaleDateString()}</p>
                                  {invoiceDetail.dueDate && (
                                    <>
                                      <p className="text-gray-500 mt-1">Due Date</p>
                                      <p>{new Date(invoiceDetail.dueDate).toLocaleDateString()}</p>
                                    </>
                                  )}
                                </div>
                              </div>

                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Qty</TableHead>
                                    <TableHead>Unit Price</TableHead>
                                    <TableHead>Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {invoiceDetail.items?.map((item: any) => (
                                    <TableRow key={item.id}>
                                      <TableCell>{item.description}</TableCell>
                                      <TableCell>{item.quantity}</TableCell>
                                      <TableCell>${Number(item.unitPrice).toLocaleString()}</TableCell>
                                      <TableCell>${Number(item.totalPrice).toLocaleString()}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>

                              <div className="flex justify-end space-y-1 text-sm">
                                <div className="w-48">
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Subtotal</span>
                                    <span>${Number(invoiceDetail.subtotal).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Tax</span>
                                    <span>${Number(invoiceDetail.taxAmount).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between font-semibold text-base mt-1 pt-1 border-t">
                                    <span>Total</span>
                                    <span>${Number(invoiceDetail.totalAmount).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Paid</span>
                                    <span>${Number(invoiceDetail.paidAmount).toLocaleString()}</span>
                                  </div>
                                  {balance > 0 && (
                                    <div className="flex justify-between text-red-600 font-medium">
                                      <span>Balance</span>
                                      <span>${balance.toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {invoiceDetail.notes && (
                                <div className="text-sm bg-gray-50 p-3 rounded">
                                  <p className="text-gray-500 mb-1">Notes</p>
                                  <p>{invoiceDetail.notes}</p>
                                </div>
                              )}

                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => generateInvoicePDF(invoiceDetail)}
                                >
                                  <Download className="h-4 w-4 mr-1" /> Download PDF
                                </Button>
                                {balance > 0 && invoiceDetail.status !== "cancelled" && (
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button size="sm">
                                        <DollarSign className="h-4 w-4 mr-1" /> Record Payment
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle>Record Payment</DialogTitle>
                                      </DialogHeader>
                                      <div className="space-y-3">
                                        <div>
                                          <label className="text-sm text-gray-500">Balance Due</label>
                                          <p className="text-lg font-semibold">${balance.toLocaleString()}</p>
                                        </div>
                                        <div>
                                          <label className="text-sm text-gray-500">Payment Amount</label>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={paymentForm.amount}
                                            onChange={(e) => setPaymentForm({ amount: e.target.value })}
                                            placeholder="0.00"
                                          />
                                        </div>
                                        <Button
                                          className="w-full"
                                          disabled={recordPayment.isPending || !paymentForm.amount}
                                          onClick={() =>
                                            recordPayment.mutate({
                                              id: inv.id,
                                              amount: paymentForm.amount,
                                            })
                                          }
                                        >
                                          {recordPayment.isPending ? "Processing..." : "Confirm Payment"}
                                        </Button>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                )}
                              </div>
                            </div>
                          ) : (
                            <Skeleton className="h-64 w-full" />
                          )}
                        </DialogContent>
                      </Dialog>
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
