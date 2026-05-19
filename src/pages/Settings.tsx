import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Shield, Bell, Users, Activity, CheckCircle,
  AlertTriangle, Info, Server, UserCircle, Monitor,
  Plus, Pencil, Trash2, AlertCircle, Lock, Mail,
  Phone, Building2, UserPlus,
} from "lucide-react";

const STAFF_ROLES = [
  { value: "manager", label: "Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "agent", label: "Agent" },
  { value: "viewer", label: "Viewer" },
] as const;

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800",
  admin: "bg-indigo-100 text-indigo-800",
  manager: "bg-blue-100 text-blue-800",
  accountant: "bg-emerald-100 text-emerald-800",
  agent: "bg-amber-100 text-amber-800",
  viewer: "bg-slate-100 text-slate-800",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-slate-100 text-slate-800",
  suspended: "bg-red-100 text-red-800",
};

export default function SettingsPage() {
  const [tab, setTab] = useState("notifications");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const { data: notifications, refetch: refetchNotif } = trpc.notification.list.useQuery({ status: "all", limit: 50 });
  const { data: auditLogs } = trpc.audit.logs.useQuery({});
  const { data: auditUsers } = trpc.audit.users.useQuery();
  const { data: roles } = trpc.audit.roles.useQuery();
  const { data: auditStats } = trpc.audit.stats.useQuery();
  const { data: sessions } = trpc.auth.sessions.useQuery();
  const { data: usersList, refetch: refetchUsers } = trpc.users.list.useQuery(undefined, { enabled: isAdmin });
  const { data: planUsage, refetch: refetchPlanUsage } = trpc.users.planUsage.useQuery(undefined, { enabled: isAdmin });

  const utils = trpc.useUtils();

  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: async () => {
      await utils.notification.list.invalidate();
      await utils.notification.unread.invalidate();
      refetchNotif();
    },
    onError: (err) => alert(err.message),
  });

  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: async () => {
      await utils.notification.list.invalidate();
      await utils.notification.unread.invalidate();
      refetchNotif();
    },
  });

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      alert("Profile updated successfully");
      utils.auth.me.invalidate();
    },
    onError: (err) => alert(err.message),
  });

  // User management mutations
  const createUser = trpc.users.create.useMutation({
    onSuccess: async () => {
      setUserDialogOpen(false);
      resetUserForm();
      await refetchUsers();
      await refetchPlanUsage();
    },
    onError: (err) => alert(err.message),
  });

  const updateUser = trpc.users.update.useMutation({
    onSuccess: async () => {
      setUserDialogOpen(false);
      setEditingUser(null);
      resetUserForm();
      await refetchUsers();
    },
    onError: (err) => alert(err.message),
  });

  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: async () => {
      await refetchUsers();
      await refetchPlanUsage();
    },
    onError: (err) => alert(err.message),
  });

  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    department: user?.department || "",
  });

  // User dialog state
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "agent" as typeof STAFF_ROLES[number]["value"],
    department: "",
    phone: "",
    status: "active" as "active" | "inactive" | "suspended",
  });

  const resetUserForm = () => {
    setUserForm({ name: "", email: "", password: "", role: "agent", department: "", phone: "", status: "active" });
  };

  const openCreateUser = () => {
    setEditingUser(null);
    resetUserForm();
    setUserDialogOpen(true);
  };

  const openEditUser = (u: any) => {
    setEditingUser(u);
    setUserForm({
      name: u.name || "",
      email: u.email || "",
      password: "",
      role: u.role || "agent",
      department: u.department || "",
      phone: u.phone || "",
      status: u.status || "active",
    });
    setUserDialogOpen(true);
  };

  const handleSaveUser = () => {
    if (editingUser) {
      const update: any = { id: editingUser.id };
      if (userForm.name) update.name = userForm.name;
      if (userForm.email) update.email = userForm.email;
      if (userForm.role) update.role = userForm.role;
      if (userForm.department !== undefined) update.department = userForm.department;
      if (userForm.phone !== undefined) update.phone = userForm.phone;
      if (userForm.status) update.status = userForm.status;
      updateUser.mutate(update);
    } else {
      createUser.mutate({
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        role: userForm.role,
        department: userForm.department || undefined,
        phone: userForm.phone || undefined,
      });
    }
  };

  const notifIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    success: CheckCircle,
    warning: AlertTriangle,
    info: Info,
    error: AlertTriangle,
    system: Server,
  };
  const notifColors: Record<string, string> = {
    success: "text-emerald-600 bg-emerald-100",
    warning: "text-amber-600 bg-amber-100",
    info: "text-blue-600 bg-blue-100",
    error: "text-red-600 bg-red-100",
    system: "text-slate-600 bg-slate-100",
  };

  const displayUsers = isAdmin ? (usersList?.items ?? []) : (auditUsers ?? []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Settings & Security</h1>
        <p className="text-slate-500 mt-1 text-sm">Manage profile, notifications, audit logs, users, and roles</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* FIXED: scrollable tabs on mobile */}
        <TabsList className="bg-white border w-full sm:w-auto overflow-x-auto flex-nowrap">
          <TabsTrigger value="profile" className="text-xs sm:text-sm"><UserCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Profile</TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs sm:text-sm"><Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Sessions</TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs sm:text-sm"><Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Notifications</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs sm:text-sm"><Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Audit Logs</TabsTrigger>
          <TabsTrigger value="users" className="text-xs sm:text-sm"><Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Users</TabsTrigger>
          <TabsTrigger value="roles" className="text-xs sm:text-sm"><Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card className="border-0 shadow-sm max-w-lg">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Update Profile</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-slate-500">Name</Label>
                <Input value={profileForm.name} onChange={e => setProfileForm(s => ({ ...s, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Email</Label>
                <Input type="email" value={profileForm.email} onChange={e => setProfileForm(s => ({ ...s, email: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Phone</Label>
                <Input value={profileForm.phone} onChange={e => setProfileForm(s => ({ ...s, phone: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Department</Label>
                <Input value={profileForm.department} onChange={e => setProfileForm(s => ({ ...s, department: e.target.value }))} />
              </div>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={updateProfile.isPending}
                onClick={() => updateProfile.mutate(profileForm)}
              >
                {updateProfile.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Active Sessions</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b"><tr>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">IP Address</th>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">User Agent</th>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Created</th>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Expires</th>
                  </tr></thead>
                  <tbody>
                    {(sessions || []).map(s => (
                      <tr key={s.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="p-2 sm:p-3 font-mono text-xs">{s.ipAddress || "-"}</td>
                        <td className="p-2 sm:p-3 text-xs max-w-[200px] truncate">{s.userAgent || "-"}</td>
                        <td className="p-2 sm:p-3 text-xs text-slate-500">{new Date(s.createdAt).toLocaleString()}</td>
                        <td className="p-2 sm:p-3 text-xs text-slate-500">{new Date(s.expiresAt).toLocaleString()}</td>
                      </tr>
                    ))}
                    {(!sessions || sessions.length === 0) && (
                      <tr><td colSpan={4} className="p-4 text-center text-sm text-slate-400">No active sessions found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Notifications</CardTitle>
              {(notifications?.items || []).some(n => !n.isRead) && (
                <Button size="sm" variant="outline" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
                  Mark All Read
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {(notifications?.items || []).map(notif => {
                  const Icon = notifIcons[notif.type] || Info;
                  return (
                    <div key={notif.id} className={`flex items-start gap-2 sm:gap-3 p-3 sm:p-4 ${notif.isRead ? "opacity-60" : "bg-indigo-50/30"}`}>
                      <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center flex-shrink-0 ${notifColors[notif.type] || ""}`}>
                        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{notif.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{notif.message}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{notif.category}</Badge>
                          <span className="text-[10px] text-slate-400">{notif.createdAt ? new Date(notif.createdAt).toLocaleString() : ""}</span>
                        </div>
                      </div>
                      {!notif.isRead && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs flex-shrink-0" onClick={() => markRead.mutate({ id: notif.id })} disabled={markRead.isPending}>
                          Mark Read
                        </Button>
                      )}
                    </div>
                  );
                })}
                {(!notifications?.items || notifications.items.length === 0) && (
                  <p className="text-center text-sm text-slate-400 py-8">No notifications</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4 space-y-4">
          {/* Audit Stats */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <Card className="border-0 shadow-sm"><CardContent className="p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-slate-500">Total Logs</p>
              <p className="text-lg sm:text-2xl font-bold">{auditLogs?.total ?? 0}</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-slate-500">Action Types</p>
              <p className="text-lg sm:text-2xl font-bold">{auditStats?.actionCounts?.length ?? 0}</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-slate-500">Entity Types</p>
              <p className="text-lg sm:text-2xl font-bold">{auditStats?.entityCounts?.length ?? 0}</p>
            </CardContent></Card>
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Recent Audit Logs</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b"><tr>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Action</th>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Entity</th>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">User</th>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">IP</th>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Time</th>
                  </tr></thead>
                  <tbody>
                    {(auditLogs?.items || []).map(log => (
                      <tr key={log.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="p-2 sm:p-3"><Badge variant="outline" className="text-[10px] capitalize">{log.action}</Badge></td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm">{log.entityType} {log.entityId && `#${log.entityId}`}</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm">{log.user?.name || "System"}</td>
                        <td className="p-2 sm:p-3 font-mono text-[10px] sm:text-xs">{log.ipAddress}</td>
                        <td className="p-2 sm:p-3 text-[10px] sm:text-xs text-slate-500">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-4">
          {/* Plan usage indicator (admin only) */}
          {isAdmin && planUsage && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Plan Usage</p>
                      <p className="text-xs text-slate-500 capitalize">{planUsage.plan} Plan — {planUsage.used} of {planUsage.limit} users</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{planUsage.remaining}</p>
                    <p className="text-[10px] text-slate-500">remaining</p>
                  </div>
                </div>
                <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${planUsage.canAdd ? "bg-indigo-600" : "bg-red-500"}`}
                    style={{ width: `${Math.min(100, (planUsage.used / planUsage.limit) * 100)}%` }}
                  />
                </div>
                {planUsage.canAdd ? (
                  <Button size="sm" className="mt-3 bg-indigo-600 hover:bg-indigo-700" onClick={openCreateUser}>
                    <Plus className="h-4 w-4 mr-1.5" /> Add User
                  </Button>
                ) : (
                  <div className="mt-3 flex items-center gap-2 text-amber-600 text-xs">
                    <AlertCircle className="h-4 w-4" />
                    <span>User limit reached. Upgrade your plan to add more users.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 flex items-center justify-between">
              <CardTitle className="text-sm font-medium">System Users</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b"><tr>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">User</th>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Role</th>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Dept</th>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Status</th>
                    <th className="text-left p-2 sm:p-3 font-medium text-slate-500 text-xs">Last Sign In</th>
                    {isAdmin && <th className="text-right p-2 sm:p-3 font-medium text-slate-500 text-xs">Actions</th>}
                  </tr></thead>
                  <tbody>
                    {(displayUsers || []).map(u => (
                      <tr key={u.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="p-2 sm:p-3">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                              {u.name?.charAt(0) || "U"}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-xs sm:text-sm">{u.name}</p>
                              <p className="text-[10px] text-slate-500">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-2 sm:p-3">
                          <Badge variant="outline" className={`text-[10px] capitalize ${ROLE_COLORS[u.role] || ""}`}>
                            {u.role}
                          </Badge>
                        </td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm">{u.department || "—"}</td>
                        <td className="p-2 sm:p-3">
                          <Badge className={`text-[10px] ${STATUS_COLORS[u.status] || ""}`}>{u.status}</Badge>
                        </td>
                        <td className="p-2 sm:p-3 text-xs text-slate-500">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"}</td>
                        {isAdmin && (
                          <td className="p-2 sm:p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm" variant="ghost" className="h-7 w-7 p-0"
                                onClick={() => openEditUser(u)}
                                disabled={u.role === "admin" || u.role === "super_admin"}
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5 text-slate-500" />
                              </Button>
                              <Button
                                size="sm" variant="ghost" className="h-7 w-7 p-0"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete ${u.name}?`)) {
                                    deleteUser.mutate({ id: u.id });
                                  }
                                }}
                                disabled={u.id === user?.id || u.role === "admin" || u.role === "super_admin" || deleteUser.isPending}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {(!displayUsers || displayUsers.length === 0) && (
                      <tr><td colSpan={isAdmin ? 6 : 5} className="p-4 text-center text-sm text-slate-400">No users found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {(roles || []).map(role => {
              let perms: string[] = [];
              if (role.permissions) {
                if (typeof role.permissions === "string") {
                  try { perms = JSON.parse(role.permissions); } catch { perms = []; }
                } else if (Array.isArray(role.permissions)) {
                  perms = role.permissions as string[];
                }
              }
              return (
                <Card key={role.id} className="border-0 shadow-sm">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                          <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm sm:text-base">{role.name}</h3>
                          <p className="text-[10px] sm:text-xs text-slate-500">{role.slug}</p>
                        </div>
                      </div>
                      {role.isSystem && <Badge variant="secondary" className="text-[10px]">System</Badge>}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 mt-2">{role.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {perms.map((perm: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{perm}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* User Create/Edit Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-indigo-600" />
              {editingUser ? "Edit User" : "Add New User"}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Update user details and permissions."
                : planUsage
                ? `You have ${planUsage.remaining} of ${planUsage.limit} users remaining on your ${planUsage.plan} plan.`
                : "Create a new staff user for your agency."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Full Name</Label>
              <Input
                placeholder="e.g. Ahmad Khan"
                value={userForm.name}
                onChange={e => setUserForm(s => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="email"
                  placeholder="user@agency.com"
                  value={userForm.email}
                  onChange={e => setUserForm(s => ({ ...s, email: e.target.value }))}
                  className="pl-10"
                />
              </div>
            </div>
            {!editingUser && (
              <div className="space-y-1">
                <Label className="text-xs">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="password"
                    placeholder="Min 8 characters"
                    value={userForm.password}
                    onChange={e => setUserForm(s => ({ ...s, password: e.target.value }))}
                    className="pl-10"
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <select
                  value={userForm.role}
                  onChange={e => setUserForm(s => ({ ...s, role: e.target.value as any }))}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                >
                  {STAFF_ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <select
                  value={userForm.status}
                  onChange={e => setUserForm(s => ({ ...s, status: e.target.value as any }))}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Department</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="e.g. Sales"
                  value={userForm.department}
                  onChange={e => setUserForm(s => ({ ...s, department: e.target.value }))}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Phone number"
                  value={userForm.phone}
                  onChange={e => setUserForm(s => ({ ...s, phone: e.target.value }))}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={handleSaveUser}
              disabled={createUser.isPending || updateUser.isPending}
            >
              {editingUser
                ? (updateUser.isPending ? "Saving..." : "Save Changes")
                : (createUser.isPending ? "Creating..." : "Create User")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
