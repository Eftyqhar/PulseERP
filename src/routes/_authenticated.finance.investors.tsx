import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Users as UsersIcon,
  PiggyBank,
  Percent,
} from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDbList, createItem, updateItem, removeItem, logAudit } from "@/lib/db";
import { auth } from "@/lib/auth-context";
import type { Investor, Investment } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/finance/investors")({
  head: () => ({ meta: [{ title: "Investors — PulseERP" }] }),
  component: InvestorsPage,
});

const schema = z.object({
  name: z.string().min(1, "Required").max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  address: z.string().max(240).optional().or(z.literal("")),
  joinedAt: z.string().min(1),
  notes: z.string().max(500).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function InvestorsPage() {
  const { data: investors, loading } = useDbList<Investor>("investors");
  const { data: investments } = useDbList<Investment>("investments");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Investor | null>(null);
  const [deleting, setDeleting] = useState<Investor | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      joinedAt: new Date().toISOString().slice(0, 10),
      notes: "",
    },
  });

  const totals = useMemo(() => {
    const totalsByInvestor = new Map<string, { amount: number; count: number; last: number }>();
    for (const inv of investments) {
      if (!inv.investorId) continue;
      const t = totalsByInvestor.get(inv.investorId) || { amount: 0, count: 0, last: 0 };
      t.amount += inv.amount || 0;
      t.count += 1;
      t.last = Math.max(t.last, inv.date || 0);
      totalsByInvestor.set(inv.investorId, t);
    }
    const totalPool = investors.reduce((s, i) => s + (totalsByInvestor.get(i.id)?.amount || 0), 0);
    const assignedCount = investors.filter(
      (i) => (totalsByInvestor.get(i.id)?.amount || 0) > 0,
    ).length;
    return { totalsByInvestor, totalPool, assignedCount };
  }, [investors, investments]);

  function openCreate() {
    setEditing(null);
    form.reset({
      name: "",
      email: "",
      phone: "",
      address: "",
      joinedAt: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    setOpen(true);
  }

  function openEdit(inv: Investor) {
    setEditing(inv);
    form.reset({
      name: inv.name,
      email: inv.email || "",
      phone: inv.phone || "",
      address: inv.address || "",
      joinedAt: new Date(inv.joinedAt || Date.now()).toISOString().slice(0, 10),
      notes: inv.notes || "",
    });
    setOpen(true);
  }

  const onSubmit = form.handleSubmit(async (vals) => {
    setSaving(true);
    try {
      const payload = {
        name: vals.name,
        email: vals.email || "",
        phone: vals.phone || "",
        address: vals.address || "",
        joinedAt: new Date(vals.joinedAt).getTime(),
        notes: vals.notes || "",
      };
      if (editing) {
        await updateItem(`investors/${editing.id}`, payload);
        await logAudit({
          action: "investor.update",
          entity: "investor",
          entityId: editing.id,
          oldValue: editing,
          newValue: payload,
        });
        toast.success("Investor updated");
      } else {
        const id = await createItem("investors", {
          ...payload,
          createdBy: auth.currentUser?.uid || "",
        });
        await logAudit({
          action: "investor.create",
          entity: "investor",
          entityId: id,
          newValue: payload,
        });
        toast.success("Investor added");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  });

  const handleDelete = async () => {
    if (!deleting) return;
    await removeItem(`investors/${deleting.id}`);
    await logAudit({
      action: "investor.delete",
      entity: "investor",
      entityId: deleting.id,
      oldValue: deleting,
    });
    toast.success("Investor removed");
    setDeleting(null);
  };

  const columns: ColumnDef<Investor>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          {row.original.email && (
            <span className="text-xs text-muted-foreground">{row.original.email}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.phone || "—"}</span>
      ),
    },
    {
      id: "invested",
      header: "Total invested",
      cell: ({ row }) => {
        const t = totals.totalsByInvestor.get(row.original.id);
        return <span className="font-medium">{currency(t?.amount || 0)}</span>;
      },
    },
    {
      id: "entries",
      header: "Entries",
      cell: ({ row }) => totals.totalsByInvestor.get(row.original.id)?.count || 0,
    },
    {
      id: "share",
      header: "Share",
      cell: ({ row }) => {
        const amt = totals.totalsByInvestor.get(row.original.id)?.amount || 0;
        const pct = totals.totalPool > 0 ? (amt / totals.totalPool) * 100 : 0;
        return (
          <Badge variant="secondary" className="font-normal">
            {pct.toFixed(2)}%
          </Badge>
        );
      },
    },
    {
      accessorKey: "joinedAt",
      header: "Joined",
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.joinedAt ? dateShort(row.original.joinedAt) : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive"
            onClick={() => setDeleting(row.original)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investors"
        description="Manage investor profiles, equity share and capital contributed."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New investor
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Investors"
          value={investors.length}
          icon={<UsersIcon className="size-4" />}
        />
        <StatCard
          label="Capital pool"
          value={currency(totals.totalPool)}
          icon={<PiggyBank className="size-4" />}
        />
        <StatCard
          label="With contributions"
          value={`${totals.assignedCount} / ${investors.length}`}
          icon={<Percent className="size-4" />}
        />
      </div>

      {!loading && investors.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-5" />}
          title="No investors yet"
          description="Add investor profiles to track capital contributions and ownership share."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" /> New investor
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={[...investors].sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))}
          loading={loading}
          searchPlaceholder="Search investors…"
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit investor" : "New investor"}</DialogTitle>
            <DialogDescription>
              Investor profile and ownership share. Link investment entries to this investor from
              the Investment page.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Name</Label>
                <Input {...form.register("name")} placeholder="Full name" />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" {...form.register("email")} placeholder="name@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input {...form.register("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Joined</Label>
                <Input type="date" {...form.register("joinedAt")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Address</Label>
                <Input {...form.register("address")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Notes</Label>
                <Textarea rows={3} {...form.register("notes")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save changes" : "Add investor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Remove investor?"
        description={`This removes ${deleting?.name ?? "the investor"}'s profile. Linked investment entries are kept.`}
        confirmLabel="Remove"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
