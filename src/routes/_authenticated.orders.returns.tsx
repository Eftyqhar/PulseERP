import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/badge";
import { useDbList } from "@/lib/db";
import type { Order } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/orders/returns")({
  head: () => ({ meta: [{ title: "Returns — PulseERP" }] }),
  component: ReturnsPage,
});

function ReturnsPage() {
  const { data, loading } = useDbList<Order>("orders");
  const returns = useMemo(() => data.filter((o) => o.status === "returned"), [data]);

  const columns: ColumnDef<Order>[] = [
    {
      accessorKey: "orderNumber",
      header: "Order #",
      cell: ({ row }) => <span className="font-medium">{row.original.orderNumber}</span>,
    },
    { accessorKey: "customerName", header: "Customer" },
    {
      accessorKey: "orderDate",
      header: "Order date",
      cell: ({ row }) => dateShort(row.original.orderDate),
    },
    {
      id: "amount",
      header: "Amount",
      cell: ({ row }) => {
        const o = row.original;
        const t =
          o.items.reduce((s, it) => s + it.sellingPrice * it.quantity, 0) -
          o.discount +
          o.deliveryCharge;
        return currency(t);
      },
    },
    {
      id: "status",
      header: "Status",
      cell: () => (
        <Badge variant="destructive" className="text-[10px]">
          Returned
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Returns" description="Orders that were returned by the customer." />
      <DataTable
        columns={columns}
        data={returns}
        loading={loading}
        searchPlaceholder="Search returns…"
      />
    </div>
  );
}
