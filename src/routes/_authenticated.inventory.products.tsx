import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ProductDialog } from "@/components/admin/ProductDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { useDbList, removeItem, logAudit } from "@/lib/db";
import type { Product, Category, Brand, Supplier } from "@/lib/types";
import { currency, percent, number } from "@/lib/format";
import { unitProfit, profitMargin, stockStatus, totalCost } from "@/lib/calc";

export const Route = createFileRoute("/_authenticated/inventory/products")({
  head: () => ({ meta: [{ title: "Products — PulseERP" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const { data: products, loading } = useDbList<Product>("products");
  const { data: categories } = useDbList<Category>("categories");
  const { data: brands } = useDbList<Brand>("brands");
  const { data: suppliers } = useDbList<Supplier>("suppliers");

  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const brandMap = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await removeItem(`products/${confirmDelete.id}`);
      await logAudit({
        action: "product.delete",
        entity: "product",
        entityId: confirmDelete.id,
        oldValue: { name: confirmDelete.name, sku: confirmDelete.sku },
      });
      toast.success("Product deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setConfirmDelete(null);
    }
  };

  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Product",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">SKU: {row.original.sku}</div>
          </div>
        ),
      },
      {
        accessorKey: "categoryId",
        header: "Category",
        cell: ({ row }) => (
          <span className="text-xs">{catMap.get(row.original.categoryId || "") || "—"}</span>
        ),
      },
      {
        accessorKey: "brandId",
        header: "Brand",
        cell: ({ row }) => (
          <span className="text-xs">{brandMap.get(row.original.brandId || "") || "—"}</span>
        ),
      },
      {
        accessorKey: "sellingPrice",
        header: "Price",
        cell: ({ row }) => (
          <div className="text-right">
            <div className="font-medium">{currency(row.original.sellingPrice)}</div>
            <div className="text-xs text-muted-foreground">
              cost {currency(totalCost(row.original))}
            </div>
          </div>
        ),
      },
      {
        id: "profit",
        header: "Profit",
        cell: ({ row }) => {
          const p = unitProfit(row.original);
          return (
            <div className="text-right">
              <div
                className={`font-medium ${p >= 0 ? "text-[color:var(--success)]" : "text-destructive"}`}
              >
                {currency(p)}
              </div>
              <div className="text-xs text-muted-foreground">
                {percent(profitMargin(row.original))}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "currentStock",
        header: "Stock",
        cell: ({ row }) => {
          const s = stockStatus(row.original);
          const variant = s === "out" ? "destructive" : s === "low" ? "secondary" : "default";
          return (
            <div className="flex items-center gap-2">
              <span className="font-medium">{number(row.original.currentStock)}</span>
              <Badge variant={variant} className="text-[10px]">
                {s === "out" ? "Out" : s === "low" ? "Low" : "OK"}
              </Badge>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === "active" ? "default" : "secondary"}
            className="text-[10px]"
          >
            {row.original.status}
          </Badge>
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
              onClick={() => {
                setEditing(row.original);
                setOpen(true);
              }}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive"
              onClick={() => setConfirmDelete(row.original)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [catMap, brandMap],
  );

  return (
    <div>
      <PageHeader
        title="Products"
        description={`${products.length} products in catalog`}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Add product
          </Button>
        }
      />

      {!loading && products.length === 0 ? (
        <EmptyState
          icon={<Package className="size-5" />}
          title="No products yet"
          description="Add your first product to start tracking inventory, pricing and profit."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" /> Add product
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={products}
          searchPlaceholder="Search products by name or SKU…"
          loading={loading}
          initialPageSize={15}
        />
      )}

      <ProductDialog
        open={open}
        onOpenChange={setOpen}
        product={editing}
        categories={categories}
        brands={brands}
        suppliers={suppliers}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete product?"
        description={`${confirmDelete?.name} will be permanently removed. This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
