import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, ShoppingCart, Check, FileText, Printer } from "lucide-react";
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
import type { Product, Order } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

interface Seller {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({ meta: [{ title: "Orders — PulseERP" }] }),
  component: OrdersPage,
});

const schema = z.object({
  orderNumber: z.string().min(1).max(60),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(40).optional().or(z.literal("")),
  customerAddress: z.string().max(300).optional().or(z.literal("")),
  orderDate: z.string().min(1),
  discount: z.coerce.number().min(0),
  deliveryCharge: z.coerce.number().min(0),
  courierCost: z.coerce.number().min(0),
  paymentMethod: z.enum(["cod", "bkash", "nagad", "card", "bank", "other"]),
  soldBy: z.string().max(120).optional().or(z.literal("")),
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

function OrdersPage() {
  const { data: orders, loading } = useDbList<Order>("orders");
  const { data: products } = useDbList<Product>("products");
  const { data: sellers } = useDbList<Seller>("sellers");
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      orderNumber: "",
      customerName: "",
      customerPhone: "",
      customerAddress: "",
      orderDate: new Date().toISOString().slice(0, 10),
      discount: 0,
      deliveryCharge: 0,
      courierCost: 0,
      paymentMethod: "cod",
      soldBy: "",
      notes: "",
      items: [{ productId: "", productName: "", quantity: 1, sellingPrice: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items = form.watch("items");
  const subtotal = items.reduce(
    (s, it) => s + Number(it.quantity || 0) * Number(it.sellingPrice || 0),
    0,
  );
  const discount = Number(form.watch("discount") || 0);
  const delivery = Number(form.watch("deliveryCharge") || 0);
  const total = Math.max(0, subtotal - discount + delivery);

  const openCreate = () => {
    form.reset({
      orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
      customerName: "",
      customerPhone: "",
      customerAddress: "",
      orderDate: new Date().toISOString().slice(0, 10),
      discount: 0,
      deliveryCharge: 0,
      courierCost: 0,
      paymentMethod: "cod",
      soldBy: "",
      notes: "",
      items: [{ productId: "", productName: "", quantity: 1, sellingPrice: 0 }],
    });
    setOpen(true);
  };

  const onSubmit = form.handleSubmit(async (vals) => {
    setSaving(true);
    try {
      const payload: Omit<Order, "id"> = {
        orderNumber: vals.orderNumber,
        customerName: vals.customerName,
        customerPhone: vals.customerPhone || "",
        customerAddress: vals.customerAddress || "",
        items: vals.items.map((it) => ({
          productId: it.productId,
          productName: productMap.get(it.productId)?.name || it.productName || "",
          quantity: it.quantity,
          sellingPrice: it.sellingPrice,
        })),
        discount: vals.discount,
        deliveryCharge: vals.deliveryCharge,
        courierCost: vals.courierCost,
        paymentMethod: vals.paymentMethod,
        soldBy: vals.soldBy || "",
        status: "pending",
        orderDate: new Date(vals.orderDate).getTime(),
        deliveredDate: null,
        notes: vals.notes || "",
        createdAt: Date.now(),
        createdBy: auth.currentUser?.uid || "",
      };
      const id = await createItem("orders", payload);
      await logAudit({
        action: "order.create",
        entity: "order",
        entityId: id,
        newValue: { orderNumber: vals.orderNumber, total },
      });
      toast.success("Order created");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  });

  const setStatus = async (o: Order, status: Order["status"]) => {
    try {
      const updates: Record<string, unknown> = {
        [`orders/${o.id}/status`]: status,
      };
      if (status === "delivered") {
        updates[`orders/${o.id}/deliveredDate`] = Date.now();
        // decrement stock
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
        action: `order.${status}`,
        entity: "order",
        entityId: o.id,
        newValue: { status },
      });
      toast.success(`Order marked as ${status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleDelete = async (o: Order) => {
    await removeItem(`orders/${o.id}`);
    await logAudit({ action: "order.delete", entity: "order", entityId: o.id });
    toast.success("Deleted");
  };

  const columns: ColumnDef<Order>[] = [
    {
      accessorKey: "orderNumber",
      header: "Order #",
      cell: ({ row }) => <span className="font-medium">{row.original.orderNumber}</span>,
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
      header: "Date",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.orderDate)}</span>,
    },
    {
      accessorKey: "soldBy",
      header: "Sold by",
      cell: ({ row }) => <span className="text-xs">{row.original.soldBy || "—"}</span>,
    },
    {
      id: "qty",
      header: "Items",
      cell: ({ row }) => row.original.items.reduce((s, it) => s + it.quantity, 0),
    },
    {
      id: "total",
      header: "Total",
      cell: ({ row }) => {
        const o = row.original;
        const t =
          o.items.reduce((s, it) => s + it.sellingPrice * it.quantity, 0) -
          o.discount +
          o.deliveryCharge;
        return <span className="font-medium">{currency(t)}</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        const v =
          s === "delivered"
            ? "default"
            : s === "cancelled" || s === "returned"
              ? "destructive"
              : "secondary";
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
                onClick={() => setStatus(o, "processing")}
              >
                Process
              </Button>
            )}
            {o.status === "processing" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => setStatus(o, "shipped")}
              >
                Ship
              </Button>
            )}
            {(o.status === "shipped" || o.status === "processing") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[color:var(--success)]"
                onClick={() => setStatus(o, "delivered")}
              >
                <Check className="size-3.5" /> Deliver
              </Button>
            )}
            <Button asChild variant="ghost" size="icon" className="size-8" title="Print POS label">
              <Link to="/label/order/$id" params={{ id: o.id }}>
                <Printer className="size-3.5" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="size-8" title="Invoice">
              <Link to="/invoice/$type/$id" params={{ type: "order", id: o.id }}>
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
        title="Orders"
        description="Customer orders. Marking as delivered decrements stock automatically."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New order
          </Button>
        }
      />

      {!loading && orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="size-5" />}
          title="No orders yet"
          description="Capture customer orders as they come in."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" /> New order
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={orders}
          loading={loading}
          searchPlaceholder="Search by order # or customer…"
          initialPageSize={15}
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New order</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Order #</Label>
                <Input {...form.register("orderNumber")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" {...form.register("orderDate")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payment</Label>
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
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
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
              <div className="space-y-1.5">
                <Label className="text-xs">Sold by</Label>
                <Select
                  value={form.watch("soldBy") || "__none"}
                  onValueChange={(v) => form.setValue("soldBy", v === "__none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select seller" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {sellers.map((s) => (
                      <SelectItem key={s.id} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sellers.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No sellers yet. Add them in Sales → Sellers.
                  </p>
                )}
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
                <Label className="text-xs">Discount</Label>
                <Input type="number" step="0.01" min="0" {...form.register("discount")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Delivery charge</Label>
                <Input type="number" step="0.01" min="0" {...form.register("deliveryCharge")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Courier cost</Label>
                <Input type="number" step="0.01" min="0" {...form.register("courierCost")} />
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
                {saving && <Loader2 className="size-4 animate-spin" />}Create order
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
