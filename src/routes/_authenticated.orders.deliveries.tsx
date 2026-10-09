import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Truck,
  Trash2,
  Printer,
  Check,
  PackageCheck,
  Undo2,
  Clock,
} from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { StatCard } from "@/components/admin/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import type { Order } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

type DeliveryStatus =
  "pending" | "picked_up" | "in_transit" | "out_for_delivery" | "delivered" | "returned" | "failed";

interface Delivery {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  address?: string;
  courier: string;
  trackingNumber?: string;
  deliveryCharge: number;
  codAmount: number;
  status: DeliveryStatus;
  dispatchDate: number;
  expectedDate?: number | null;
  deliveredDate?: number | null;
  notes?: string;
  createdAt: number;
  createdBy: string;
}

export const Route = createFileRoute("/_authenticated/orders/deliveries")({
  head: () => ({
    meta: [
      { title: "Deliveries — PulseERP" },
      {
        name: "description",
        content: "Track courier shipments, tracking numbers and delivery status for every order.",
      },
      { property: "og:title", content: "Deliveries — PulseERP" },
      {
        property: "og:description",
        content: "Track courier shipments, tracking numbers and delivery status for every order.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeliveriesPage,
});

const STATUS: Array<{ value: DeliveryStatus; label: string }> = [
  { value: "pending", label: "Pending pickup" },
  { value: "picked_up", label: "Picked up" },
  { value: "in_transit", label: "In transit" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "returned", label: "Returned" },
  { value: "failed", label: "Failed" },
];

const statusLabel = (s: DeliveryStatus) => STATUS.find((x) => x.value === s)?.label ?? s;

const schema = z.object({
  orderId: z.string().min(1, "Select an order"),
  courier: z.string().min(1, "Courier is required").max(80),
  trackingNumber: z.string().max(80).optional().or(z.literal("")),
  deliveryCharge: z.coerce.number().min(0),
  codAmount: z.coerce.number().min(0),
  status: z.enum([
    "pending",
    "picked_up",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "returned",
    "failed",
  ]),
  dispatchDate: z.string().min(1),
  expectedDate: z.string().optional().or(z.literal("")),
  notes: z.string().max(400).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

const orderTotal = (o: Order) =>
  o.items.reduce((s, it) => s + it.sellingPrice * it.quantity, 0) -
  (o.discount || 0) +
  (o.deliveryCharge || 0);

function DeliveriesPage() {
  const { data: deliveries, loading } = useDbList<Delivery>("deliveries");
  const { data: orders } = useDbList<Order>("orders");
  const orderMap = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Delivery | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      orderId: "",
      courier: "",
      trackingNumber: "",
      deliveryCharge: 0,
      codAmount: 0,
      status: "pending",
      dispatchDate: new Date().toISOString().slice(0, 10),
      expectedDate: "",
      notes: "",
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({
      orderId: "",
      courier: "",
      trackingNumber: "",
      deliveryCharge: 0,
      codAmount: 0,
      status: "pending",
      dispatchDate: new Date().toISOString().slice(0, 10),
      expectedDate: "",
      notes: "",
    });
    setOpen(true);
  };

  const openEdit = (d: Delivery) => {
    setEditing(d);
    form.reset({
      orderId: d.orderId,
      courier: d.courier,
      trackingNumber: d.trackingNumber || "",
      deliveryCharge: d.deliveryCharge || 0,
      codAmount: d.codAmount || 0,
      status: d.status,
      dispatchDate: new Date(d.dispatchDate || Date.now()).toISOString().slice(0, 10),
      expectedDate: d.expectedDate ? new Date(d.expectedDate).toISOString().slice(0, 10) : "",
      notes: d.notes || "",
    });
    setOpen(true);
  };

  const onSubmit = form.handleSubmit(async (vals) => {
    setSaving(true);
    try {
      const o = orderMap.get(vals.orderId);
      const payload = {
        orderId: vals.orderId,
        orderNumber: o?.orderNumber || editing?.orderNumber || "",
        customerName: o?.customerName || editing?.customerName || "",
        customerPhone: o?.customerPhone || "",
        address: o?.customerAddress || "",
        courier: vals.courier,
        trackingNumber: vals.trackingNumber || "",
        deliveryCharge: vals.deliveryCharge,
        codAmount: vals.codAmount,
        status: vals.status,
        dispatchDate: new Date(vals.dispatchDate).getTime(),
        expectedDate: vals.expectedDate ? new Date(vals.expectedDate).getTime() : null,
        deliveredDate: vals.status === "delivered" ? editing?.deliveredDate || Date.now() : null,
        notes: vals.notes || "",
        createdBy: auth.currentUser?.uid || "",
      };
      if (editing) {
        await updateItem(`deliveries/${editing.id}`, payload);
        await logAudit({
          action: "delivery.update",
          entity: "delivery",
          entityId: editing.id,
          newValue: payload,
        });
        toast.success("Delivery updated");
      } else {
        const id = await createItem("deliveries", { ...payload, createdAt: Date.now() });
        await logAudit({
          action: "delivery.create",
          entity: "delivery",
          entityId: id,
          newValue: payload,
        });
        toast.success("Delivery created");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  });

  const setStatus = async (d: Delivery, status: DeliveryStatus) => {
    try {
      const updates: Record<string, unknown> = {
        [`deliveries/${d.id}/status`]: status,
        [`deliveries/${d.id}/deliveredDate`]: status === "delivered" ? Date.now() : null,
      };
      // keep the linked order in sync
      if (orderMap.has(d.orderId)) {
        if (status === "delivered") {
          updates[`orders/${d.orderId}/status`] = "delivered";
          updates[`orders/${d.orderId}/deliveredDate`] = Date.now();
        } else if (status === "returned") {
          updates[`orders/${d.orderId}/status`] = "returned";
        } else if (status !== "failed") {
          updates[`orders/${d.orderId}/status`] = "shipped";
        }
      }
      await update(ref(null, "/"), updates);
      await logAudit({
        action: `delivery.${status}`,
        entity: "delivery",
        entityId: d.id,
        newValue: { status },
      });
      toast.success(`Marked as ${statusLabel(status).toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleDelete = async (d: Delivery) => {
    await removeItem(`deliveries/${d.id}`);
    await logAudit({ action: "delivery.delete", entity: "delivery", entityId: d.id });
    toast.success("Deleted");
  };

  const rows = useMemo(
    () =>
      statusFilter === "all" ? deliveries : deliveries.filter((d) => d.status === statusFilter),
    [deliveries, statusFilter],
  );

  const stats = useMemo(() => {
    const active = deliveries.filter(
      (d) => !["delivered", "returned", "failed"].includes(d.status),
    );
    const delivered = deliveries.filter((d) => d.status === "delivered");
    const returned = deliveries.filter((d) => d.status === "returned" || d.status === "failed");
    const codDue = active.reduce((s, d) => s + Number(d.codAmount || 0), 0);
    return {
      active: active.length,
      delivered: delivered.length,
      returned: returned.length,
      codDue,
    };
  }, [deliveries]);

  const columns: ColumnDef<Delivery>[] = [
    {
      accessorKey: "orderNumber",
      header: "Order #",
      cell: ({ row }) => <span className="font-medium">{row.original.orderNumber || "—"}</span>,
    },
    {
      accessorKey: "customerName",
      header: "Customer",
      cell: ({ row }) => (
        <div>
          <div className="text-sm">{row.original.customerName || "—"}</div>
          <div className="text-xs text-muted-foreground">{row.original.customerPhone || "—"}</div>
        </div>
      ),
    },
    {
      accessorKey: "courier",
      header: "Courier",
      cell: ({ row }) => (
        <div>
          <div className="text-sm">{row.original.courier}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.trackingNumber || "no tracking #"}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "dispatchDate",
      header: "Dispatched",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.dispatchDate)}</span>,
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
      accessorKey: "codAmount",
      header: "COD",
      cell: ({ row }) => (
        <span className="font-medium">{currency(row.original.codAmount || 0)}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        const v =
          s === "delivered"
            ? "default"
            : s === "returned" || s === "failed"
              ? "destructive"
              : "secondary";
        return (
          <Badge variant={v} className="text-[10px]">
            {statusLabel(s)}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const d = row.original;
        const done = ["delivered", "returned", "failed"].includes(d.status);
        return (
          <div className="flex justify-end gap-1">
            {!done && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[color:var(--success)]"
                onClick={() => setStatus(d, "delivered")}
              >
                <Check className="size-3.5" /> Delivered
              </Button>
            )}
            {!done && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => setStatus(d, "returned")}
              >
                <Undo2 className="size-3.5" /> Return
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8" onClick={() => openEdit(d)}>
              Edit
            </Button>
            {orderMap.has(d.orderId) && (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-8"
                title="Print POS label"
              >
                <Link to="/label/order/$id" params={{ id: d.orderId }}>
                  <Printer className="size-3.5" />
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive"
              onClick={() => handleDelete(d)}
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
        title="Deliveries"
        description="Track courier shipments, tracking numbers and delivery status. Updating a delivery keeps its order in sync."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New delivery
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="In transit"
          value={stats.active}
          icon={<Truck className="size-4" />}
          tone="info"
        />
        <StatCard
          label="Delivered"
          value={stats.delivered}
          icon={<PackageCheck className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Returned / failed"
          value={stats.returned}
          icon={<Undo2 className="size-4" />}
          tone="destructive"
        />
        <StatCard
          label="COD in transit"
          value={currency(stats.codDue)}
          icon={<Clock className="size-4" />}
        />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!loading && deliveries.length === 0 ? (
        <EmptyState
          icon={<Truck className="size-5" />}
          title="No deliveries tracked yet"
          description="Create a delivery from an order to start tracking courier shipments."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" /> New delivery
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          searchPlaceholder="Search by order #, customer or courier…"
          initialPageSize={15}
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit delivery" : "New delivery"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Order</Label>
              <Select
                value={form.watch("orderId")}
                onValueChange={(v) => {
                  form.setValue("orderId", v);
                  const o = orderMap.get(v);
                  if (o) {
                    form.setValue("deliveryCharge", o.deliveryCharge || 0);
                    if (o.paymentMethod === "cod") form.setValue("codAmount", orderTotal(o));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an order" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.orderNumber} — {o.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.orderId && (
                <p className="text-xs text-destructive">{form.formState.errors.orderId.message}</p>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Courier</Label>
                <Input placeholder="Pathao, Steadfast, RedX…" {...form.register("courier")} />
                {form.formState.errors.courier && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.courier.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tracking number</Label>
                <Input {...form.register("trackingNumber")} />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Dispatch date</Label>
                <Input type="date" {...form.register("dispatchDate")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expected date</Label>
                <Input type="date" {...form.register("expectedDate")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={form.watch("status")}
                  onValueChange={(v) => form.setValue("status", v as DeliveryStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Delivery charge</Label>
                <Input type="number" step="0.01" min="0" {...form.register("deliveryCharge")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">COD amount to collect</Label>
                <Input type="number" step="0.01" min="0" {...form.register("codAmount")} />
              </div>
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
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save changes" : "Create delivery"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
