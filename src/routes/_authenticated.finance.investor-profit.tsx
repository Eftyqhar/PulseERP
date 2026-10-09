import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { TrendingUp, PiggyBank, Percent, Users as UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { DataTable } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { Badge } from "@/components/ui/badge";
import { useDbList } from "@/lib/db";
import type { Investor, Investment, Order, Product, Expense } from "@/lib/types";
import { currency } from "@/lib/format";
import { unitProfit } from "@/lib/calc";

export const Route = createFileRoute("/_authenticated/finance/investor-profit")({
  head: () => ({ meta: [{ title: "Investor Profit — PulseERP" }] }),
  component: InvestorProfitPage,
});

interface Row {
  id: string;
  name: string;
  email?: string;
  invested: number;
  sharePct: number;
  profitShare: number;
  roi: number;
}

function InvestorProfitPage() {
  const { data: investors, loading } = useDbList<Investor>("investors");
  const { data: investments } = useDbList<Investment>("investments");
  const { data: orders } = useDbList<Order>("orders");
  const { data: products } = useDbList<Product>("products");
  const { data: expenses } = useDbList<Expense>("expenses");

  const { rows, totals } = useMemo(() => {
    const pm = new Map(products.map((p) => [p.id, p]));
    const delivered = orders.filter((o) => o.status === "delivered");
    const grossProfit = delivered.reduce((s, o) => {
      const p = o.items.reduce((ss, it) => {
        const prod = pm.get(it.productId);
        const pp = prod ? unitProfit(prod) : it.sellingPrice * 0.2;
        return ss + pp * it.quantity;
      }, 0);
      return s + p - (o.discount || 0);
    }, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = grossProfit - totalExpenses;

    const byInv = new Map<string, number>();
    for (const i of investments) {
      if (!i.investorId) continue;
      byInv.set(i.investorId, (byInv.get(i.investorId) || 0) + (i.amount || 0));
    }
    const totalPool = investors.reduce((s, inv) => s + (byInv.get(inv.id) || 0), 0);

    const rows: Row[] = investors.map((inv) => {
      const invested = byInv.get(inv.id) || 0;
      const sharePct = totalPool > 0 ? (invested / totalPool) * 100 : 0;
      const profitShare = (netProfit * sharePct) / 100;
      const roi = invested > 0 ? (profitShare / invested) * 100 : 0;
      return { id: inv.id, name: inv.name, email: inv.email, invested, sharePct, profitShare, roi };
    });

    return { rows, totals: { grossProfit, totalExpenses, netProfit, totalPool } };
  }, [investors, investments, orders, products, expenses]);

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "name",
      header: "Investor",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          {row.original.email && (
            <span className="text-xs text-muted-foreground">{row.original.email}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "invested",
      header: "Invested",
      cell: ({ row }) => <span className="font-medium">{currency(row.original.invested)}</span>,
    },
    {
      accessorKey: "sharePct",
      header: "Share",
      cell: ({ row }) => (
        <Badge variant="secondary" className="font-normal">
          {row.original.sharePct.toFixed(2)}%
        </Badge>
      ),
    },
    {
      accessorKey: "profitShare",
      header: "Profit share",
      cell: ({ row }) => (
        <span
          className={
            row.original.profitShare >= 0
              ? "font-semibold text-emerald-600"
              : "font-semibold text-destructive"
          }
        >
          {currency(row.original.profitShare)}
        </span>
      ),
    },
    {
      accessorKey: "roi",
      header: "ROI",
      cell: ({ row }) => (
        <span className={row.original.roi >= 0 ? "text-emerald-600" : "text-destructive"}>
          {row.original.roi.toFixed(1)}%
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investors profit"
        description="Net profit distribution across investors based on their equity share."
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Capital pool"
          value={currency(totals.totalPool)}
          icon={<PiggyBank className="size-4" />}
        />
        <StatCard
          label="Gross profit"
          value={currency(totals.grossProfit)}
          icon={<TrendingUp className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Net profit"
          value={currency(totals.netProfit)}
          tone={totals.netProfit >= 0 ? "success" : "destructive"}
        />
        <StatCard
          label="Investors"
          value={investors.length}
          icon={<Percent className="size-4" />}
        />
      </div>

      {!loading && investors.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-5" />}
          title="No investors yet"
          description="Add investors and link investment entries to see profit distribution."
        />
      ) : (
        <DataTable
          columns={columns}
          data={[...rows].sort((a, b) => b.profitShare - a.profitShare)}
          loading={loading}
          searchPlaceholder="Search investors…"
        />
      )}
    </div>
  );
}
