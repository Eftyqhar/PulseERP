import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2, Plus, ShieldCheck, ShieldOff, UserCog } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatCard } from "@/components/admin/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth, createAdminAccount } from "@/lib/auth-context";
import { useDbList, updateItem, logAudit } from "@/lib/db";
import type { AdminUser, Role } from "@/lib/types";
import { dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admins")({
  head: () => ({ meta: [{ title: "Admins — PulseERP" }] }),
  component: AdminsPage,
});

function AdminsPage() {
  const { profile, isSuperAdmin } = useAuth();
  const { data, loading } = useDbList<AdminUser>("users");

  const stats = useMemo(
    () => ({
      total: data.length,
      superAdmins: data.filter((u) => u.role === "super_admin").length,
      moderators: data.filter((u) => u.role === "moderator").length,
      disabled: data.filter((u) => u.disabled).length,
    }),
    [data],
  );

  const setRole = async (u: AdminUser, role: Role) => {
    if (!isSuperAdmin) return toast.error("Only super admins can change roles");
    await updateItem(`users/${u.uid}`, { role });
    await logAudit({
      action: "user.role_change",
      entity: "user",
      entityId: u.uid,
      oldValue: { role: u.role },
      newValue: { role },
    });
    toast.success(`Role updated to ${role}`);
  };

  const toggleDisabled = async (u: AdminUser) => {
    if (!isSuperAdmin) return toast.error("Only super admins can disable users");
    if (u.uid === profile?.uid) return toast.error("You can't disable yourself");
    const next = !u.disabled;
    await updateItem(`users/${u.uid}`, { disabled: next });
    await logAudit({
      action: next ? "user.disable" : "user.enable",
      entity: "user",
      entityId: u.uid,
    });
    toast.success(next ? "User disabled" : "User enabled");
  };

  const columns: ColumnDef<AdminUser>[] = [
    {
      accessorKey: "displayName",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.displayName || "—"}</span>
          <span className="text-xs text-muted-foreground">{row.original.email}</span>
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <Badge
          variant={row.original.role === "super_admin" ? "default" : "secondary"}
          className="text-[10px]"
        >
          {row.original.role === "super_admin" ? "Super Admin" : "Moderator"}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Joined",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.createdAt)}</span>,
    },
    {
      accessorKey: "disabled",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.disabled ? "destructive" : "outline"} className="text-[10px]">
          {row.original.disabled ? "Disabled" : "Active"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const u = row.original;
        const isSelf = u.uid === profile?.uid;
        return (
          <div className="flex justify-end gap-1">
            {u.role === "moderator" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRole(u, "super_admin")}
                disabled={!isSuperAdmin}
              >
                <ShieldCheck className="size-3.5" /> Promote
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRole(u, "moderator")}
                disabled={!isSuperAdmin || isSelf}
              >
                <UserCog className="size-3.5" /> Demote
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleDisabled(u)}
              disabled={!isSuperAdmin || isSelf}
              className={u.disabled ? "text-[color:var(--success)]" : "text-destructive"}
            >
              <ShieldOff className="size-3.5" /> {u.disabled ? "Enable" : "Disable"}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admins"
        description="Manage internal team access and roles."
        actions={isSuperAdmin ? <CreateAdminDialog /> : null}
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={stats.total} />
        <StatCard label="Super admins" value={stats.superAdmins} tone="success" />
        <StatCard label="Moderators" value={stats.moderators} />
        <StatCard label="Disabled" value={stats.disabled} tone="destructive" />
      </div>

      {!isSuperAdmin && (
        <div className="rounded-md border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/5 p-3 text-xs text-[color:var(--warning)]">
          Read-only — only super admins can modify users.
        </div>
      )}

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchPlaceholder="Search admins…"
      />
    </div>
  );
}

function CreateAdminDialog() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("moderator");

  const reset = () => {
    setDisplayName("");
    setEmail("");
    setPassword("");
    setRole("moderator");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !email.trim() || password.length < 6) {
      toast.error("Name, email, and a 6+ character password are required");
      return;
    }
    setSubmitting(true);
    try {
      const uid = await createAdminAccount({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        role,
      });
      await logAudit({
        action: "user.create",
        entity: "user",
        entityId: uid,
        newValue: { email: email.trim(), role },
      });
      toast.success("Admin account created");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create admin");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New admin
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create admin account</DialogTitle>
          <DialogDescription>
            The new user can sign in immediately with the password you set.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ca-name">Full name</Label>
            <Input
              id="ca-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca-email">Email</Label>
            <Input
              id="ca-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca-password">Temporary password</Label>
            <Input
              id="ca-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="moderator">Moderator</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />} Create admin
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
