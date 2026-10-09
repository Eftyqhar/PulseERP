import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { PiggyBank, TrendingUp, CalendarDays, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatCard } from "@/components/admin/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import type { Investment, Investor } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/finance/funding-history")({
  head: () => ({
    meta: [
      { title: "Deposit & Funding History — PulseERP" },
      {
        name: "description",
        content: "Complete history of deposits and capital funding with investor and date filters.",
      },
      { property: "og:title", content: "Deposit & Funding History — PulseERP" },
      {
        property: "og:description",
        content: "Complete history of deposits and capital funding with investor and date filters.",
      },
    ],
  }),
  component: FundingHistoryPage,
});

function FundingHistoryPage() {
  const { data, loading } = useDbList<Investment>("investments");
  const { data: investors } = useDbList<Investor>("investors");
  const [investorId, setInvestorId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const investorMap = useMemo(() => new Map(investors.map((i) => [i.id, i.name])), [investors]);

  const rows = useMemo(() => {
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() + 86_400_000 - 1 : null;
    return [...data]
      .filter((i) => (investorId === "all" ? true : (i.investorId || "") === investorId))
      .filter(
        (i) =>
          (fromTs === null || (i.date || 0) >= fromTs) && (toTs === null || (i.date || 0) <= toTs),
      )
      .sort((a, b) => (b.date || 0) - (a.date || 0));
  }, [data, investorId, from, to]);

  const stats = useMemo(() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const total = rows.reduce((s, i) => s + (i.amount || 0), 0);
    const month = rows
      .filter((i) => (i.date || 0) >= startMonth)
      .reduce((s, i) => s + (i.amount || 0), 0);
    const contributors = new Set(rows.map((i) => i.investorId || i.source)).size;
    return { total, month, contributors, count: rows.length };
  }, [rows]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((i) => {
      const d = new Date(i.date || 0);
      const key = d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
      map.set(key, (map.get(key) || 0) + (i.amount || 0));
    });
    return Array.from(map.entries()).slice(0, 6);
  }, [rows]);

  const columns: ColumnDef<Investment>[] = [
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.date)}</span>,
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => <span className="font-medium">{row.original.source || "—"}</span>,
    },
    {
      accessorKey: "investorId",
      header: "Investor",
      cell: ({ row }) =>
        row.original.investorId ? (
          <Badge variant="outline" className="text-[10px]">
            {investorMap.get(row.original.investorId) || "Unknown"}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      accessorKey: "notes",
      header: "Notes",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.notes || "—"}</span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => (
        <span className="font-medium text-[color:var(--success)]">
          +{currency(row.original.amount)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deposit & Funding History"
        description="Every capital deposit recorded, filterable by investor and date."
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total funding"
          value={currency(stats.total)}
          icon={<PiggyBank className="size-4" />}
          tone="success"
        />
        <StatCard
          label="This month"
          value={currency(stats.month)}
          icon={<CalendarDays className="size-4" />}
        />
        <StatCard
          label="Deposits"
          value={String(stats.count)}
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Contributors"
          value={String(stats.contributors)}
          icon={<Users className="size-4" />}
        />
      </div>

      <Card className="p-4 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Investor</Label>
          <Select value={investorId} onValueChange={setInvestorId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All investors</SelectItem>
              {investors.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
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

      {byMonth.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold mb-1">Recent months</h3>
          <p className="text-xs text-muted-foreground mb-4">Funding received per month</p>
          <div className="divide-y">
            {byMonth.map(([label, value]) => (
              <div key={label} className="py-2.5 flex items-center justify-between">
                <span className="text-sm">{label}</span>
                <span className="text-sm font-medium">{currency(value)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        searchPlaceholder="Search funding…"
        initialPageSize={20}
      />
    </div>
  );
}
