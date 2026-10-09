import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbList, updateItem, createItem, logAudit } from "@/lib/db";
import { auth } from "@/lib/auth-context";
import type { Product } from "@/lib/types";
import { number } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory/stock-adjustment")({
  head: () => ({ meta: [{ title: "Stock Adjustment — PulseERP" }] }),
  component: StockAdjustmentPage,
});

const schema = z.object({
  productId: z.string().min(1, "Select a product"),
  type: z.enum(["adjustment", "damage", "return"]),
  quantity: z.coerce
    .number()
    .int()
    .refine((v) => v !== 0, "Cannot be zero"),
  reason: z.string().min(2, "Reason is required").max(300),
});
type FormValues = z.infer<typeof schema>;

function StockAdjustmentPage() {
  const { data: products } = useDbList<Product>("products");
  const [saving, setSaving] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { productId: "", type: "adjustment", quantity: 0, reason: "" },
  });

  const selectedId = form.watch("productId");
  const selected = products.find((p) => p.id === selectedId);

  const onSubmit = form.handleSubmit(async (vals) => {
    if (!selected) return;
    setSaving(true);
    try {
      const newStock = Math.max(0, (selected.currentStock || 0) + vals.quantity);
      await updateItem(`products/${selected.id}`, {
        currentStock: newStock,
        updatedAt: Date.now(),
      });
      // record stock history
      await createItem("stock_history", {
        productId: selected.id,
        type: vals.type,
        quantity: vals.quantity,
        reason: vals.reason,
        createdBy: auth.currentUser?.uid || "",
      });
      await logAudit({
        action: "stock.adjust",
        entity: "product",
        entityId: selected.id,
        oldValue: { stock: selected.currentStock },
        newValue: { stock: newStock, delta: vals.quantity, reason: vals.reason, type: vals.type },
      });
      toast.success("Stock adjusted");
      form.reset({ productId: "", type: "adjustment", quantity: 0, reason: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  });

  return (
    <div>
      <PageHeader
        title="Stock adjustment"
        description="Manually correct stock levels with a recorded reason."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Product</Label>
              <Select
                value={form.watch("productId")}
                onValueChange={(v) => form.setValue("productId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — SKU {p.sku}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.productId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.productId.message}
                </p>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select
                  value={form.watch("type")}
                  onValueChange={(v) => form.setValue("type", v as FormValues["type"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                    <SelectItem value="damage">Damage</SelectItem>
                    <SelectItem value="return">Customer return</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity (positive to add, negative to remove)</Label>
                <Input type="number" step="1" {...form.register("quantity")} />
                {form.formState.errors.quantity && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.quantity.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Textarea rows={3} {...form.register("reason")} />
              {form.formState.errors.reason && (
                <p className="text-xs text-destructive">{form.formState.errors.reason.message}</p>
              )}
            </div>

            <Button type="submit" disabled={saving || !selected}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Apply adjustment
            </Button>
          </form>
        </Card>

        <Card className="p-6 bg-muted/30">
          <h3 className="font-semibold mb-3">Current state</h3>
          {selected ? (
            <div className="space-y-3 text-sm">
              <Row label="Product" value={selected.name} />
              <Row label="SKU" value={selected.sku} />
              <Row label="Current stock" value={number(selected.currentStock)} />
              <Row label="Minimum stock" value={number(selected.minimumStock)} />
              <Row
                label="After change"
                value={number(
                  Math.max(0, (selected.currentStock || 0) + Number(form.watch("quantity") || 0)),
                )}
                highlight
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a product to preview the change.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-semibold text-[color:var(--info)]" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}
