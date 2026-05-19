import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  CheckCircle,
  XCircle,
  Shield,
  Filter,
  Building2,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

type StatusFilter =
  | "pending"
  | "active"
  | "rejected"
  | "suspended"
  | "all";

type Tenant = {
  id: number;
  name: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  city?: string;
  plan?: string;
  registrationToken?: string;
  status?: string;
};

export default function AdminPage() {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation("common");

  const [search, setSearch] = useState("");
  const [status] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] =
    useState<"approve" | "reject" | null>(null);

  const [selectedTenant, setSelectedTenant] =
    useState<Tenant | null>(null);

  const [rejectReason, setRejectReason] =
    useState("");

  const utils = trpc.useUtils();

  const { data: stats } =
    trpc.admin.stats.useQuery();

  const {
    data: registrations,
    isLoading,
  } =
    trpc.admin.registrations.useQuery({
      status,
      search: search || undefined,
      page,
      limit: 20,
    });

  const approveMutation =
    trpc.admin.approveRegistration.useMutation({
      onSuccess: () => {
        toast.success(t("approvalSuccess"));
        utils.admin.registrations.invalidate();
        utils.admin.stats.invalidate();
        setDialogOpen(false);
      },
      onError: (err) =>
        toast.error(err.message),
    });

  const rejectMutation =
    trpc.admin.rejectRegistration.useMutation({
      onSuccess: () => {
        toast.success(t("rejectionSuccess"));
        utils.admin.registrations.invalidate();
        utils.admin.stats.invalidate();
        setDialogOpen(false);
        setRejectReason("");
      },
      onError: (err) =>
        toast.error(err.message),
    });

  const openDialog = (
    action: "approve" | "reject",
    tenant: Tenant
  ) => {
    setDialogAction(action);
    setSelectedTenant(tenant);
    setDialogOpen(true);
  };

  const handleConfirm = () => {
    if (!selectedTenant) return;

    if (dialogAction === "approve") {
      approveMutation.mutate({
        tenantId: selectedTenant.id,
      });
    } else {
      rejectMutation.mutate({
        tenantId: selectedTenant.id,
        reason: rejectReason,
      });
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending:
        "bg-amber-100 text-amber-700",
      active:
        "bg-emerald-100 text-emerald-700",
      suspended:
        "bg-red-100 text-red-700",
      rejected:
        "bg-slate-100 text-slate-700",
      trial:
        "bg-blue-100 text-blue-700",
    };

    return (
      map[s] ||
      "bg-slate-100 text-slate-700"
    );
  };

  const items = (registrations?.items ?? []) as Tenant[];

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-indigo-600" />
            {t("title")}
          </h1>

          <p className="text-sm text-slate-500">
            {t("agencyRequests")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">
              {stats?.total ?? 0}
            </p>

            <p className="text-xs">
              {tc("total")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">
              {stats?.pending ?? 0}
            </p>

            <p className="text-xs">
              {t("statusPending")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-emerald-600">
              {stats?.active ?? 0}
            </p>

            <p className="text-xs">
              {t("statusActive")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />

          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("searchPlaceholder")}
            className="pl-10"
          />
        </div>

        <Filter className="h-4 w-4 mt-3" />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <Building2 className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              No requests
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {item.name}
                          </p>

                          <p className="text-xs text-slate-500">
                            {item.ownerName}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-xs flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {item.ownerEmail}
                          </p>

                          <p className="text-xs flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {item.ownerPhone}
                          </p>

                          <p className="text-xs flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {item.city}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge>{item.plan}</Badge>
                      </TableCell>

                      <TableCell>
                        <code>
                          {item.registrationToken}
                        </code>
                      </TableCell>

                      <TableCell>
                        <Badge
                          className={statusBadge(
                            item.status
                          )}
                        >
                          {item.status || "—"}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        {item.status ===
                        "pending" ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              onClick={() =>
                                openDialog(
                                  "approve",
                                  item
                                )
                              }
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>

                            <Button
                              size="sm"
                              onClick={() =>
                                openDialog(
                                  "reject",
                                  item
                                )
                              }
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span>—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogAction === "approve"
                ? t("confirmApprove")
                : t("confirmReject")}
            </DialogTitle>

            <DialogDescription>
              {selectedTenant?.name} —{" "}
              {selectedTenant?.ownerEmail}
            </DialogDescription>
          </DialogHeader>

          {dialogAction === "reject" && (
            <Input
              value={rejectReason}
              onChange={(e) =>
                setRejectReason(
                  e.target.value
                )
              }
            />
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setDialogOpen(false)
              }
            >
              Cancel
            </Button>

            <Button onClick={handleConfirm}>
              {dialogAction ===
              "approve"
                ? "Approve"
                : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}