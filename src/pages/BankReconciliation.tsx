import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Landmark, Plus, CheckCircle2, Circle, AlertCircle,
  XCircle, ArrowRightLeft,
} from "lucide-react";

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  partial: "bg-purple-100 text-purple-800",
  reconciled: "bg-emerald-100 text-emerald-800",
};

const lineStatusColors: Record<string, string> = {
  unmatched: "bg-amber-100 text-amber-800",
  matched: "bg-emerald-100 text-emerald-800",
  ignored: "bg-slate-100 text-slate-800",
};

export default function BankReconciliationPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<number | null>(null);
  const [lineInputs, setLineInputs] = useState([{ transactionDate: "", description: "", reference: "", debit: "", credit: "", balance: "" }]);

  const utils = trpc.useUtils();
  const { data: stats } = trpc.bankReconciliation.stats.useQuery();
  const { data: accounts } = trpc.bankReconciliation.bankAccounts.useQuery();
  const { data: statementsData, isLoading } = trpc.bankReconciliation.statements.useQuery({});

  const createStatement = trpc.bankReconciliation.createStatement.useMutation({
    onSuccess: async () => {
      await utils.bankReconciliation.statements.invalidate();
      await utils.bankReconciliation.stats.invalidate();
      setCreateOpen(false);
      setLineInputs([{ transactionDate: "", description: "", reference: "", debit: "", credit: "", balance: "" }]);
    },
    onError: (err) => alert(err.message),
  });

  const autoMatch = trpc.bankReconciliation.autoMatch.useMutation({
    onSuccess: async () => {
      await utils.bankReconciliation.statementDetail.invalidate();
      await utils.bankReconciliation.statements.invalidate();
      await utils.bankReconciliation.stats.invalidate();
    },
    onError: (err) => alert(err.message),
  });

  const [form, setForm] = useState({
    accountId: "",
    statementDate: new Date().toISOString().split("T")[0],
    startDate: "",
    endDate: "",
    openingBalance: "",
    closingBalance: "",
    notes: "",
  });

  const addLine = () => setLineInputs([...lineInputs, { transactionDate: "", description: "", reference: "", debit: "", credit: "", balance: "" }]);
  const removeLine = (idx: number) => setLineInputs(lineInputs.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: string, value: string) => {
    const lines = [...lineInputs];
    lines[idx] = { ...lines[idx], [field]: value };
    setLineInputs(lines);
  };

  const handleCreate = () => {
    if (!form.accountId || !form.startDate || !form.endDate) return;
    const validLines = lineInputs.filter(l => l.transactionDate && l.description && (l.debit || l.credit));
    createStatement.mutate({
      accountId: Number(form.accountId),
      statementDate: form.statementDate,
      startDate: form.startDate,
      endDate: form.endDate,
      openingBalance: Number(form.openingBalance) || 0,
      closingBalance: Number(form.closingBalance) || 0,
      notes: form.notes || undefined,
      lines: validLines.map(l => ({
        transactionDate: l.transactionDate,
        description: l.description,
        reference: l.reference || undefined,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        balance: Number(l.balance) || 0,
      })),
    });
  };

  const { data: detailData } = trpc.bankReconciliation.statementDetail.useQuery(
    { id: selectedStatement! },
    { enabled: !!selectedStatement }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Bank Reconciliation</h1>
          <p className="text-slate-500 mt-1 text-sm">Match bank statements with ledger entries</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="self-start sm:self-auto"><Plus className="h-4 w-4 mr-1" /> New Statement</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Upload Bank Statement</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div>
                <Label>Bank Account *</Label>
                <Select value={form.accountId} onValueChange={v => setForm({ ...form, accountId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {(accounts || []).map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date *</Label><Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
                <div><Label>End Date *</Label><Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
              </div>
              <div>
                <Label>Statement Date</Label>
                <Input type="date" value={form.statementDate} onChange={e => setForm({ ...form, statementDate: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Opening Balance</Label><Input type="number" value={form.openingBalance} onChange={e => setForm({ ...form, openingBalance: e.target.value })} /></div>
                <div><Label>Closing Balance</Label><Input type="number" value={form.closingBalance} onChange={e => setForm({ ...form, closingBalance: e.target.value })} /></div>
              </div>
              <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Statement Lines</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>+ Add Line</Button>
                </div>
                {lineInputs.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end text-xs">
                    <div className="col-span-2"><Input type="date" value={line.transactionDate} onChange={e => updateLine(idx, "transactionDate", e.target.value)} /></div>
                    <div className="col-span-3"><Input value={line.description} onChange={e => updateLine(idx, "description", e.target.value)} placeholder="Description" /></div>
                    <div className="col-span-2"><Input value={line.reference} onChange={e => updateLine(idx, "reference", e.target.value)} placeholder="Ref" /></div>
                    <div className="col-span-1"><Input type="number" value={line.debit} onChange={e => updateLine(idx, "debit", e.target.value)} placeholder="Dr" /></div>
                    <div className="col-span-1"><Input type="number" value={line.credit} onChange={e => updateLine(idx, "credit", e.target.value)} placeholder="Cr" /></div>
                    <div className="col-span-1"><Input type="number" value={line.balance} onChange={e => updateLine(idx, "balance", e.target.value)} placeholder="Bal" /></div>
                    <div className="col-span-1"><Button type="button" variant="ghost" size="sm" onClick={() => removeLine(idx)} className="text-red-500">×</Button></div>
                  </div>
                ))}
              </div>
              <Button onClick={handleCreate} disabled={createStatement.isPending} className="w-full">
                {createStatement.isPending ? "Creating..." : "Create Statement"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        {[
          { label: "Total", value: stats?.totalStatements ?? 0, icon: Landmark },
          { label: "Reconciled", value: stats?.reconciled ?? 0, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Partial", value: stats?.partial ?? 0, icon: AlertCircle, color: "text-purple-600" },
          { label: "Pending", value: stats?.pending ?? 0, icon: Circle, color: "text-amber-600" },
          { label: "Unmatched", value: stats?.unmatchedLines ?? 0, icon: XCircle, color: "text-red-600" },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <s.icon className={`h-4 w-4 ${s.color || "text-slate-500"}`} />
                <span className="text-xs text-slate-500">{s.label}</span>
              </div>
              <p className="text-xl font-bold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="statements">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="statements">Statements</TabsTrigger>
          <TabsTrigger value="detail" disabled={!selectedStatement}>Detail</TabsTrigger>
        </TabsList>

        <TabsContent value="statements" className="mt-4">
          {isLoading ? (
            <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Opening</TableHead>
                    <TableHead>Closing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(statementsData?.items || []).map(stmt => (
                    <TableRow key={stmt.id} className="cursor-pointer" onClick={() => setSelectedStatement(stmt.id)}>
                      <TableCell className="font-medium text-xs">{(stmt as any).account?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{String(stmt.startDate)} → {String(stmt.endDate)}</TableCell>
                      <TableCell className="text-xs">${Number(stmt.openingBalance).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">${Number(stmt.closingBalance).toLocaleString()}</TableCell>
                      <TableCell><Badge className={`text-[10px] ${statusColors[stmt.status] || ""}`}>{stmt.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedStatement(stmt.id); }}>View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="detail" className="mt-4 space-y-4">
          {detailData && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{(detailData.account as any)?.name || "Bank Account"}</h2>
                  <p className="text-sm text-slate-500">{String(detailData.statement.startDate)} → {String(detailData.statement.endDate)}</p>
                </div>
                <div className="flex gap-2">
                  {detailData.statement.status !== "reconciled" && (
                    <Button size="sm" onClick={() => autoMatch.mutate({ statementId: detailData.statement.id })} disabled={autoMatch.isPending}>
                      <ArrowRightLeft className="h-4 w-4 mr-1" /> {autoMatch.isPending ? "Matching..." : "Auto Match"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setSelectedStatement(null)}>Back</Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="border-0 shadow-sm"><CardContent className="p-3"><p className="text-xs text-slate-500">Opening</p><p className="text-lg font-bold">${Number(detailData.statement.openingBalance).toLocaleString()}</p></CardContent></Card>
                <Card className="border-0 shadow-sm"><CardContent className="p-3"><p className="text-xs text-slate-500">Closing</p><p className="text-lg font-bold">${Number(detailData.statement.closingBalance).toLocaleString()}</p></CardContent></Card>
                <Card className="border-0 shadow-sm"><CardContent className="p-3"><p className="text-xs text-slate-500">Debits</p><p className="text-lg font-bold">${Number(detailData.statement.totalDebits).toLocaleString()}</p></CardContent></Card>
                <Card className="border-0 shadow-sm"><CardContent className="p-3"><p className="text-xs text-slate-500">Credits</p><p className="text-lg font-bold">${Number(detailData.statement.totalCredits).toLocaleString()}</p></CardContent></Card>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Debit</TableHead>
                      <TableHead>Credit</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailData.lines || []).map(line => (
                      <TableRow key={line.id}>
                        <TableCell className="text-xs">{String(line.transactionDate)}</TableCell>
                        <TableCell className="text-xs">{line.description}</TableCell>
                        <TableCell className="text-xs">{line.reference || "—"}</TableCell>
                        <TableCell className="text-xs">{Number(line.debit) > 0 ? `$${Number(line.debit).toLocaleString()}` : "—"}</TableCell>
                        <TableCell className="text-xs">{Number(line.credit) > 0 ? `$${Number(line.credit).toLocaleString()}` : "—"}</TableCell>
                        <TableCell><Badge className={`text-[10px] ${lineStatusColors[line.status] || ""}`}>{line.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
