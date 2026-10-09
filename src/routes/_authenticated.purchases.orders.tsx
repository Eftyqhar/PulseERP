import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, ClipboardList, Check, X, FileText } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDbList, createItem, updateItem, removeItem, logAudit, ref, update } from "@/lib/db";
import { auth } from "@/lib/auth-context";
import type { Product, Supplier, Purchase } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchases/orders")({
  head: () => ({ meta: [{ title: "Purchase Orders — PulseERP" }] }),
  component: PurchaseOrdersPage,
});

const schema = z.object({
  supplierId: z.string().min(1, "Select a supplier"),
  invoiceNumber: z.string().min(1).max(60),
  purchaseDate: z.string().min(1),
  shippingCost: z.coerce.number().min(0),
  otherCost: z.coerce.number().min(0),
  notes: z.string().max(400).optional().or(z.literal("")),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().min(1),
        buyingPrice: z.coerce.number().min(0),
      }),
    )
    .min(1, "Add at least one item"),
});
type FormValues = z.infer<typeof schema>;

function PurchaseOrdersPage() {
  const { data: purchases, loading } = useDbList<Purchase>("purchases");
  const { data: suppliers } = useDbList<Supplier>("suppliers");
  const { data: products } = useDbList<Product>("products");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s.company])), [suppliers]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplierId: "",
      invoiceNumber: "",
      purchaseDate: new Date().toISOString().slice(0, 10),
      shippingCost: 0,
      otherCost: 0,
      notes: "",
      items: [{ productId: "", quantity: 1, buyingPrice: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items = form.watch("items");
  const shipping = Number(form.watch("shippingCost") || 0);
  const other = Number(form.watch("otherCost") || 0);
  const total =
    items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.buyingPrice || 0), 0) +
    shipping +
    other;

  const openCreate = () => {
    form.reset({
      supplierId: "",
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      purchaseDate: new Date().toISOString().slice(0, 10),
      shippingCost: 0,
      otherCost: 0,
      notes: "",
      items: [{ productId: "", quantity: 1, buyingPrice: 0 }],
    });
    setOpen(true);
  };

  const onSubmit = form.handleSubmit(async (vals) => {
    setSaving(true);
    try {
      const payload: Omit<Purchase, "id"> = {
        supplierId: vals.supplierId,
        invoiceNumber: vals.invoiceNumber,
        purchaseDate: new Date(vals.purchaseDate).getTime(),
        items: vals.items,
        shippingCost: vals.shippingCost,
        otherCost: vals.otherCost,
        totalCost: total,
        status: "pending",
        notes: vals.notes || "",
        createdAt: Date.now(),
        createdBy: auth.currentUser?.uid || "",
      };
      const id = await createItem("purchases", payload);
      await logAudit({
        action: "purchase.create",
        entity: "purchase",
        entityId: id,
        newValue: { invoice: vals.invoiceNumber, total },
      });
      toast.success("Purchase order created");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  });

  const markReceived = async (p: Purchase) => {
    try {
      // Update each product's stock
      const updates: Record<string, unknown> = {};
      p.items.forEach((it) => {
        const prod = productMap.get(it.productId);
        if (prod) {
          updates[`products/${it.productId}/currentStock`] = (prod.currentStock || 0) + it.quantity;
          updates[`products/${it.productId}/updatedAt`] = Date.now();
        }
      });
      updates[`purchases/${p.id}/status`] = "received";
      await update(ref(null, "/"), updates);
      await logAudit({
        action: "purchase.receive",
        entity: "purchase",
        entityId: p.id,
        newValue: { invoice: p.invoiceNumber },
      });
      toast.success("Purchase received — stock updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const cancel = async (p: Purchase) => {
    try {
      await updateItem(`purchases/${p.id}`, { status: "cancelled" });
      await logAudit({ action: "purchase.cancel", entity: "purchase", entityId: p.id });
      toast.success("Cancelled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleDelete = async (p: Purchase) => {
    await removeItem(`purchases/${p.id}`);
    await logAudit({ action: "purchase.delete", entity: "purchase", entityId: p.id });
    toast.success("Deleted");
  };

  const columns: ColumnDef<Purchase>[] = [
    {
      accessorKey: "invoiceNumber",
      header: "Invoice",
      cell: ({ row }) => <span className="font-medium">{row.original.invoiceNumber}</span>,
    },
    {
      accessorKey: "supplierId",
      header: "Supplier",
      cell: ({ row }) => (
        <span className="text-sm">{supplierMap.get(row.original.supplierId) || "—"}</span>
      ),
    },
    {
      accessorKey: "purchaseDate",
      header: "Date",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.purchaseDate)}</span>,
    },
    {
      id: "qty",
      header: "Items",
      cell: ({ row }) => <span>{row.original.items?.length || 0}</span>,
    },
    {
      accessorKey: "totalCost",
      header: "Total",
      cell: ({ row }) => <span className="font-medium">{currency(row.original.totalCost)}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        const v = s === "received" ? "default" : s === "cancelled" ? "destructive" : "secondary";
        return (
          <Badge variant={v} className="text-[10px] capitalize">
            {s}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          {row.original.status === "pending" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[color:var(--success)]"
                onClick={() => markReceived(row.original)}
              >
                <Check className="size-3.5" /> Receive
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => cancel(row.original)}
              >
                <X className="size-3.5" />
              </Button>
            </>
          )}
          <Button asChild variant="ghost" size="icon" className="size-8" title="Invoice">
            <Link to="/invoice/$type/$id" params={{ type: "purchase", id: row.original.id }}>
              <FileText className="size-3.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive"
            onClick={() => handleDelete(row.original)}
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
        title="Purchase orders"
        description="Create purchase orders. Mark as received to add stock."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New PO
          </Button>
        }
      />

      {!loading && purchases.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title="No purchase orders"
          description="Create a purchase to record what you bought and from whom."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" /> New PO
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={purchases}
          loading={loading}
          searchPlaceholder="Search by invoice…"
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New purchase order</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Supplier</Label>
                <Select
                  value={form.watch("supplierId")}
                  onValueChange={(v) => form.setValue("supplierId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.supplierId && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.supplierId.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Invoice #</Label>
                <Input {...form.register("invoiceNumber")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" {...form.register("purchaseDate")} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Items</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => append({ productId: "", quantity: 1, buyingPrice: 0 })}
                >
                  <Plus className="size-3.5" /> Add line
                </Button>
              </div>
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-6">
                      <Select
                        value={form.watch(`items.${i}.productId`)}
                        onValueChange={(v) => {
                          form.setValue(`items.${i}.productId`, v);
                          const p = productMap.get(v);
                          if (p && !form.getValues(`items.${i}.buyingPrice`))
                            form.setValue(`items.${i}.buyingPrice`, p.buyingPrice);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      className="col-span-2"
                      type="number"
                      step="1"
                      min="1"
                      placeholder="Qty"
                      {...form.register(`items.${i}.quantity`)}
                    />
                    <Input
                      className="col-span-3"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Buying price"
                      {...form.register(`items.${i}.buyingPrice`)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="col-span-1 size-9 text-destructive"
                      onClick={() => remove(i)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {form.formState.errors.items && (
                <p className="text-xs text-destructive mt-1">
                  {form.formState.errors.items.message as string}
                </p>
              )}
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Shipping cost</Label>
                <Input type="number" step="0.01" min="0" {...form.register("shippingCost")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Other cost</Label>
                <Input type="number" step="0.01" min="0" {...form.register("otherCost")} />
              </div>
              <Card className="p-3 bg-muted/40 flex flex-col justify-center">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div>
                <div className="text-lg font-semibold">{currency(total)}</div>
              </Card>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} {...form.register("notes")} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}Create PO
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
