import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Receipt, CalendarDays, FileText, Layers, Wallet, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatCard } from "@/components/admin/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbList } from "@/lib/db";
import type { Expense, Purchase, Supplier, Order, Investment } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/finance/expense-history")({
  head: () => ({
    meta: [
      { title: "Expense History — PulseERP" },
      {
        name: "description",
        content: "Full history of business expenses and product purchases with remaining funds.",
      },
      { property: "og:title", content: "Expense History — PulseERP" },
      {
        property: "og:description",
        content: "Full history of business expenses and product purchases with remaining funds.",
      },
    ],
  }),
  component: ExpenseHistoryPage,
});

const CATEGORIES: string[] = [
  "advertising",
  "courier",
  "packaging",
  "office_rent",
  "salary",
  "internet",
  "electricity",
  "miscellaneous",
];

type Row = {
  id: string;
  kind: "expense" | "purchase";
  date: number;
  category: string;
  description: string;
  amount: number;
};

function ExpenseHistoryPage() {
  const { data: expenses, loading: loadingExpenses } = useDbList<Expense>("expenses");
  const { data: purchases, loading: loadingPurchases } = useDbList<Purchase>("purchases");
  const { data: suppliers } = useDbList<Supplier>("suppliers");
  const { data: orders } = useDbList<Order>("orders");
  const { data: investments } = useDbList<Investment>("investments");
  const [category, setCategory] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.company || s.name])),
    [suppliers],
  );

  const all = useMemo<Row[]>(() => {
    const e: Row[] = expenses.map((x) => ({
      id: x.id,
      kind: "expense",
      date: x.date || 0,
      category: x.category,
      description: x.description || "—",
      amount: x.amount || 0,
    }));
    const p: Row[] = purchases
      .filter((x) => x.status !== "cancelled")
      .map((x) => ({
        id: x.id,
        kind: "purchase",
        date: x.purchaseDate || 0,
        category: "product_purchase",
        description: `${x.invoiceNumber || "Purchase"} · ${supplierMap.get(x.supplierId) || "Unknown supplier"}`,
        amount: x.totalCost || 0,
      }));
    return [...e, ...p];
  }, [expenses, purchases, supplierMap]);

  const rows = useMemo(() => {
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() + 86_400_000 - 1 : null;
    return all
      .filter((e) => (category === "all" ? true : e.category === category))
      .filter((e) => (fromTs === null || e.date >= fromTs) && (toTs === null || e.date <= toTs))
      .sort((a, b) => b.date - a.date);
  }, [all, category, from, to]);

  const stats = useMemo(() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const total = rows.reduce((s, e) => s + e.amount, 0);
    const month = rows.filter((e) => e.date >= startMonth).reduce((s, e) => s + e.amount, 0);
    const purchaseTotal = rows
      .filter((e) => e.kind === "purchase")
      .reduce((s, e) => s + e.amount, 0);
    const avg = rows.length ? total / rows.length : 0;
    return { total, month, avg, purchaseTotal, count: rows.length };
  }, [rows]);

  const remaining = useMemo(() => {
    const totalInvestment = investments.reduce((s, i) => s + (i.amount || 0), 0);
    const totalRevenue = orders
      .filter((o) => o.status === "delivered")
      .reduce(
        (s, o) =>
          s + o.items.reduce((x, it) => x + it.sellingPrice * it.quantity, 0) - (o.discount || 0),
        0,
      );
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalPurchases = purchases
      .filter((p) => p.status !== "cancelled")
      .reduce((s, p) => s + (p.totalCost || 0), 0);
    return totalInvestment + totalRevenue - totalExpenses - totalPurchases;
  }, [investments, orders, expenses, purchases]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((e) => map.set(e.category, (map.get(e.category) || 0) + e.amount));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.date)}</span>,
    },
    {
      accessorKey: "kind",
      header: "Type",
      cell: ({ row }) => (
        <Badge
          variant={row.original.kind === "purchase" ? "secondary" : "outline"}
          className="text-[10px] capitalize"
        >
          {row.original.kind === "purchase" ? "Purchase" : "Expense"}
        </Badge>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px] capitalize">
          {row.original.category.replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.description}</span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => (
        <span className="font-medium text-destructive">−{currency(row.original.amount)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button asChild variant="ghost" size="icon" className="size-8" title="Invoice">
            <Link
              to="/invoice/$type/$id"
              params={{
                type: row.original.kind === "purchase" ? "purchase" : "expense",
                id: row.original.id,
              }}
            >
              <FileText className="size-3.5" />
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense History"
        description="Read-only archive of expenses and product purchases, filterable by category and date."
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total spend"
          value={currency(stats.total)}
          icon={<Receipt className="size-4" />}
          tone="warning"
        />
        <StatCard
          label="Product purchases"
          value={currency(stats.purchaseTotal)}
          icon={<ShoppingCart className="size-4" />}
        />
        <StatCard
          label="This month"
          value={currency(stats.month)}
          icon={<CalendarDays className="size-4" />}
        />
        <StatCard
          label="Remaining funds"
          value={currency(remaining)}
          icon={<Wallet className="size-4" />}
          tone={remaining >= 0 ? "success" : "destructive"}
          hint="inflow − outflow"
        />
        <StatCard
          label="Entries"
          value={String(stats.count)}
          icon={<Layers className="size-4" />}
        />
        <StatCard label="Average entry" value={currency(stats.avg)} />
      </div>

      <Card className="p-4 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="product_purchase">Product purchase</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>

      {byCategory.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold mb-1">By category</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Spend distribution for the current filter
          </p>
          <div className="divide-y">
            {byCategory.map(([label, value]) => (
              <div key={label} className="py-2.5 flex items-center justify-between">
                <span className="text-sm capitalize">{label.replace(/_/g, " ")}</span>
                <span className="text-sm font-medium">{currency(value)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={rows}
        loading={loadingExpenses || loadingPurchases}
        searchPlaceholder="Search expenses & purchases…"
        initialPageSize={20}
      />
    </div>
  );
}
