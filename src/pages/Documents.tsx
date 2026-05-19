import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileText, Trash2, FileCheck } from "lucide-react";

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  generated: "bg-blue-100 text-blue-800",
  sent: "bg-emerald-100 text-emerald-800",
  archived: "bg-gray-100 text-gray-800",
};

const typeLabels: Record<string, string> = {
  invoice: "Invoice",
  receipt: "Receipt",
  voucher: "Voucher",
  statement: "Statement",
  report: "Report",
  attachment: "Attachment",
};

const entityLabels: Record<string, string> = {
  invoice: "Invoice",
  ticket: "Ticket",
  deposit: "Deposit",
  supplier_payment: "Payment",
  expense: "Expense",
  report: "Report",
  other: "Other",
};

export default function DocumentsPage() {
  const [entityType, setEntityType] = useState("__all__");
  const [documentType, setDocumentType] = useState("__all__");

  const utils = trpc.useUtils();
  const { data: stats } = trpc.document.stats.useQuery();
  const { data: docsData, isLoading, error } = trpc.document.list.useQuery({
    entityType: entityType !== "__all__" ? entityType : undefined,
    documentType: documentType !== "__all__" ? documentType : undefined,
  });
  console.log("[Documents] docsData:", docsData, "isLoading:", isLoading, "error:", error);

  const deleteDoc = trpc.document.delete.useMutation({
    onSuccess: async () => {
      await utils.document.list.invalidate();
      await utils.document.stats.invalidate();
    },
  });

  if (isLoading) return <div className="py-8 text-center text-slate-500">Loading documents...</div>;
  if (error) return <div className="py-8 text-center text-red-600">Error loading documents: {error.message}</div>;
  if (!docsData) return <div className="py-8 text-center text-slate-500">No documents available</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Documents</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage generated PDFs and attachments</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-50"><FileText className="h-4 w-4 text-blue-600" /></div>
              <span className="text-xs text-slate-500">Total Documents</span>
            </div>
            <p className="text-xl font-bold mt-1">{stats?.totalDocuments ?? 0}</p>
          </CardContent>
        </Card>
        {(stats?.byType || []).map(t => (
          <Card key={t.type} className="border-0 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs text-slate-500">{typeLabels[t.type] || t.type}</p>
              <p className="text-xl font-bold mt-1">{t.count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Entity Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Entities</SelectItem>
            <SelectItem value="invoice">Invoice</SelectItem>
            <SelectItem value="ticket">Ticket</SelectItem>
            <SelectItem value="deposit">Deposit</SelectItem>
            <SelectItem value="supplier_payment">Payment</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="report">Report</SelectItem>
          </SelectContent>
        </Select>
        <Select value={documentType} onValueChange={setDocumentType}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Doc Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Types</SelectItem>
            <SelectItem value="invoice">Invoice</SelectItem>
            <SelectItem value="receipt">Receipt</SelectItem>
            <SelectItem value="voucher">Voucher</SelectItem>
            <SelectItem value="statement">Statement</SelectItem>
            <SelectItem value="report">Report</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Document List */}
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(docsData?.items || []).map(doc => (
                <TableRow key={doc.id}>
                  <TableCell className="text-xs font-medium">{doc.fileName || doc.documentNumber || "—"}</TableCell>
                  <TableCell className="text-xs">{typeLabels[doc.documentType] || doc.documentType}</TableCell>
                  <TableCell className="text-xs">{entityLabels[doc.entityType] || doc.entityType} #{doc.entityId}</TableCell>
                  <TableCell className="text-xs">{doc.generatedAt ? String(doc.generatedAt) : "—"}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${statusColors[doc.status] || ""}`}>{doc.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => deleteDoc.mutate({ id: doc.id })}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {docsData?.items?.length === 0 && !isLoading && (
        <div className="text-center py-12 text-slate-500">
          <FileCheck className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p className="text-lg font-medium">No documents yet</p>
          <p className="text-sm mt-1">Generate PDFs from invoices, tickets, or deposits</p>
        </div>
      )}
      {!docsData && !isLoading && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-sm">Failed to load documents. Check console.</p>
        </div>
      )}
    </div>
  );
}
