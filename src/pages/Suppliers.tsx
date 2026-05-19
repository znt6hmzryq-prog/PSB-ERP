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
import { Tractor, Search, Plus, Phone, Mail, MapPin, Building2, ArrowRight, Globe, CreditCard } from "lucide-react";
import { Link } from "react-router";

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-slate-100 text-slate-800",
  blocked: "bg-red-100 text-red-800",
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

export default function SuppliersPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [createOpen, setCreateOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: stats } = trpc.supplier.stats.useQuery();
  const { data: suppliersData, isLoading, error } = trpc.supplier.list.useQuery({
    search: search || undefined,
    type: typeFilter !== "__all__" ? typeFilter : undefined,
    status: statusFilter !== "__all__" ? statusFilter : undefined,
  });
  console.log("[Suppliers] suppliersData:", suppliersData, "isLoading:", isLoading, "error:", error);

  const createSupplier = trpc.supplier.create.useMutation({
    onSuccess: async () => {
      await utils.supplier.list.invalidate();
      await utils.supplier.stats.invalidate();
      setCreateOpen(false);
      resetForm();
    },
    onError: (err) => alert(err.message),
  });

  const [form, setForm] = useState({
    companyName: "",
    tradeName: "",
    supplierType: "other" as const,
    taxId: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    website: "",
    creditLimit: "",
    paymentTerms: "30",
    currency: "USD",
    notes: "",
  });

  const resetForm = () => setForm({
    companyName: "", tradeName: "", supplierType: "other", taxId: "", email: "", phone: "",
    address: "", city: "", country: "", website: "", creditLimit: "", paymentTerms: "30", currency: "USD", notes: "",
  });

  if (isLoading) return <div className="py-8 text-center text-slate-500">Loading suppliers...</div>;
  if (error) return <div className="py-8 text-center text-red-600">Error loading suppliers: {error.message}</div>;
  if (!suppliersData) return <div className="py-8 text-center text-slate-500">No supplier data available</div>;

  const handleCreate = () => {
    if (!form.companyName.trim()) return;
    createSupplier.mutate({
      companyName: form.companyName,
      tradeName: form.tradeName || undefined,
      supplierType: form.supplierType,
      taxId: form.taxId || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      country: form.country || undefined,
      website: form.website || undefined,
      creditLimit: Number(form.creditLimit) || 0,
      paymentTerms: Number(form.paymentTerms) || 30,
      currency: form.currency,
      notes: form.notes || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Suppliers & Vendors</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage airlines, hotels, tour operators and other suppliers</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="self-start sm:self-auto">
              <Plus className="h-4 w-4 mr-1" /> Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined} className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Supplier</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div>
                <Label>Company Name *</Label>
                <Input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} placeholder="e.g. Emirates Airlines" />
              </div>
              <div>
                <Label>Trade Name</Label>
                <Input value={form.tradeName} onChange={e => setForm({ ...form, tradeName: e.target.value })} placeholder="Optional trading name" />
              </div>
              <div>
                <Label>Supplier Type</Label>
                <Select value={form.supplierType} onValueChange={v => setForm({ ...form, supplierType: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="airline">Airline</SelectItem>
                    <SelectItem value="hotel">Hotel</SelectItem>
                    <SelectItem value="tour_operator">Tour Operator</SelectItem>
                    <SelectItem value="car_rental">Car Rental</SelectItem>
                    <SelectItem value="insurance">Insurance</SelectItem>
                    <SelectItem value="visa_service">Visa Service</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>City</Label>
                  <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tax ID</Label>
                  <Input value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} />
                </div>
                <div>
                  <Label>Website</Label>
                  <Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Credit Limit</Label>
                  <Input type="number" value={form.creditLimit} onChange={e => setForm({ ...form, creditLimit: e.target.value })} />
                </div>
                <div>
                  <Label>Terms (days)</Label>
                  <Input type="number" value={form.paymentTerms} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} maxLength={3} />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button onClick={handleCreate} disabled={createSupplier.isPending || !form.companyName.trim()} className="w-full">
                {createSupplier.isPending ? "Creating..." : "Create Supplier"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-50"><Tractor className="h-4 w-4 text-indigo-600" /></div>
              <span className="text-xs text-slate-500">Total Suppliers</span>
            </div>
            <p className="text-xl font-bold mt-1">{stats?.totalSuppliers ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-50"><Building2 className="h-4 w-4 text-emerald-600" /></div>
              <span className="text-xs text-slate-500">Active</span>
            </div>
            <p className="text-xl font-bold mt-1">{stats?.activeSuppliers ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-50"><CreditCard className="h-4 w-4 text-amber-600" /></div>
              <span className="text-xs text-slate-500">Total Payable</span>
            </div>
            <p className="text-xl font-bold mt-1">${(stats?.totalPayable ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-red-50"><ArrowRight className="h-4 w-4 text-red-600" /></div>
              <span className="text-xs text-slate-500">Overdue Bills</span>
            </div>
            <p className="text-xl font-bold mt-1">{stats?.overdueBills ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Types</SelectItem>
            <SelectItem value="airline">Airline</SelectItem>
            <SelectItem value="hotel">Hotel</SelectItem>
            <SelectItem value="tour_operator">Tour Operator</SelectItem>
            <SelectItem value="car_rental">Car Rental</SelectItem>
            <SelectItem value="insurance">Insurance</SelectItem>
            <SelectItem value="visa_service">Visa Service</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Supplier Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {(suppliersData?.items || []).map((supplier) => (
            <Card key={supplier.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-3 sm:p-4">
                <Link to={`/suppliers/${supplier.id}`} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs sm:text-sm flex-shrink-0">
                        {supplier.companyName?.[0] ?? "?"}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate">{supplier.companyName}</h3>
                        <p className="text-[10px] sm:text-xs text-slate-500">{supplier.supplierCode} · {typeLabels[supplier.supplierType] || supplier.supplierType}</p>
                      </div>
                    </div>
                    <Badge className={`text-[10px] sm:text-xs flex-shrink-0 ${statusColors[supplier.status] || ""}`}>{supplier.status}</Badge>
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs sm:text-sm text-slate-600">
                    {supplier.tradeName && <p className="flex items-center gap-1 truncate"><Building2 className="h-3 w-3 flex-shrink-0" /> {supplier.tradeName}</p>}
                    {supplier.email && <p className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 flex-shrink-0" /> {supplier.email}</p>}
                    {supplier.phone && <p className="flex items-center gap-1 truncate"><Phone className="h-3 w-3 flex-shrink-0" /> {supplier.phone}</p>}
                    {supplier.city && <p className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 flex-shrink-0" /> {supplier.city}{supplier.country ? `, ${supplier.country}` : ""}</p>}
                    {supplier.website && <p className="flex items-center gap-1 truncate"><Globe className="h-3 w-3 flex-shrink-0" /> {supplier.website}</p>}
                  </div>
                  <div className="mt-2 pt-2 border-t flex justify-between text-xs sm:text-sm">
                    <span className="text-slate-500">Terms: {supplier.paymentTerms} days</span>
                    <span className="font-semibold">${Number(supplier.balanceDue).toLocaleString()} due</span>
                  </div>
                  <div className="mt-2 text-right">
                    <span className="text-[10px] text-indigo-600 flex items-center justify-end gap-1">
                      View Details <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {suppliersData?.items?.length === 0 && !isLoading && (
        <div className="text-center py-12 text-slate-500">
          <Tractor className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p className="text-lg font-medium">No suppliers found</p>
          <p className="text-sm mt-1">Add your first supplier to get started</p>
        </div>
      )}
      {!suppliersData && !isLoading && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-sm">Failed to load suppliers. Check console.</p>
        </div>
      )}
    </div>
  );
}
