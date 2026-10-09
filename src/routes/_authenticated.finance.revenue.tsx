import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Card } from "@/components/ui/card";
import { useDbList } from "@/lib/db";
import type { Product, Order } from "@/lib/types";
import { currency } from "@/lib/format";
import { unitProfit } from "@/lib/calc";
import { DollarSign, TrendingUp, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/revenue")({
  head: () => ({ meta: [{ title: "Revenue — PulseERP" }] }),
  component: RevenuePage,
});

function RevenuePage() {
  const { data: orders } = useDbList<Order>("orders");
  const { data: products } = useDbList<Product>("products");
  const pm = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const data = useMemo(() => {
    const delivered = orders.filter((o) => o.status === "delivered");
    const orderRev = (o: Order) =>
      o.items.reduce((s, it) => s + it.sellingPrice * it.quantity, 0) - (o.discount || 0);
    const orderProfit = (o: Order) =>
      o.items.reduce((s, it) => {
        const p = pm.get(it.productId);
        const pp = p ? unitProfit(p) : it.sellingPrice * 0.2;
        return s + pp * it.quantity;
      }, 0) - (o.discount || 0);

    const months: { month: string; revenue: number; profit: number; orders: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const monthOrders = delivered.filter(
        (o) => (o.deliveredDate || o.orderDate) >= start && (o.deliveredDate || o.orderDate) < end,
      );
      months.push({
        month: d.toLocaleDateString("en", { month: "short" }),
        revenue: monthOrders.reduce((s, o) => s + orderRev(o), 0),
        profit: monthOrders.reduce((s, o) => s + orderProfit(o), 0),
        orders: monthOrders.length,
      });
    }
    const totalRev = delivered.reduce((s, o) => s + orderRev(o), 0);
    const totalProfit = delivered.reduce((s, o) => s + orderProfit(o), 0);
    return { months, totalRev, totalProfit, count: delivered.length };
  }, [orders, pm]);

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue" description="Total earnings from delivered orders." />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total revenue"
          value={currency(data.totalRev)}
          icon={<DollarSign className="size-4" />}
        />
        <StatCard
          label="Total profit"
          value={currency(data.totalProfit)}
          icon={<TrendingUp className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Delivered orders"
          value={data.count}
          icon={<ShoppingBag className="size-4" />}
        />
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-1">Last 12 months</h3>
        <p className="text-xs text-muted-foreground mb-4">Revenue and profit by month</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.months}>
              <defs>
                <linearGradient id="r1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="r2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--chart-1)"
                fill="url(#r1)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="var(--chart-2)"
                fill="url(#r2)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
