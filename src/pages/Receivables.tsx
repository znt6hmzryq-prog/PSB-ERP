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
import { Search, DollarSign, FileText, TrendingUp } from "lucide-react";

const typeColors: Record<string, string> = {
  receivable: "bg-orange-100 text-orange-700",
  payment: "bg-green-100 text-green-700",
  deposit: "bg-blue-100 text-blue-700",
  credit: "bg-purple-100 text-purple-700",
  refund: "bg-red-100 text-red-700",
  adjustment: "bg-gray-100 text-gray-700",
};

export default function ReceivablesPage() {
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", description: "" });

  const { data, isLoading, error, refetch } = trpc.receivable.list.useQuery(
    { page: 1, limit: 50 }
  );
  const { data: balanceData } = trpc.receivable.customerBalance.useQuery(
    { customerId: selectedCustomerId! },
    { enabled: !!selectedCustomerId }
  );
  const { data: statementData } = trpc.receivable.statement.useQuery(
    { customerId: selectedCustomerId! },
    { enabled: !!selectedCustomerId }
  );
  const { data: agingData } = trpc.receivable.aging.useQuery();

  const createPayment = trpc.receivable.createPayment.useMutation({
    onSuccess: () => {
      refetch();
      setPaymentForm({ amount: "", description: "" });
    },
  });

  const agingBuckets = agingData
    ? [
        { label: "Current", amount: agingData.current },
        { label: "1-30 Days", amount: agingData.d30 },
        { label: "31-60 Days", amount: agingData.d60 },
        { label: "60+ Days", amount: agingData.d90 },
      ]
    : [];

  const totalReceivable = agingBuckets.reduce((sum, g) => sum + Number(g.amount), 0);

  const filteredItems = search
    ? data?.items?.filter((tx: any) => {
        const customerName = `${tx.customer?.firstName || ""} ${tx.customer?.lastName || ""}`.toLowerCase();
        return (
          customerName.includes(search.toLowerCase()) ||
          (tx.description || "").toLowerCase().includes(search.toLowerCase())
        );
      })
    : data?.items;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customer Receivables</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp className="h-4 w-4" />
            Total Receivables
          </div>
          <p className="text-2xl font-bold">${totalReceivable.toLocaleString()}</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <DollarSign className="h-4 w-4" />
            Total Customers
          </div>
          <p className="text-2xl font-bold">{new Set(data?.items?.map((t: any) => t.customerId)).size}</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <FileText className="h-4 w-4" />
            Transactions
          </div>
          <p className="text-2xl font-bold">{data?.items?.length ?? 0}</p>
        </div>
      </div>

      {/* Aging Report */}
      {agingBuckets.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Aging Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {agingBuckets.map((bucket) => (
              <div key={bucket.label} className="bg-gray-50 rounded p-3">
                <p className="text-xs text-gray-500">{bucket.label}</p>
                <p className="text-lg font-semibold">${Number(bucket.amount).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by customer or reference..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-red-500 mb-2">Failed to load receivables</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    No receivable transactions found.
                  </TableCell>
                </TableRow>
              )}
              {filteredItems?.map((tx: any) => (
                <TableRow key={tx.id}>
                  <TableCell>
                    <span className="font-medium">{tx.customer?.firstName} {tx.customer?.lastName}</span>
                    <p className="text-xs text-gray-500">{tx.customer?.email}</p>
                  </TableCell>
                  <TableCell>
                    <Badge className={typeColors[tx.type] || "bg-gray-100"}>
                      {tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell className={tx.type === "payment" || tx.type === "credit" || tx.type === "refund" ? "text-green-600" : "text-orange-600"}>
                    {tx.type === "payment" || tx.type === "credit" || tx.type === "refund" ? "-" : "+"}
                    ${Number(tx.amount).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">${Number(tx.balance).toLocaleString()}</TableCell>
                  <TableCell>{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{tx.description}</TableCell>
                  <TableCell className="text-right">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedCustomerId(tx.customerId)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>
                            Statement — {tx.customer?.firstName} {tx.customer?.lastName}
                          </DialogTitle>
                        </DialogHeader>
                        {balanceData !== undefined && (
                          <div className="bg-gray-50 p-3 rounded mb-3">
                            <p className="text-sm text-gray-500">Current Balance</p>
                            <p className={`text-xl font-bold ${balanceData.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                              ${Number(balanceData.balance).toLocaleString()}
                            </p>
                          </div>
                        )}

                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" className="mb-2">
                              <DollarSign className="h-4 w-4 mr-1" /> Record Payment
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Record Payment</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                              <div>
                                <label className="text-sm text-gray-500">Customer</label>
                                <p className="font-medium">{tx.customer?.firstName} {tx.customer?.lastName}</p>
                              </div>
                              <div>
                                <label className="text-sm text-gray-500">Amount</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={paymentForm.amount}
                                  onChange={(e) => setPaymentForm((s) => ({ ...s, amount: e.target.value }))}
                                  placeholder="0.00"
                                />
                              </div>
                              <div>
                                <label className="text-sm text-gray-500">Description</label>
                                <Input
                                  value={paymentForm.description}
                                  onChange={(e) => setPaymentForm((s) => ({ ...s, description: e.target.value }))}
                                  placeholder="Payment description..."
                                />
                              </div>
                              <Button
                                className="w-full"
                                disabled={createPayment.isPending || !paymentForm.amount}
                                onClick={() =>
                                  createPayment.mutate({
                                    customerId: tx.customerId,
                                    amount: paymentForm.amount,
                                    description: paymentForm.description,
                                  })
                                }
                              >
                                {createPayment.isPending ? "Processing..." : "Record Payment"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Balance</TableHead>
                              <TableHead>Description</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {statementData?.transactions?.map((stmt: any) => (
                              <TableRow key={stmt.id}>
                                <TableCell>{new Date(stmt.createdAt).toLocaleDateString()}</TableCell>
                                <TableCell>
                                  <Badge className={typeColors[stmt.type] || "bg-gray-100"}>
                                    {stmt.type}
                                  </Badge>
                                </TableCell>
                                <TableCell>${Number(stmt.amount).toLocaleString()}</TableCell>
                                <TableCell>${Number(stmt.balance).toLocaleString()}</TableCell>
                                <TableCell className="max-w-[150px] truncate">{stmt.description}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
