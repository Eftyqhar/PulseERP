import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDbList } from "@/lib/db";
import type { Supplier, Purchase } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchases/history")({
  head: () => ({ meta: [{ title: "Purchase History — PulseERP" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { data, loading } = useDbList<Purchase>("purchases");
  const { data: suppliers } = useDbList<Supplier>("suppliers");
  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s.company])), [suppliers]);

  const sorted = useMemo(
    () => [...data].sort((a, b) => (b.purchaseDate || 0) - (a.purchaseDate || 0)),
    [data],
  );

  const columns: ColumnDef<Purchase>[] = [
    {
      accessorKey: "purchaseDate",
      header: "Date",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.purchaseDate)}</span>,
    },
    {
      accessorKey: "invoiceNumber",
      header: "Invoice",
      cell: ({ row }) => <span className="font-medium">{row.original.invoiceNumber}</span>,
    },
    {
      accessorKey: "supplierId",
      header: "Supplier",
      cell: ({ row }) => supplierMap.get(row.original.supplierId) || "—",
    },
    { id: "items", header: "Items", cell: ({ row }) => row.original.items?.length || 0 },
    {
      accessorKey: "totalCost",
      header: "Total",
      cell: ({ row }) => <span className="font-medium">{currency(row.original.totalCost)}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        return (
          <Badge
            variant={s === "received" ? "default" : s === "cancelled" ? "destructive" : "secondary"}
            className="text-[10px] capitalize"
          >
            {s}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button asChild variant="ghost" size="icon" className="size-8" title="Invoice">
            <Link to="/invoice/$type/$id" params={{ type: "purchase", id: row.original.id }}>
              <FileText className="size-3.5" />
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Purchase history"
        description="Audit-ready record of all purchase orders."
      />
      <DataTable
        columns={columns}
        data={sorted}
        loading={loading}
        searchPlaceholder="Search history…"
        initialPageSize={20}
      />
    </div>
  );
}
