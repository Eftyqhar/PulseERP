import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Card } from "@/components/ui/card";
import { useDbList } from "@/lib/db";
import type { Product, Order, Expense, Investment } from "@/lib/types";
import { currency } from "@/lib/format";
import { unitProfit } from "@/lib/calc";
import { TrendingUp, DollarSign, Receipt, PiggyBank } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/profit")({
  head: () => ({ meta: [{ title: "Profit — PulseERP" }] }),
  component: ProfitPage,
});

function ProfitPage() {
  const { data: orders } = useDbList<Order>("orders");
  const { data: products } = useDbList<Product>("products");
  const { data: expenses } = useDbList<Expense>("expenses");
  const { data: investments } = useDbList<Investment>("investments");

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

    const totalRev = delivered.reduce((s, o) => s + orderRev(o), 0);
    const grossProfit = delivered.reduce((s, o) => s + orderProfit(o), 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = grossProfit - totalExpenses;
    const totalInvestment = investments.reduce((s, i) => s + i.amount, 0);
    const roi = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;

    const months: { month: string; gross: number; expenses: number; net: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const mo = delivered.filter(
        (o) => (o.deliveredDate || o.orderDate) >= start && (o.deliveredDate || o.orderDate) < end,
      );
      const exp = expenses
        .filter((e) => e.date >= start && e.date < end)
        .reduce((s, e) => s + e.amount, 0);
      const g = mo.reduce((s, o) => s + orderProfit(o), 0);
      months.push({
        month: d.toLocaleDateString("en", { month: "short" }),
        gross: g,
        expenses: exp,
        net: g - exp,
      });
    }
    return { totalRev, grossProfit, totalExpenses, netProfit, totalInvestment, roi, months };
  }, [orders, expenses, investments, pm]);

  return (
    <div className="space-y-6">
      <PageHeader title="Profit" description="Gross profit, expenses and net profit at a glance." />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total revenue"
          value={currency(data.totalRev)}
          icon={<DollarSign className="size-4" />}
        />
        <StatCard
          label="Gross profit"
          value={currency(data.grossProfit)}
          icon={<TrendingUp className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Total expenses"
          value={currency(data.totalExpenses)}
          icon={<Receipt className="size-4" />}
          tone="warning"
        />
        <StatCard
          label="Net profit"
          value={currency(data.netProfit)}
          tone={data.netProfit >= 0 ? "success" : "destructive"}
        />
        <StatCard
          label="Total investment"
          value={currency(data.totalInvestment)}
          icon={<PiggyBank className="size-4" />}
        />
        <StatCard
          label="ROI"
          value={`${data.roi.toFixed(1)}%`}
          tone={data.roi >= 0 ? "success" : "destructive"}
        />
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-1">Monthly net profit</h3>
        <p className="text-xs text-muted-foreground mb-4">Gross profit minus expenses</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.months}>
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
              <Bar dataKey="gross" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expenses" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="net" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
