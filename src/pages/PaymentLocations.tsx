import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Search, Plus, MapPin, Phone, Clock, Mail } from "lucide-react";

export default function PaymentLocationsPage() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: "", city: "", address: "", phone: "", email: "", openingHours: "" });

  const { data, isLoading, error, refetch } = trpc.paymentLocation.list.useQuery({});
  const createLocation = trpc.paymentLocation.create.useMutation({
    onSuccess: () => { refetch(); setCreateOpen(false); setNewLoc({ name: "", city: "", address: "", phone: "", email: "", openingHours: "" }); },
    onError: (err) => alert(err.message),
  });

  const filtered = search
    ? data?.items?.filter((l: any) =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.city.toLowerCase().includes(search.toLowerCase())
      )
    : data?.items;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Payment Locations</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage offices and payment collection points</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700"><Plus className="h-4 w-4 mr-2" /> Add Location</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Payment Location</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-4">
              <div><label className="text-sm text-slate-500">Name</label><Input value={newLoc.name} onChange={e => setNewLoc(s => ({ ...s, name: e.target.value }))} placeholder="e.g. Balkh Travel Mazar" /></div>
              <div><label className="text-sm text-slate-500">City</label><Input value={newLoc.city} onChange={e => setNewLoc(s => ({ ...s, city: e.target.value }))} placeholder="e.g. Mazar-i-Sharif" /></div>
              <div><label className="text-sm text-slate-500">Address</label><Input value={newLoc.address} onChange={e => setNewLoc(s => ({ ...s, address: e.target.value }))} placeholder="Full address" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm text-slate-500">Phone</label><Input value={newLoc.phone} onChange={e => setNewLoc(s => ({ ...s, phone: e.target.value }))} placeholder="Phone" /></div>
                <div><label className="text-sm text-slate-500">Email</label><Input value={newLoc.email} onChange={e => setNewLoc(s => ({ ...s, email: e.target.value }))} placeholder="Email" /></div>
              </div>
              <div><label className="text-sm text-slate-500">Opening Hours</label><Input value={newLoc.openingHours} onChange={e => setNewLoc(s => ({ ...s, openingHours: e.target.value }))} placeholder="e.g. Sat-Thu 8:00-17:00" /></div>
              <Button className="w-full bg-indigo-600" disabled={!newLoc.name || !newLoc.city || createLocation.isPending} onClick={() => createLocation.mutate(newLoc)}>
                {createLocation.isPending ? "Creating..." : "Create Location"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input placeholder="Search locations..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : error ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-red-500 mb-2">Failed to load locations</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered?.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-500">No payment locations found.</div>
          )}
          {filtered?.map((loc: any) => (
            <Card key={loc.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-base">{loc.name}</h3>
                    <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {loc.city}
                    </div>
                  </div>
                  <Badge className={loc.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>
                    {loc.status}
                  </Badge>
                </div>
                {loc.address && <p className="text-sm text-slate-600 mt-2">{loc.address}</p>}
                <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-500">
                  {loc.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {loc.phone}</span>}
                  {loc.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {loc.email}</span>}
                  {loc.openingHours && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {loc.openingHours}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
