import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDbList } from "@/lib/db";
import type { Product, Order } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";
import { unitProfit, inventoryValue } from "@/lib/calc";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — PulseERP" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data: products } = useDbList<Product>("products");
  const { data: orders } = useDbList<Order>("orders");

  const insights = useMemo(() => {
    const delivered = orders.filter((o) => o.status === "delivered");

    // Per-product sales/revenue
    const stats = new Map<string, { qty: number; revenue: number; profit: number }>();
    delivered.forEach((o) => {
      o.items.forEach((it) => {
        const cur = stats.get(it.productId) || { qty: 0, revenue: 0, profit: 0 };
        cur.qty += it.quantity;
        cur.revenue += it.sellingPrice * it.quantity;
        const p = products.find((x) => x.id === it.productId);
        if (p) cur.profit += unitProfit(p) * it.quantity;
        stats.set(it.productId, cur);
      });
    });

    const rows = products.map((p) => {
      const s = stats.get(p.id) || { qty: 0, revenue: 0, profit: 0 };
      return { product: p, ...s };
    });

    const topByRevenue = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    const topByProfit = [...rows].sort((a, b) => b.profit - a.profit).slice(0, 8);

    // ABC analysis based on revenue
    const sortedRev = [...rows].sort((a, b) => b.revenue - a.revenue);
    const totalRev = sortedRev.reduce((s, r) => s + r.revenue, 0) || 1;
    let cum = 0;
    const abc = sortedRev.map((r) => {
      cum += r.revenue;
      const share = cum / totalRev;
      const cls = share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C";
      return { ...r, cls };
    });

    // Dead stock: no sales in last 60 days but stock > 0
    const cutoff = Date.now() - 60 * 24 * 3600 * 1000;
    const recentSold = new Set<string>();
    delivered
      .filter((o) => (o.deliveredDate || o.orderDate) >= cutoff)
      .forEach((o) => o.items.forEach((it) => recentSold.add(it.productId)));
    const dead = products.filter((p) => p.currentStock > 0 && !recentSold.has(p.id));
    const deadValue = dead.reduce((s, p) => s + inventoryValue(p), 0);

    // Low stock
    const lowStock = products.filter((p) => p.currentStock > 0 && p.currentStock <= p.minimumStock);
    const outStock = products.filter((p) => p.currentStock <= 0);

    return { rows, topByRevenue, topByProfit, abc, dead, deadValue, lowStock, outStock };
  }, [products, orders]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Deep operational insights on sales, stock and profitability."
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active SKUs" value={products.length} />
        <StatCard label="Low stock" value={insights.lowStock.length} tone="warning" />
        <StatCard label="Out of stock" value={insights.outStock.length} tone="destructive" />
        <StatCard
          label="Dead stock value"
          value={currency(insights.deadValue)}
          hint={`${insights.dead.length} items`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold mb-1">Top products by revenue</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Best-selling SKUs from delivered orders
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={insights.topByRevenue.map((r) => ({
                  name: r.product.name.slice(0, 16),
                  revenue: r.revenue,
                }))}
                layout="vertical"
                margin={{ left: 20 }}
              >
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
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="revenue" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-1">Top products by profit</h3>
          <p className="text-xs text-muted-foreground mb-4">Highest profit contributors</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={insights.topByProfit.map((r) => ({
                  name: r.product.name.slice(0, 16),
                  profit: r.profit,
                }))}
                layout="vertical"
                margin={{ left: 20 }}
              >
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
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="profit" radius={[0, 6, 6, 0]}>
                  {insights.topByProfit.map((r, i) => (
                    <Cell key={i} fill={r.profit >= 0 ? "var(--chart-2)" : "var(--destructive)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-1">ABC analysis</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Class A = top 80% revenue, B = next 15%, C = last 5%
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 font-medium">Product</th>
                <th className="text-right py-2 font-medium">Units sold</th>
                <th className="text-right py-2 font-medium">Revenue</th>
                <th className="text-right py-2 font-medium">Profit</th>
                <th className="text-right py-2 font-medium">Class</th>
              </tr>
            </thead>
            <tbody>
              {insights.abc.slice(0, 15).map((r) => (
                <tr key={r.product.id} className="border-b last:border-0">
                  <td className="py-2">{r.product.name}</td>
                  <td className="text-right">{r.qty}</td>
                  <td className="text-right">{currency(r.revenue)}</td>
                  <td className="text-right">{currency(r.profit)}</td>
                  <td className="text-right">
                    <Badge
                      variant={r.cls === "A" ? "default" : r.cls === "B" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {r.cls}
                    </Badge>
                  </td>
                </tr>
              ))}
              {insights.abc.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No sales data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-1">Dead stock ({insights.dead.length})</h3>
        <p className="text-xs text-muted-foreground mb-4">No sales in the last 60 days</p>
        {insights.dead.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No dead stock — everything is moving 🚀
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 font-medium">Product</th>
                  <th className="text-left py-2 font-medium">SKU</th>
                  <th className="text-right py-2 font-medium">Stock</th>
                  <th className="text-right py-2 font-medium">Tied-up value</th>
                  <th className="text-right py-2 font-medium">Last update</th>
                </tr>
              </thead>
              <tbody>
                {insights.dead.slice(0, 20).map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2">{p.name}</td>
                    <td className="text-muted-foreground text-xs">{p.sku}</td>
                    <td className="text-right">{p.currentStock}</td>
                    <td className="text-right">{currency(inventoryValue(p))}</td>
                    <td className="text-right text-xs text-muted-foreground">
                      {dateShort(p.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
