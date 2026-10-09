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
import { useDbList, createItem, removeItem, logAudit, ref, update } from "@/lib/db";
import { auth } from "@/lib/auth-context";
import type { Product, PreOrder } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/orders/pre-orders")({
  head: () => ({ meta: [{ title: "Pre-Orders — PulseERP" }] }),
  component: PreOrdersPage,
});

const schema = z.object({
  preOrderNumber: z.string().min(1).max(60),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(40).optional().or(z.literal("")),
  customerAddress: z.string().max(300).optional().or(z.literal("")),
  orderDate: z.string().min(1),
  expectedDate: z.string().optional().or(z.literal("")),
  advancePayment: z.coerce.number().min(0),
  paymentMethod: z.enum(["cod", "bkash", "nagad", "card", "bank", "other"]),
  notes: z.string().max(400).optional().or(z.literal("")),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        productName: z.string().optional(),
        quantity: z.coerce.number().int().min(1),
        sellingPrice: z.coerce.number().min(0),
      }),
    )
    .min(1),
});
type FormValues = z.infer<typeof schema>;

function PreOrdersPage() {
  const { data: preOrders, loading } = useDbList<PreOrder>("preOrders");
  const { data: products } = useDbList<Product>("products");
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      preOrderNumber: "",
      customerName: "",
      customerPhone: "",
      customerAddress: "",
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDate: "",
      advancePayment: 0,
      paymentMethod: "cod",
      notes: "",
      items: [{ productId: "", productName: "", quantity: 1, sellingPrice: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items = form.watch("items");
  const total = items.reduce(
    (s, it) => s + Number(it.quantity || 0) * Number(it.sellingPrice || 0),
    0,
  );
  const advance = Number(form.watch("advancePayment") || 0);
  const due = Math.max(0, total - advance);

  const openCreate = () => {
    form.reset({
      preOrderNumber: `PRE-${Date.now().toString().slice(-6)}`,
      customerName: "",
      customerPhone: "",
      customerAddress: "",
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDate: "",
      advancePayment: 0,
      paymentMethod: "cod",
      notes: "",
      items: [{ productId: "", productName: "", quantity: 1, sellingPrice: 0 }],
    });
    setOpen(true);
  };

  const onSubmit = form.handleSubmit(async (vals) => {
    setSaving(true);
    try {
      const totalAmount = vals.items.reduce((s, it) => s + it.quantity * it.sellingPrice, 0);
      const payload: Omit<PreOrder, "id"> = {
        preOrderNumber: vals.preOrderNumber,
        customerName: vals.customerName,
        customerPhone: vals.customerPhone || "",
        customerAddress: vals.customerAddress || "",
        items: vals.items.map((it) => ({
          productId: it.productId,
          productName: productMap.get(it.productId)?.name || it.productName || "",
          quantity: it.quantity,
          sellingPrice: it.sellingPrice,
        })),
        advancePayment: vals.advancePayment,
        totalAmount,
        paymentMethod: vals.paymentMethod,
        expectedDate: vals.expectedDate ? new Date(vals.expectedDate).getTime() : null,
        status: "pending",
        orderDate: new Date(vals.orderDate).getTime(),
        fulfilledDate: null,
        notes: vals.notes || "",
        createdAt: Date.now(),
        createdBy: auth.currentUser?.uid || "",
      };
      const id = await createItem("preOrders", payload);
      await logAudit({
        action: "preorder.create",
        entity: "preOrder",
        entityId: id,
        newValue: { preOrderNumber: vals.preOrderNumber, totalAmount },
      });
      toast.success("Pre-order created");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  });

  const setStatus = async (o: PreOrder, status: PreOrder["status"]) => {
    try {
      const updates: Record<string, unknown> = {
        [`preOrders/${o.id}/status`]: status,
      };
      if (status === "fulfilled") {
        updates[`preOrders/${o.id}/fulfilledDate`] = Date.now();
        o.items.forEach((it) => {
          const p = productMap.get(it.productId);
          if (p) {
            updates[`products/${it.productId}/currentStock`] = Math.max(
              0,
              (p.currentStock || 0) - it.quantity,
            );
            updates[`products/${it.productId}/updatedAt`] = Date.now();
          }
        });
      }
      await update(ref(null, "/"), updates);
      await logAudit({
        action: `preorder.${status}`,
        entity: "preOrder",
        entityId: o.id,
        newValue: { status },
      });
      toast.success(`Pre-order marked as ${status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleDelete = async (o: PreOrder) => {
    await removeItem(`preOrders/${o.id}`);
    await logAudit({ action: "preorder.delete", entity: "preOrder", entityId: o.id });
    toast.success("Deleted");
  };

  const columns: ColumnDef<PreOrder>[] = [
    {
      accessorKey: "preOrderNumber",
      header: "Pre-Order #",
      cell: ({ row }) => <span className="font-medium">{row.original.preOrderNumber}</span>,
    },
    {
      accessorKey: "customerName",
      header: "Customer",
      cell: ({ row }) => (
        <div>
          <div className="text-sm">{row.original.customerName}</div>
          <div className="text-xs text-muted-foreground">{row.original.customerPhone || "—"}</div>
        </div>
      ),
    },
    {
      accessorKey: "orderDate",
      header: "Ordered",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.orderDate)}</span>,
    },
    {
      accessorKey: "expectedDate",
      header: "Expected",
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.expectedDate ? dateShort(row.original.expectedDate) : "—"}
        </span>
      ),
    },
    {
      id: "qty",
      header: "Items",
      cell: ({ row }) => row.original.items.reduce((s, it) => s + it.quantity, 0),
    },
    {
      id: "total",
      header: "Total",
      cell: ({ row }) => <span className="font-medium">{currency(row.original.totalAmount)}</span>,
    },
    {
      id: "advance",
      header: "Advance",
      cell: ({ row }) => <span className="text-xs">{currency(row.original.advancePayment)}</span>,
    },
    {
      id: "due",
      header: "Due",
      cell: ({ row }) => (
        <span className="text-xs">
          {currency(Math.max(0, row.original.totalAmount - row.original.advancePayment))}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        const v = s === "fulfilled" ? "default" : s === "cancelled" ? "destructive" : "secondary";
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
      cell: ({ row }) => {
        const o = row.original;
        return (
          <div className="flex justify-end gap-1">
            {o.status === "pending" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => setStatus(o, "confirmed")}
              >
                Confirm
              </Button>
            )}
            {(o.status === "pending" || o.status === "confirmed") && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[color:var(--success)]"
                  onClick={() => setStatus(o, "fulfilled")}
                >
                  <Check className="size-3.5" /> Fulfill
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive"
                  onClick={() => setStatus(o, "cancelled")}
                >
                  <X className="size-3.5" /> Cancel
                </Button>
              </>
            )}
            <Button asChild variant="ghost" size="icon" className="size-8" title="Invoice">
              <Link to="/invoice/$type/$id" params={{ type: "preorder", id: o.id }}>
                <FileText className="size-3.5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive"
              onClick={() => handleDelete(o)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Pre-Orders"
        description="Reserve upcoming stock for customers. Fulfilling a pre-order decrements stock automatically."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New pre-order
          </Button>
        }
      />

      {!loading && preOrders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title="No pre-orders yet"
          description="Capture customer reservations for upcoming or out-of-stock products."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" /> New pre-order
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={preOrders}
          loading={loading}
          searchPlaceholder="Search by pre-order # or customer…"
          initialPageSize={15}
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New pre-order</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Pre-Order #</Label>
                <Input {...form.register("preOrderNumber")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Order date</Label>
                <Input type="date" {...form.register("orderDate")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expected date</Label>
                <Input type="date" {...form.register("expectedDate")} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Customer name</Label>
                <Input {...form.register("customerName")} />
                {form.formState.errors.customerName && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.customerName.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input {...form.register("customerPhone")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Input {...form.register("customerAddress")} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Items</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    append({ productId: "", productName: "", quantity: 1, sellingPrice: 0 })
                  }
                >
                  <Plus className="size-3.5" /> Add line
                </Button>
              </div>
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-12 gap-2">
                    <div className="col-span-6">
                      <Select
                        value={form.watch(`items.${i}.productId`)}
                        onValueChange={(v) => {
                          form.setValue(`items.${i}.productId`, v);
                          const p = productMap.get(v);
                          if (p) {
                            form.setValue(`items.${i}.productName`, p.name);
                            if (!form.getValues(`items.${i}.sellingPrice`))
                              form.setValue(`items.${i}.sellingPrice`, p.sellingPrice);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} — stock {p.currentStock}
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
                      placeholder="Price"
                      {...form.register(`items.${i}.sellingPrice`)}
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
            </div>

            <div className="grid sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Payment method</Label>
                <Select
                  value={form.watch("paymentMethod")}
                  onValueChange={(v) =>
                    form.setValue("paymentMethod", v as FormValues["paymentMethod"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cod">Cash on delivery</SelectItem>
                    <SelectItem value="bkash">bKash</SelectItem>
                    <SelectItem value="nagad">Nagad</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank">Bank transfer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Advance payment</Label>
                <Input type="number" step="0.01" min="0" {...form.register("advancePayment")} />
              </div>
              <Card className="p-3 bg-muted/40 flex flex-col justify-center">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div>
                <div className="text-lg font-semibold">{currency(total)}</div>
              </Card>
              <Card className="p-3 bg-muted/40 flex flex-col justify-center">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Due</div>
                <div className="text-lg font-semibold">{currency(due)}</div>
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
                {saving && <Loader2 className="size-4 animate-spin" />}Create pre-order
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
