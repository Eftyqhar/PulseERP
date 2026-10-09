import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createItem, updateItem, logAudit } from "@/lib/db";
import type { Product, Category, Brand, Supplier } from "@/lib/types";
import { totalCost, unitProfit, profitMargin, importCost, marketingCost } from "@/lib/calc";
import { currency, percent } from "@/lib/format";

const schema = z.object({
  name: z.string().min(2, "Name required").max(120),
  sku: z.string().min(1, "SKU required").max(64),
  barcode: z.string().max(64).optional().or(z.literal("")),
  categoryId: z.string().optional().or(z.literal("")),
  brandId: z.string().optional().or(z.literal("")),
  supplierId: z.string().optional().or(z.literal("")),
  buyingPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  courierCost: z.coerce.number().min(0),
  packagingCost: z.coerce.number().min(0),
  marketingCost: z.coerce.number().min(0),
  adsCost: z.coerce.number().min(0),
  influencerCost: z.coerce.number().min(0),
  promotionCost: z.coerce.number().min(0),
  marketplaceFee: z.coerce.number().min(0),
  transactionFee: z.coerce.number().min(0),
  otherCost: z.coerce.number().min(0),
  shipmentCost: z.coerce.number().min(0),
  customsDuty: z.coerce.number().min(0),
  importTax: z.coerce.number().min(0),
  clearanceFee: z.coerce.number().min(0),
  importOtherCost: z.coerce.number().min(0),
  currentStock: z.coerce.number().int().min(0),
  minimumStock: z.coerce.number().int().min(0),
  reservedStock: z.coerce.number().int().min(0),
  damagedStock: z.coerce.number().int().min(0),
  description: z.string().max(2000).optional().or(z.literal("")),
  imageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]),
});

type FormValues = z.infer<typeof schema>;

const empty: FormValues = {
  name: "",
  sku: "",
  barcode: "",
  categoryId: "",
  brandId: "",
  supplierId: "",
  buyingPrice: 0,
  sellingPrice: 0,
  courierCost: 0,
  packagingCost: 0,
  marketingCost: 0,
  adsCost: 0,
  influencerCost: 0,
  promotionCost: 0,
  marketplaceFee: 0,
  transactionFee: 0,
  otherCost: 0,
  shipmentCost: 0,
  customsDuty: 0,
  importTax: 0,
  clearanceFee: 0,
  importOtherCost: 0,
  currentStock: 0,
  minimumStock: 0,
  reservedStock: 0,
  damagedStock: 0,
  description: "",
  imageUrl: "",
  status: "active",
};

export function ProductDialog({
  open,
  onOpenChange,
  product,
  categories,
  brands,
  suppliers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product?: Product | null;
  categories: Category[];
  brands: Brand[];
  suppliers: Supplier[];
}) {
  const [saving, setSaving] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: product
      ? {
          ...empty,
          ...product,
          barcode: product.barcode || "",
          categoryId: product.categoryId || "",
          brandId: product.brandId || "",
          supplierId: product.supplierId || "",
          description: product.description || "",
          imageUrl: product.images?.[0] || "",
        }
      : empty,
  });

  const values = form.watch();
  const calc = useMemo(() => {
    const tc = totalCost(values);
    const profit = unitProfit(values);
    const margin = profitMargin(values);
    const ic = importCost(values);
    const mc = marketingCost(values);
    return { tc, profit, margin, ic, mc };
  }, [values]);

  const onSubmit = form.handleSubmit(async (data) => {
    setSaving(true);
    try {
      const { imageUrl, ...rest } = data;
      const payload = {
        ...rest,
        barcode: data.barcode || "",
        categoryId: data.categoryId || "",
        brandId: data.brandId || "",
        supplierId: data.supplierId || "",
        description: data.description || "",
        images: imageUrl ? [imageUrl] : [],
        updatedAt: Date.now(),
      };
      if (product) {
        await updateItem(`products/${product.id}`, payload);
        await logAudit({
          action: "product.update",
          entity: "product",
          entityId: product.id,
          oldValue: { sellingPrice: product.sellingPrice, currentStock: product.currentStock },
          newValue: { sellingPrice: data.sellingPrice, currentStock: data.currentStock },
        });
        toast.success("Product updated");
      } else {
        const id = await createItem("products", { ...payload, createdAt: Date.now() });
        await logAudit({
          action: "product.create",
          entity: "product",
          entityId: id,
          newValue: { name: data.name, sku: data.sku },
        });
        toast.success("Product added");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle>
          <DialogDescription>
            {product
              ? "Update product details, pricing and stock."
              : "Create a new product in your catalog."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Tabs defaultValue="basic">
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              <TabsTrigger value="marketing">Marketing</TabsTrigger>
              <TabsTrigger value="import">Import</TabsTrigger>
              <TabsTrigger value="stock">Stock</TabsTrigger>
              <TabsTrigger value="meta">Meta</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <Field label="Image URL" error={form.formState.errors.imageUrl?.message}>
                <Input placeholder="https://example.com/image.jpg" {...form.register("imageUrl")} />
                {values.imageUrl && (
                  <img
                    src={values.imageUrl}
                    alt="Preview"
                    className="mt-2 size-32 rounded-md border object-cover"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                )}
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Product name" error={form.formState.errors.name?.message}>
                  <Input {...form.register("name")} />
                </Field>
                <Field label="SKU" error={form.formState.errors.sku?.message}>
                  <Input {...form.register("sku")} />
                </Field>
                <Field label="Barcode">
                  <Input {...form.register("barcode")} />
                </Field>
                <Field label="Status">
                  <Select
                    value={values.status}
                    onValueChange={(v) => form.setValue("status", v as "active" | "inactive")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Category">
                  <Select
                    value={values.categoryId || "_none"}
                    onValueChange={(v) => form.setValue("categoryId", v === "_none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Brand">
                  <Select
                    value={values.brandId || "_none"}
                    onValueChange={(v) => form.setValue("brandId", v === "_none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Supplier">
                  <Select
                    value={values.supplierId || "_none"}
                    onValueChange={(v) => form.setValue("supplierId", v === "_none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.company}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="pricing" className="space-y-4 mt-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <NumField name="buyingPrice" label="Buying price" form={form} />
                <NumField name="sellingPrice" label="Selling price" form={form} />
                <NumField name="courierCost" label="Courier cost" form={form} />
                <NumField name="packagingCost" label="Packaging cost" form={form} />
                <NumField name="transactionFee" label="Transaction fee" form={form} />
                <NumField name="otherCost" label="Other cost" form={form} />
              </div>
              <Card className="p-4 bg-muted/40">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">
                      Total cost
                    </div>
                    <div className="font-semibold text-base mt-0.5">{currency(calc.tc)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">
                      Profit / unit
                    </div>
                    <div
                      className={`font-semibold text-base mt-0.5 ${calc.profit >= 0 ? "text-[color:var(--success)]" : "text-destructive"}`}
                    >
                      {currency(calc.profit)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">
                      Margin
                    </div>
                    <div
                      className={`font-semibold text-base mt-0.5 ${calc.margin >= 0 ? "text-[color:var(--success)]" : "text-destructive"}`}
                    >
                      {percent(calc.margin)}
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="marketing" className="space-y-4 mt-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <NumField name="marketingCost" label="Marketing / ads cost" form={form} />
                <NumField name="adsCost" label="Digital ads cost" form={form} />
                <NumField name="influencerCost" label="Influencer cost" form={form} />
                <NumField name="promotionCost" label="Promotion / discount cost" form={form} />
                <NumField name="marketplaceFee" label="Marketplace / platform fee" form={form} />
              </div>
              <Card className="p-4 bg-muted/40">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">
                      Total marketing cost
                    </div>
                    <div className="font-semibold text-base mt-0.5">{currency(calc.mc)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">
                      Included in cost / unit
                    </div>
                    <div className="font-semibold text-base mt-0.5">{currency(calc.tc)}</div>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="import" className="space-y-4 mt-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <NumField name="shipmentCost" label="Shipment cost" form={form} />
                <NumField name="customsDuty" label="Customs duty" form={form} />
                <NumField name="importTax" label="Import tax / VAT" form={form} />
                <NumField name="clearanceFee" label="Clearance / handling fee" form={form} />
                <NumField name="importOtherCost" label="Other import cost" form={form} />
              </div>
              <Card className="p-4 bg-muted/40">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">
                      Total import cost
                    </div>
                    <div className="font-semibold text-base mt-0.5">{currency(calc.ic)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">
                      Landed cost / unit
                    </div>
                    <div className="font-semibold text-base mt-0.5">{currency(calc.tc)}</div>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="stock" className="space-y-4 mt-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <NumField name="currentStock" label="Current stock" form={form} integer />
                <NumField name="minimumStock" label="Minimum stock" form={form} integer />
                <NumField name="reservedStock" label="Reserved stock" form={form} integer />
                <NumField name="damagedStock" label="Damaged stock" form={form} integer />
              </div>
            </TabsContent>

            <TabsContent value="meta" className="space-y-4 mt-4">
              <Field label="Description">
                <Textarea rows={5} {...form.register("description")} />
              </Field>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {product ? "Save changes" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function NumField({
  name,
  label,
  form,
  integer,
}: {
  name: keyof FormValues;
  label: string;
  form: ReturnType<typeof useForm<FormValues>>;
  integer?: boolean;
}) {
  const err = form.formState.errors[name]?.message as string | undefined;
  return (
    <Field label={label} error={err}>
      <Input
        type="number"
        step={integer ? "1" : "0.01"}
        min="0"
        {...form.register(name, { valueAsNumber: true })}
      />
    </Field>
  );
}
