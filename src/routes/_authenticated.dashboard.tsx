import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DollarSign,
  Wallet,
  Boxes,
  Package,
  ShoppingCart,
  AlertTriangle,
  PackageX,
  Clock,
  CheckCircle2,
  TrendingUp,
  PiggyBank,
} from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDbList } from "@/lib/db";
import type { Product, Order, Expense, Investment, Category, Purchase } from "@/lib/types";
import { currency, dateShort, number } from "@/lib/format";
import { inventoryValue, unitProfit, stockStatus } from "@/lib/calc";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — PulseERP" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: products } = useDbList<Product>("products");
  const { data: orders } = useDbList<Order>("orders");
  const { data: expenses } = useDbList<Expense>("expenses");
  const { data: purchases } = useDbList<Purchase>("purchases");
  const { data: investments } = useDbList<Investment>("investments");
  const { data: categories } = useDbList<Category>("categories");
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const stats = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const deliveredOrders = orders.filter((o) => o.status === "delivered");

    const productMap = new Map(products.map((p) => [p.id, p]));
    const orderProfit = (o: Order) =>
      o.items.reduce((sum, it) => {
        const p = productMap.get(it.productId);
        const profitPerUnit = p ? unitProfit(p) : it.sellingPrice * 0.2;
        return sum + profitPerUnit * it.quantity;
      }, 0) - (o.discount || 0);

    const orderRevenue = (o: Order) =>
      o.items.reduce((s, it) => s + it.sellingPrice * it.quantity, 0) - (o.discount || 0);

    const todayOrders = deliveredOrders.filter(
      (o) => (o.deliveredDate || o.orderDate) >= startToday,
    );
    const monthOrders = deliveredOrders.filter(
      (o) => (o.deliveredDate || o.orderDate) >= startMonth,
    );

    const todayRevenue = todayOrders.reduce((s, o) => s + orderRevenue(o), 0);
    const monthRevenue = monthOrders.reduce((s, o) => s + orderRevenue(o), 0);
    const todayProfit = todayOrders.reduce((s, o) => s + orderProfit(o), 0);
    const monthProfit = monthOrders.reduce((s, o) => s + orderProfit(o), 0);

    const totalInvestment = investments.reduce((s, i) => s + (i.amount || 0), 0);
    const invValue = products.reduce((s, p) => s + inventoryValue(p), 0);

    const lowStock = products.filter((p) => stockStatus(p) === "low").length;
    const outStock = products.filter((p) => stockStatus(p) === "out").length;

    const pending = orders.filter(
      (o) => o.status === "pending" || o.status === "processing",
    ).length;
    const delivered = deliveredOrders.length;

    return {
      todayRevenue,
      todayProfit,
      monthRevenue,
      monthProfit,
      totalInvestment,
      invValue,
      totalProducts: products.length,
      totalOrders: orders.length,
      pending,
      delivered,
      lowStock,
      outStock,
      productMap,
      orderProfit,
      orderRevenue,
    };
  }, [products, orders, expenses, investments]);

  // Daily sales (last 14 days)
  const dailySales = useMemo(() => {
    const days: { date: string; revenue: number; profit: number; orders: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const end = start + 86400000;
      const dayOrders = orders.filter(
        (o) =>
          o.status === "delivered" &&
          (o.deliveredDate || o.orderDate) >= start &&
          (o.deliveredDate || o.orderDate) < end,
      );
      days.push({
        date: d.toLocaleDateString("en", { day: "2-digit", month: "short" }),
        revenue: dayOrders.reduce((s, o) => s + stats.orderRevenue(o), 0),
        profit: dayOrders.reduce((s, o) => s + stats.orderProfit(o), 0),
        orders: dayOrders.length,
      });
    }
    return days;
  }, [orders, stats]);

  // Monthly revenue vs expenses (last 6 months) — expenses include purchases
  const monthly = useMemo(() => {
    const ts = (v: unknown) => {
      if (typeof v === "number") return v;
      const t = new Date(String(v ?? "")).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const now = new Date();
    const months: { month: string; revenue: number; expenses: number; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
      const monthOrders = orders.filter((o) => {
        const t = ts(o.deliveredDate || o.orderDate);
        return o.status === "delivered" && t >= start && t < end;
      });
      const monthExp =
        expenses
          .filter((e) => {
            const t = ts(e.date);
            return t >= start && t < end;
          })
          .reduce((s, e) => s + (Number(e.amount) || 0), 0) +
        purchases
          .filter((p) => {
            const t = ts(p.purchaseDate);
            return p.status !== "cancelled" && t >= start && t < end;
          })
          .reduce((s, p) => s + (Number(p.totalCost) || 0), 0);
      const rev = monthOrders.reduce((s, o) => s + stats.orderRevenue(o), 0);
      const prof = monthOrders.reduce((s, o) => s + stats.orderProfit(o), 0) - monthExp;
      months.push({
        month: new Date(start).toLocaleDateString("en", { month: "short" }),
        revenue: rev,
        expenses: monthExp,
        profit: prof,
      });
    }
    return months;
  }, [orders, expenses, purchases, stats]);

  // Best selling products
  const bestSelling = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    orders
      .filter((o) => o.status === "delivered")
      .forEach((o) => {
        o.items.forEach((it) => {
          const existing = map.get(it.productId);
          if (existing) {
            existing.qty += it.quantity;
            existing.revenue += it.quantity * it.sellingPrice;
          } else {
            map.set(it.productId, {
              name: it.productName || stats.productMap.get(it.productId)?.name || "—",
              qty: it.quantity,
              revenue: it.quantity * it.sellingPrice,
            });
          }
        });
      });
    return Array.from(map.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [orders, stats]);

  // Category distribution
  const categoryDist = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => {
      const key = p.categoryId || "uncategorized";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([id, count]) => ({
      name: id === "uncategorized" ? "Uncategorized" : categoryMap.get(id) || "Unknown",
      value: count,
    }));
  }, [products, categoryMap]);

  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => (b.orderDate || 0) - (a.orderDate || 0)).slice(0, 6),
    [orders],
  );

  const restockSuggestions = useMemo(
    () =>
      products
        .filter((p) => stockStatus(p) !== "healthy")
        .sort((a, b) => a.currentStock - b.currentStock)
        .slice(0, 5),
    [products],
  );

  const chartColors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Today's pulse across revenue, profit and inventory."
      />

      {/* Top stat cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Today's Revenue"
          value={currency(stats.todayRevenue)}
          icon={<DollarSign className="size-4" />}
          hint="from delivered orders"
        />
        <StatCard
          label="Today's Profit"
          value={currency(stats.todayProfit)}
          icon={<TrendingUp className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Monthly Revenue"
          value={currency(stats.monthRevenue)}
          icon={<DollarSign className="size-4" />}
        />
        <StatCard
          label="Monthly Profit"
          value={currency(stats.monthProfit)}
          icon={<TrendingUp className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Total Investment"
          value={currency(stats.totalInvestment)}
          icon={<PiggyBank className="size-4" />}
        />
        <StatCard
          label="Inventory Value"
          value={currency(stats.invValue)}
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Total Products"
          value={number(stats.totalProducts)}
          icon={<Package className="size-4" />}
        />
        <StatCard
          label="Total Orders"
          value={number(stats.totalOrders)}
          icon={<ShoppingCart className="size-4" />}
        />
        <StatCard
          label="Pending Orders"
          value={number(stats.pending)}
          icon={<Clock className="size-4" />}
          tone="warning"
        />
        <StatCard
          label="Delivered Orders"
          value={number(stats.delivered)}
          icon={<CheckCircle2 className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Low Stock"
          value={number(stats.lowStock)}
          icon={<AlertTriangle className="size-4" />}
          tone="warning"
        />
        <StatCard
          label="Out of Stock"
          value={number(stats.outStock)}
          icon={<PackageX className="size-4" />}
          tone="destructive"
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Daily sales — last 14 days</h3>
              <p className="text-xs text-muted-foreground">Delivered orders</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySales}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--chart-1)"
                  fill="url(#rev)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="var(--chart-2)"
                  fill="url(#prof)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-1">Category distribution</h3>
          <p className="text-xs text-muted-foreground mb-4">Products per category</p>
          <div className="h-64">
            {categoryDist.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">
                No products yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryDist}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {categoryDist.map((_, i) => (
                      <Cell key={i} fill={chartColors[i % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold mb-1">Revenue vs expenses</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Last 6 months · expenses include product purchases
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="revenue" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-1">Profit trend</h3>
          <p className="text-xs text-muted-foreground mb-4">Last 6 months, net of expenses</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="var(--chart-2)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recent orders</h3>
            <Badge variant="secondary" className="text-[10px]">
              Live
            </Badge>
          </div>
          {recentOrders.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No orders yet</div>
          ) : (
            <div className="divide-y">
              {recentOrders.map((o) => (
                <div key={o.id} className="py-3 flex items-center gap-3">
                  <div className="size-9 rounded-md bg-muted grid place-items-center text-xs font-medium">
                    #{o.orderNumber?.slice(-4) || o.id.slice(-4)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{o.customerName}</div>
                    <div className="text-xs text-muted-foreground">{dateShort(o.orderDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{currency(stats.orderRevenue(o))}</div>
                    <StatusBadge status={o.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-1">Restock suggestions</h3>
          <p className="text-xs text-muted-foreground mb-4">Below minimum stock</p>
          {restockSuggestions.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">All stock healthy</div>
          ) : (
            <div className="space-y-3">
              {restockSuggestions.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">SKU: {p.sku}</div>
                  </div>
                  <Badge variant={p.currentStock <= 0 ? "destructive" : "secondary"}>
                    {p.currentStock} left
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-1">Best selling products</h3>
        <p className="text-xs text-muted-foreground mb-4">By units sold from delivered orders</p>
        {bestSelling.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No sales data yet</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bestSelling} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="qty" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: Order["status"] }) {
  const map: Record<
    Order["status"],
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    pending: { label: "Pending", variant: "secondary" },
    processing: { label: "Processing", variant: "secondary" },
    shipped: { label: "Shipped", variant: "outline" },
    delivered: { label: "Delivered", variant: "default" },
    returned: { label: "Returned", variant: "destructive" },
    cancelled: { label: "Cancelled", variant: "destructive" },
  };
  const m = map[status];
  return (
    <Badge variant={m.variant} className="text-[10px]">
      {m.label}
    </Badge>
  );
}
