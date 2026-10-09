import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatCard } from "@/components/admin/StatCard";
import { Badge } from "@/components/ui/badge";
import { useDbList } from "@/lib/db";
import type { Product } from "@/lib/types";
import { currency, number } from "@/lib/format";
import { inventoryValue, potentialRevenue, stockStatus } from "@/lib/calc";
import { Boxes, AlertTriangle, PackageX, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventory/stock")({
  head: () => ({ meta: [{ title: "Stock — PulseERP" }] }),
  component: StockPage,
});

function StockPage() {
  const { data: products, loading } = useDbList<Product>("products");

  const stats = useMemo(() => {
    const totalUnits = products.reduce((s, p) => s + (p.currentStock || 0), 0);
    const totalValue = products.reduce((s, p) => s + inventoryValue(p), 0);
    const low = products.filter((p) => stockStatus(p) === "low").length;
    const out = products.filter((p) => stockStatus(p) === "out").length;
    return { totalUnits, totalValue, low, out };
  }, [products]);

  const columns: ColumnDef<Product>[] = [
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
      accessorKey: "currentStock",
      header: "Current",
      cell: ({ row }) => <span className="font-medium">{number(row.original.currentStock)}</span>,
    },
    {
      accessorKey: "minimumStock",
      header: "Min",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{number(row.original.minimumStock)}</span>
      ),
    },
    {
      accessorKey: "reservedStock",
      header: "Reserved",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{number(row.original.reservedStock || 0)}</span>
      ),
    },
    {
      accessorKey: "damagedStock",
      header: "Damaged",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{number(row.original.damagedStock || 0)}</span>
      ),
    },
    {
      id: "value",
      header: "Inv. value",
      cell: ({ row }) => (
        <span className="font-medium">{currency(inventoryValue(row.original))}</span>
      ),
    },
    {
      id: "potential",
      header: "Potential rev.",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{currency(potentialRevenue(row.original))}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = stockStatus(row.original);
        return (
          <Badge
            variant={s === "out" ? "destructive" : s === "low" ? "secondary" : "default"}
            className="text-[10px]"
          >
            {s === "out" ? "Out of stock" : s === "low" ? "Low stock" : "Healthy"}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Stock" description="Real-time view of inventory levels and value." />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total units"
          value={number(stats.totalUnits)}
          icon={<Boxes className="size-4" />}
        />
        <StatCard
          label="Inventory value"
          value={currency(stats.totalValue)}
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Low stock"
          value={number(stats.low)}
          icon={<AlertTriangle className="size-4" />}
          tone="warning"
        />
        <StatCard
          label="Out of stock"
          value={number(stats.out)}
          icon={<PackageX className="size-4" />}
          tone="destructive"
        />
      </div>

      <DataTable
        columns={columns}
        data={products}
        loading={loading}
        searchPlaceholder="Search by name or SKU…"
        initialPageSize={15}
      />
    </div>
  );
}
