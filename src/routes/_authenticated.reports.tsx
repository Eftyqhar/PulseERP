import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDbList } from "@/lib/db";
import type { Product, Order, Purchase, Expense, Investment, Supplier } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";
import { unitProfit, profitMargin, inventoryValue } from "@/lib/calc";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — PulseERP" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data: products } = useDbList<Product>("products");
  const { data: orders } = useDbList<Order>("orders");
  const { data: purchases } = useDbList<Purchase>("purchases");
  const { data: expenses } = useDbList<Expense>("expenses");
  const { data: investments } = useDbList<Investment>("investments");
  const { data: suppliers } = useDbList<Supplier>("suppliers");

  const reports: Array<{
    key: string;
    title: string;
    description: string;
    count: number;
    rows: () => Record<string, unknown>[];
  }> = [
    {
      key: "products",
      title: "Products & inventory",
      description: "Full product catalogue with costs, prices and stock levels.",
      count: products.length,
      rows: () =>
        products.map((p) => ({
          Name: p.name,
          SKU: p.sku,
          Buying: p.buyingPrice,
          Selling: p.sellingPrice,
          "Profit/unit": unitProfit(p),
          "Margin %": profitMargin(p).toFixed(1),
          Stock: p.currentStock,
          "Inventory value": inventoryValue(p),
          Status: p.status,
        })),
    },
    {
      key: "orders",
      title: "Customer orders",
      description: "All sales orders with status, customer and totals.",
      count: orders.length,
      rows: () =>
        orders.map((o) => ({
          Order: o.orderNumber,
          Customer: o.customerName,
          Phone: o.customerPhone || "",
          Items: o.items.reduce((s, it) => s + it.quantity, 0),
          Total:
            o.items.reduce((s, it) => s + it.sellingPrice * it.quantity, 0) - (o.discount || 0),
          Status: o.status,
          Payment: o.paymentMethod,
          Date: dateShort(o.orderDate),
        })),
    },
    {
      key: "purchases",
      title: "Purchase orders",
      description: "All inbound purchase orders from suppliers.",
      count: purchases.length,
      rows: () =>
        purchases.map((p) => ({
          Invoice: p.invoiceNumber,
          Supplier: suppliers.find((s) => s.id === p.supplierId)?.company || "—",
          Items: p.items.reduce((s, it) => s + it.quantity, 0),
          Total: p.totalCost,
          Status: p.status,
          Date: dateShort(p.purchaseDate),
        })),
    },
    {
      key: "expenses",
      title: "Expenses",
      description: "All recorded business expenses by category.",
      count: expenses.length,
      rows: () =>
        expenses.map((e) => ({
          Date: dateShort(e.date),
          Category: e.category,
          Description: e.description || "",
          Amount: e.amount,
        })),
    },
    {
      key: "investments",
      title: "Investments",
      description: "Capital and follow-on funding events.",
      count: investments.length,
      rows: () =>
        investments.map((i) => ({
          Date: dateShort(i.date),
          Source: i.source,
          Amount: i.amount,
          Notes: i.notes || "",
        })),
    },
    {
      key: "suppliers",
      title: "Suppliers",
      description: "All suppliers and contact info.",
      count: suppliers.length,
      rows: () =>
        suppliers.map((s) => ({
          Company: s.company,
          Contact: s.name,
          Phone: s.phone || "",
          Email: s.email || "",
          Address: s.address || "",
        })),
    },
  ];

  const exportExcel = (key: string, title: string, rows: Record<string, unknown>[]) => {
    if (!rows.length) return toast.info("Nothing to export.");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 30));
    XLSX.writeFile(wb, `${key}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel exported");
  };

  const exportPdf = (key: string, title: string, rows: Record<string, unknown>[]) => {
    if (!rows.length) return toast.info("Nothing to export.");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(title, 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, 22);
    const headers = Object.keys(rows[0]);
    autoTable(doc, {
      startY: 28,
      head: [headers],
      body: rows.map((r) => headers.map((h) => String(r[h] ?? ""))),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [55, 65, 81] },
    });
    doc.save(`${key}-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF exported");
  };

  const [busy, setBusy] = useState<string>("");

  // Quick KPIs
  const summary = {
    revenue: orders
      .filter((o) => o.status === "delivered")
      .reduce(
        (s, o) =>
          s + o.items.reduce((x, it) => x + it.sellingPrice * it.quantity, 0) - (o.discount || 0),
        0,
      ),
    expenses: expenses.reduce((s, e) => s + e.amount, 0),
    inventory: products.reduce((s, p) => s + inventoryValue(p), 0),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Export financial and operational data to Excel or PDF."
      />

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Summary snapshot</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Revenue</div>
            <div className="text-xl font-semibold mt-1">{currency(summary.revenue)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Expenses</div>
            <div className="text-xl font-semibold mt-1">{currency(summary.expenses)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              Inventory value
            </div>
            <div className="text-xl font-semibold mt-1">{currency(summary.inventory)}</div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {reports.map((r) => (
          <Card key={r.key} className="p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{r.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-muted">{r.count}</span>
            </div>
            <div className="flex gap-2 mt-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBusy(r.key + "x");
                  exportExcel(r.key, r.title, r.rows());
                  setBusy("");
                }}
                disabled={busy === r.key + "x"}
              >
                <FileSpreadsheet className="size-4" /> Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBusy(r.key + "p");
                  exportPdf(r.key, r.title, r.rows());
                  setBusy("");
                }}
                disabled={busy === r.key + "p"}
              >
                <FileText className="size-4" /> PDF
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto" disabled>
                <Download className="size-4" /> {r.count}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
