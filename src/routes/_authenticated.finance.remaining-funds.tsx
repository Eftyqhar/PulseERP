import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Wallet, PiggyBank, DollarSign, Receipt, ShoppingCart, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Card } from "@/components/ui/card";
import { useDbList } from "@/lib/db";
import type { Order, Expense, Investment, Purchase } from "@/lib/types";
import { currency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/finance/remaining-funds")({
  head: () => ({ meta: [{ title: "Remaining Funds — PulseERP" }] }),
  component: RemainingFundsPage,
});

function RemainingFundsPage() {
  const { data: orders } = useDbList<Order>("orders");
  const { data: expenses } = useDbList<Expense>("expenses");
  const { data: investments } = useDbList<Investment>("investments");
  const { data: purchases } = useDbList<Purchase>("purchases");

  const stats = useMemo(() => {
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

    const inflow = totalInvestment + totalRevenue;
    const outflow = totalExpenses + totalPurchases;
    const remaining = inflow - outflow;

    return {
      totalInvestment,
      totalRevenue,
      totalExpenses,
      totalPurchases,
      inflow,
      outflow,
      remaining,
    };
  }, [orders, expenses, investments, purchases]);

  const rows: { label: string; value: number; type: "in" | "out" }[] = [
    { label: "Total investment", value: stats.totalInvestment, type: "in" },
    { label: "Revenue collected (delivered orders)", value: stats.totalRevenue, type: "in" },
    { label: "Purchases spent", value: stats.totalPurchases, type: "out" },
    { label: "Operating expenses", value: stats.totalExpenses, type: "out" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remaining Funds"
        description="How much cash is left after inflows and outflows."
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Remaining funds"
          value={currency(stats.remaining)}
          icon={<Wallet className="size-4" />}
          tone={stats.remaining >= 0 ? "success" : "destructive"}
          hint="inflow − outflow"
        />
        <StatCard
          label="Total inflow"
          value={currency(stats.inflow)}
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Total outflow"
          value={currency(stats.outflow)}
          icon={<Receipt className="size-4" />}
          tone="warning"
        />
        <StatCard
          label="Total investment"
          value={currency(stats.totalInvestment)}
          icon={<PiggyBank className="size-4" />}
        />
        <StatCard
          label="Revenue collected"
          value={currency(stats.totalRevenue)}
          icon={<DollarSign className="size-4" />}
        />
        <StatCard
          label="Purchases spent"
          value={currency(stats.totalPurchases)}
          icon={<ShoppingCart className="size-4" />}
        />
        <StatCard
          label="Operating expenses"
          value={currency(stats.totalExpenses)}
          icon={<Receipt className="size-4" />}
        />
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-1">Breakdown</h3>
        <p className="text-xs text-muted-foreground mb-4">Cash movement summary</p>
        <div className="divide-y">
          {rows.map((r) => (
            <div key={r.label} className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={
                    r.type === "in"
                      ? "size-2 rounded-full bg-[color:var(--success)]"
                      : "size-2 rounded-full bg-destructive"
                  }
                />
                <span className="text-sm">{r.label}</span>
              </div>
              <span
                className={
                  r.type === "in"
                    ? "text-sm font-medium text-[color:var(--success)]"
                    : "text-sm font-medium text-destructive"
                }
              >
                {r.type === "in" ? "+" : "−"}
                {currency(r.value)}
              </span>
            </div>
          ))}
          <div className="py-3 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Remaining</span>
            <span
              className={
                stats.remaining >= 0
                  ? "text-base font-semibold text-[color:var(--success)]"
                  : "text-base font-semibold text-destructive"
              }
            >
              {currency(stats.remaining)}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
