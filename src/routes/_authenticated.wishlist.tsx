import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Lightbulb } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useDbList, createItem, updateItem, removeItem, logAudit } from "@/lib/db";
import { dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/wishlist")({
  head: () => ({
    meta: [
      { title: "Product Wishlist — PulseERP" },
      {
        name: "description",
        content: "Ideas and notes for upcoming products to source in the future.",
      },
    ],
  }),
  component: WishlistPage,
});

type Priority = "low" | "medium" | "high";
type Status = "idea" | "researching" | "sourcing" | "ordered" | "dropped";

interface WishlistItem {
  id: string;
  name: string;
  note?: string;
  supplier?: string;
  sourceUrl?: string;
  estimatedCost?: number;
  estimatedPrice?: number;
  priority: Priority;
  status: Status;
  createdAt: number;
}

const schema = z.object({
  name: z.string().min(1, "Required").max(120),
  note: z.string().max(1000).optional().or(z.literal("")),
  supplier: z.string().max(120).optional().or(z.literal("")),
  sourceUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  estimatedCost: z.coerce.number().min(0).optional(),
  estimatedPrice: z.coerce.number().min(0).optional(),
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["idea", "researching", "sourcing", "ordered", "dropped"]),
});
type FormValues = z.infer<typeof schema>;

const PRIORITY_STYLE: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

const STATUS_STYLE: Record<Status, string> = {
  idea: "bg-muted text-muted-foreground",
  researching: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  sourcing: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
  ordered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  dropped: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

function WishlistPage() {
  const { data, loading } = useDbList<WishlistItem>("wishlist");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [confirm, setConfirm] = useState<WishlistItem | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      note: "",
      supplier: "",
      sourceUrl: "",
      estimatedCost: undefined,
      estimatedPrice: undefined,
      priority: "medium",
      status: "idea",
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({
      name: "",
      note: "",
      supplier: "",
      sourceUrl: "",
      estimatedCost: undefined,
      estimatedPrice: undefined,
      priority: "medium",
      status: "idea",
    });
    setOpen(true);
  };

  const openEdit = (item: WishlistItem) => {
    setEditing(item);
    form.reset({
      name: item.name,
      note: item.note || "",
      supplier: item.supplier || "",
      sourceUrl: item.sourceUrl || "",
      estimatedCost: item.estimatedCost,
      estimatedPrice: item.estimatedPrice,
      priority: item.priority || "medium",
      status: item.status || "idea",
    });
    setOpen(true);
  };

  const onSubmit = form.handleSubmit(async (vals) => {
    setSaving(true);
    try {
      const payload = {
        name: vals.name,
        note: vals.note || "",
        supplier: vals.supplier || "",
        sourceUrl: vals.sourceUrl || "",
        estimatedCost: vals.estimatedCost ?? 0,
        estimatedPrice: vals.estimatedPrice ?? 0,
        priority: vals.priority,
        status: vals.status,
      };
      if (editing) {
        await updateItem(`wishlist/${editing.id}`, payload);
        await logAudit({
          action: "wishlist.update",
          entity: "wishlist",
          entityId: editing.id,
          oldValue: { name: editing.name },
          newValue: payload,
        });
        toast.success("Wishlist item updated");
      } else {
        const id = await createItem("wishlist", payload);
        await logAudit({
          action: "wishlist.create",
          entity: "wishlist",
          entityId: id,
          newValue: payload,
        });
        toast.success("Added to wishlist");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  });

  const handleDelete = async () => {
    if (!confirm) return;
    try {
      await removeItem(`wishlist/${confirm.id}`);
      await logAudit({
        action: "wishlist.delete",
        entity: "wishlist",
        entityId: confirm.id,
        oldValue: { name: confirm.name },
      });
      toast.success("Removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setConfirm(null);
    }
  };

  const columns: ColumnDef<WishlistItem>[] = [
    {
      accessorKey: "name",
      header: "Product",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          {row.original.note && (
            <div className="text-xs text-muted-foreground line-clamp-2 max-w-md mt-0.5">
              {row.original.note}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => (
        <Badge variant="secondary" className={PRIORITY_STYLE[row.original.priority || "medium"]}>
          {row.original.priority || "medium"}
        </Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant="secondary" className={STATUS_STYLE[row.original.status || "idea"]}>
          {row.original.status || "idea"}
        </Badge>
      ),
    },
    {
      accessorKey: "supplier",
      header: "Supplier",
      cell: ({ row }) => <span className="text-xs">{row.original.supplier || "—"}</span>,
    },
    {
      accessorKey: "estimatedCost",
      header: "Est. cost",
      cell: ({ row }) =>
        row.original.estimatedCost ? (
          <span className="text-xs tabular-nums">
            BDT {row.original.estimatedCost.toLocaleString()}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "estimatedPrice",
      header: "Est. price",
      cell: ({ row }) =>
        row.original.estimatedPrice ? (
          <span className="text-xs tabular-nums">
            BDT {row.original.estimatedPrice.toLocaleString()}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "createdAt",
      header: "Added",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          {row.original.sourceUrl && (
            <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
              <a href={row.original.sourceUrl} target="_blank" rel="noreferrer noopener">
                Link
              </a>
            </Button>
          )}
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
        title="Product Wishlist"
        description="Notes and ideas for upcoming products to bring in the future."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Add idea
          </Button>
        }
      />

      {!loading && data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Lightbulb className="size-8 text-muted-foreground mx-auto mb-3" />
          <div className="font-medium">No wishlist items yet</div>
          <p className="text-sm text-muted-foreground mt-1">
            Save product ideas here so you don't lose track of what to source next.
          </p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="size-4" /> Add your first idea
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          searchPlaceholder="Search wishlist…"
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit wishlist item" : "New wishlist item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Product name</Label>
              <Input {...form.register("name")} autoFocus placeholder="e.g. Wireless earbuds pro" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Priority</Label>
                <Select
                  value={form.watch("priority")}
                  onValueChange={(v) => form.setValue("priority", v as Priority)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={form.watch("status")}
                  onValueChange={(v) => form.setValue("status", v as Status)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="idea">Idea</SelectItem>
                    <SelectItem value="researching">Researching</SelectItem>
                    <SelectItem value="sourcing">Sourcing</SelectItem>
                    <SelectItem value="ordered">Ordered</SelectItem>
                    <SelectItem value="dropped">Dropped</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Est. cost (BDT)</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("estimatedCost", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Est. selling price (BDT)</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("estimatedPrice", { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Supplier / source</Label>
              <Input {...form.register("supplier")} placeholder="Alibaba, local wholesaler, etc." />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Source link</Label>
              <Input {...form.register("sourceUrl")} placeholder="https://…" />
              {form.formState.errors.sourceUrl && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.sourceUrl.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={4}
                {...form.register("note")}
                placeholder="Why this product, target market, timing…"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Remove from wishlist?"
        description={confirm ? `"${confirm.name}" will be removed.` : ""}
        confirmLabel="Remove"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
