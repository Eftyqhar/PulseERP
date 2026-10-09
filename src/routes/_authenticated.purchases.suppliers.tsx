import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Truck } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDbList, createItem, updateItem, removeItem, logAudit } from "@/lib/db";
import type { Supplier, Purchase } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchases/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — PulseERP" }] }),
  component: SuppliersPage,
});

const schema = z.object({
  company: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  phone: z.string().max(40).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function SuppliersPage() {
  const { data, loading } = useDbList<Supplier>("suppliers");
  const { data: purchases } = useDbList<Purchase>("purchases");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [confirm, setConfirm] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);

  const purchaseStats = useMemo(() => {
    const map = new Map<string, { total: number; last: number }>();
    purchases.forEach((p) => {
      const cur = map.get(p.supplierId) || { total: 0, last: 0 };
      cur.total += p.totalCost || 0;
      if (p.purchaseDate > cur.last) cur.last = p.purchaseDate;
      map.set(p.supplierId, cur);
    });
    return map;
  }, [purchases]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { company: "", name: "", phone: "", email: "", address: "", notes: "" },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ company: "", name: "", phone: "", email: "", address: "", notes: "" });
    setOpen(true);
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    form.reset({
      company: s.company,
      name: s.name,
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      notes: s.notes || "",
    });
    setOpen(true);
  };

  const onSubmit = form.handleSubmit(async (vals) => {
    setSaving(true);
    try {
      if (editing) {
        await updateItem(`suppliers/${editing.id}`, vals);
        await logAudit({
          action: "supplier.update",
          entity: "supplier",
          entityId: editing.id,
          newValue: vals,
        });
        toast.success("Supplier updated");
      } else {
        const id = await createItem("suppliers", vals);
        await logAudit({
          action: "supplier.create",
          entity: "supplier",
          entityId: id,
          newValue: vals,
        });
        toast.success("Supplier added");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  });

  const handleDelete = async () => {
    if (!confirm) return;
    try {
      await removeItem(`suppliers/${confirm.id}`);
      await logAudit({
        action: "supplier.delete",
        entity: "supplier",
        entityId: confirm.id,
        oldValue: { company: confirm.company },
      });
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setConfirm(null);
    }
  };

  const columns: ColumnDef<Supplier>[] = [
    {
      accessorKey: "company",
      header: "Company",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.company}</div>
          <div className="text-xs text-muted-foreground">{row.original.name}</div>
        </div>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => <span className="text-xs">{row.original.phone || "—"}</span>,
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => <span className="text-xs">{row.original.email || "—"}</span>,
    },
    {
      id: "totalPurchases",
      header: "Total purchased",
      cell: ({ row }) => (
        <span className="font-medium">
          {currency(purchaseStats.get(row.original.id)?.total || 0)}
        </span>
      ),
    },
    {
      id: "lastPurchase",
      header: "Last purchase",
      cell: ({ row }) => (
        <span className="text-xs">{dateShort(purchaseStats.get(row.original.id)?.last || 0)}</span>
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
            onClick={() => setConfirm(row.original)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description={`${data.length} suppliers`}
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Add supplier
          </Button>
        }
      />

      {!loading && data.length === 0 ? (
        <EmptyState
          icon={<Truck className="size-5" />}
          title="No suppliers yet"
          description="Track who you buy from and what you owe."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" /> Add supplier
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          searchPlaceholder="Search suppliers…"
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit supplier" : "New supplier"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Company</Label>
                <Input {...form.register("company")} />
                {form.formState.errors.company && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.company.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Contact name</Label>
                <Input {...form.register("name")} />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input {...form.register("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" {...form.register("email")} />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Input {...form.register("address")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={3} {...form.register("notes")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete supplier?"
        description={confirm ? `${confirm.company} will be removed.` : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
