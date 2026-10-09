import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useDbList } from "@/lib/db";
import type {
  AuditLog,
  Product,
  Category,
  Brand,
  Supplier,
  Order,
  PreOrder,
  Investor,
} from "@/lib/types";
import { dateTime } from "@/lib/format";

interface NamedItem {
  id: string;
  name: string;
}

export const Route = createFileRoute("/_authenticated/audit-logs")({
  head: () => ({ meta: [{ title: "Audit Logs — PulseERP" }] }),
  component: AuditLogsPage,
});

function AuditLogsPage() {
  const { data, loading } = useDbList<AuditLog>("audit_logs");
  const { data: products } = useDbList<Product>("products");
  const { data: categories } = useDbList<Category>("categories");
  const { data: brands } = useDbList<Brand>("brands");
  const { data: suppliers } = useDbList<Supplier>("suppliers");
  const { data: orders } = useDbList<Order>("orders");
  const { data: preOrders } = useDbList<PreOrder>("pre_orders");
  const { data: investors } = useDbList<Investor>("investors");
  const { data: sellers } = useDbList<NamedItem>("sellers");
  const [filterUser, setFilterUser] = useState("");

  const nameFor = useMemo(() => {
    const maps: Record<string, Map<string, string>> = {
      product: new Map(products.map((p) => [p.id, p.name])),
      category: new Map(categories.map((c) => [c.id, c.name])),
      brand: new Map(brands.map((b) => [b.id, b.name])),
      supplier: new Map(suppliers.map((s) => [s.id, s.company || s.name])),
      order: new Map(orders.map((o) => [o.id, o.orderNumber || o.customerName])),
      preorder: new Map(preOrders.map((o) => [o.id, o.preOrderNumber || o.customerName])),
      investor: new Map(investors.map((i) => [i.id, i.name])),
      seller: new Map(sellers.map((s) => [s.id, s.name])),
    };
    // aliases so both "preOrder" and "preorder" resolve
    maps.preOrder = maps.preorder;

    const fromPayload = (v: unknown): string => {
      if (!v || typeof v !== "object") return "";
      const o = v as Record<string, unknown>;
      const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
      return (
        s("name") ||
        s("company") ||
        s("orderNumber") ||
        s("preOrderNumber") ||
        s("invoice") ||
        s("invoiceNumber") ||
        ""
      );
    };

    return (log: AuditLog): string => {
      const { entity, entityId, newValue, oldValue } = log;
      if (!entityId) return "";
      const key = entity ? entity.toLowerCase() : "";
      const hit = key ? maps[entity!]?.get(entityId) || maps[key]?.get(entityId) : undefined;
      if (hit) return hit;
      const payload = fromPayload(newValue) || fromPayload(oldValue);
      return payload || "(deleted)";
    };
  }, [products, categories, brands, suppliers, orders, preOrders, investors, sellers]);

  const rows = useMemo(() => {
    return [...data]
      .filter(
        (l) => !filterUser || (l.userEmail || "").toLowerCase().includes(filterUser.toLowerCase()),
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [data, filterUser]);

  const columns: ColumnDef<AuditLog>[] = [
    {
      accessorKey: "timestamp",
      header: "When",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{dateTime(row.original.timestamp)}</span>
      ),
    },
    {
      accessorKey: "userEmail",
      header: "User",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm">{row.original.userEmail || "—"}</span>
          <Badge variant="outline" className="text-[10px] w-fit mt-0.5">
            {row.original.role}
          </Badge>
        </div>
      ),
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-[10px]">
          {row.original.action}
        </Badge>
      ),
    },
    {
      accessorKey: "entity",
      header: "Entity",
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.entity || "—"}
          {row.original.entityId && (
            <span className="text-muted-foreground/60"> · {nameFor(row.original)}</span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Audit logs" description="Every create, update and delete is logged." />
      <div className="max-w-xs">
        <Input
          placeholder="Filter by user email…"
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
        />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        searchPlaceholder="Search actions…"
      />
    </div>
  );
}
