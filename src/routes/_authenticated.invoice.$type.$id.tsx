import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDbValue, useDbList } from "@/lib/db";
import type { Order, PreOrder, Purchase, Expense, Product, Supplier } from "@/lib/types";
import { currency, dateShort, dateTime } from "@/lib/format";

type InvoiceType = "order" | "preorder" | "purchase" | "expense";

const PATH_MAP: Record<InvoiceType, string> = {
  order: "orders",
  preorder: "preOrders",
  purchase: "purchases",
  expense: "expenses",
};

export const Route = createFileRoute("/_authenticated/invoice/$type/$id")({
  head: () => ({ meta: [{ title: "Invoice — PulseERP" }] }),
  component: InvoicePage,
});

interface CompanySettings {
  companyName?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
}

function InvoicePage() {
  const { type, id } = Route.useParams();
  const t = type as InvoiceType;
  const path = PATH_MAP[t];
  const { value: record, loading } = useDbValue<Order | PreOrder | Purchase | Expense>(
    path ? `${path}/${id}` : null,
  );
  const { value: company } = useDbValue<CompanySettings>("settings/company");
  const { data: products } = useDbList<Product>("products");
  const { data: suppliers } = useDbList<Supplier>("suppliers");

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  const companyName = company?.companyName || "PulseERP";
  const logoUrl = company?.logoUrl || "";

  if (!path) return <ErrorState msg="Unknown invoice type." />;
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading invoice…</div>;
  if (!record) return <ErrorState msg="Invoice not found." />;

  const view = buildView(t, record, { productMap, supplierMap });

  return (
    <div className="pb-16">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print, #invoice-print * { visibility: visible !important; }
          #invoice-print { position: absolute; inset: 0; width: 100%; padding: 24px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to={view.backTo}>
            <ArrowLeft className="size-4" /> Back
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / Save as PDF
        </Button>
      </div>

      <div
        id="invoice-print"
        className="mx-auto max-w-3xl bg-white text-neutral-900 border rounded-lg shadow-sm p-8 print:shadow-none print:border-0"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-6 border-b pb-6">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="size-14 rounded object-contain" />
            ) : (
              <div className="size-14 rounded bg-neutral-900 text-white flex items-center justify-center text-xl font-semibold">
                {companyName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-lg font-semibold">{companyName}</div>
              {company?.address && (
                <div className="text-xs text-neutral-600">{company.address}</div>
              )}
              <div className="text-xs text-neutral-600">
                {[company?.phone, company?.email].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-neutral-500">{view.docLabel}</div>
            <div className="text-xl font-semibold">{view.number}</div>
            <div className="text-xs text-neutral-600 mt-1">Issued {dateShort(view.date)}</div>
            {view.status && (
              <div className="mt-2 inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-neutral-300 text-neutral-700 capitalize">
                {view.status}
              </div>
            )}
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-6 py-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
              {view.partyLabel}
            </div>
            <div className="text-sm font-medium">{view.partyName || "—"}</div>
            {view.partyLine2 && <div className="text-xs text-neutral-600">{view.partyLine2}</div>}
            {view.partyLine3 && <div className="text-xs text-neutral-600">{view.partyLine3}</div>}
          </div>
          <div className="text-right space-y-1">
            {view.meta.map((m) => (
              <div key={m.label} className="text-xs">
                <span className="text-neutral-500">{m.label}: </span>
                <span className="text-neutral-800">{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Items */}
        {view.items.length > 0 && (
          <table className="w-full text-sm border-t border-b">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="py-2 pr-2 w-8">#</th>
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 px-2 text-right w-16">Qty</th>
                <th className="py-2 px-2 text-right w-28">Unit price</th>
                <th className="py-2 pl-2 text-right w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((it, i) => (
                <tr key={i} className="border-t">
                  <td className="py-2 pr-2 text-neutral-500">{i + 1}</td>
                  <td className="py-2 pr-2">{it.name}</td>
                  <td className="py-2 px-2 text-right">{it.qty}</td>
                  <td className="py-2 px-2 text-right">{currency(it.price)}</td>
                  <td className="py-2 pl-2 text-right">{currency(it.qty * it.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals */}
        <div className="flex justify-end pt-4">
          <div className="w-full sm:w-72 space-y-1 text-sm">
            {view.totals.map((row) => (
              <div
                key={row.label}
                className={
                  row.emphasis
                    ? "flex justify-between border-t pt-2 mt-1 font-semibold text-base"
                    : "flex justify-between text-neutral-700"
                }
              >
                <span>{row.label}</span>
                <span>{currency(row.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {view.notes && (
          <div className="mt-8 border-t pt-4">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Notes</div>
            <div className="text-xs text-neutral-700 whitespace-pre-wrap">{view.notes}</div>
          </div>
        )}

        <div className="mt-10 pt-4 border-t text-[11px] text-neutral-500 flex justify-between">
          <span>Generated {dateTime(Date.now())}</span>
          <span>Thank you for your business.</span>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return <div className="p-8 text-sm text-destructive">{msg}</div>;
}

interface ViewModel {
  docLabel: string;
  number: string;
  date: number;
  status?: string;
  backTo: string;
  partyLabel: string;
  partyName: string;
  partyLine2?: string;
  partyLine3?: string;
  meta: Array<{ label: string; value: string }>;
  items: Array<{ name: string; qty: number; price: number }>;
  totals: Array<{ label: string; value: number; emphasis?: boolean }>;
  notes?: string;
}

function buildView(
  type: InvoiceType,
  rec: Order | PreOrder | Purchase | Expense,
  ctx: { productMap: Map<string, Product>; supplierMap: Map<string, Supplier> },
): ViewModel {
  if (type === "order") {
    const o = rec as Order;
    const items = o.items.map((it) => ({
      name: it.productName || ctx.productMap.get(it.productId)?.name || "Item",
      qty: it.quantity,
      price: it.sellingPrice,
    }));
    const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
    const total = Math.max(0, subtotal - (o.discount || 0) + (o.deliveryCharge || 0));
    return {
      docLabel: "Invoice",
      number: o.orderNumber,
      date: o.orderDate,
      status: o.status,
      backTo: "/orders",
      partyLabel: "Billed to",
      partyName: o.customerName,
      partyLine2: o.customerPhone || undefined,
      partyLine3: o.customerAddress || undefined,
      meta: [
        { label: "Payment", value: o.paymentMethod.toUpperCase() },
        ...(o.soldBy ? [{ label: "Sold by", value: o.soldBy }] : []),
        ...(o.deliveredDate ? [{ label: "Delivered", value: dateShort(o.deliveredDate) }] : []),
      ],
      items,
      totals: [
        { label: "Subtotal", value: subtotal },
        ...(o.discount ? [{ label: "Discount", value: -o.discount }] : []),
        ...(o.deliveryCharge ? [{ label: "Delivery", value: o.deliveryCharge }] : []),
        { label: "Total", value: total, emphasis: true },
      ],
      notes: o.notes,
    };
  }

  if (type === "preorder") {
    const p = rec as PreOrder;
    const items = p.items.map((it) => ({
      name: it.productName || ctx.productMap.get(it.productId)?.name || "Item",
      qty: it.quantity,
      price: it.sellingPrice,
    }));
    const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
    const due = Math.max(0, subtotal - (p.advancePayment || 0));
    return {
      docLabel: "Pre-order",
      number: p.preOrderNumber,
      date: p.orderDate,
      status: p.status,
      backTo: "/orders/pre-orders",
      partyLabel: "Reserved for",
      partyName: p.customerName,
      partyLine2: p.customerPhone || undefined,
      partyLine3: p.customerAddress || undefined,
      meta: [
        { label: "Payment", value: p.paymentMethod.toUpperCase() },
        ...(p.expectedDate ? [{ label: "Expected", value: dateShort(p.expectedDate) }] : []),
      ],
      items,
      totals: [
        { label: "Subtotal", value: subtotal },
        { label: "Advance paid", value: -(p.advancePayment || 0) },
        { label: "Balance due", value: due, emphasis: true },
      ],
      notes: p.notes,
    };
  }

  if (type === "purchase") {
    const p = rec as Purchase;
    const sup = ctx.supplierMap.get(p.supplierId);
    const items = p.items.map((it) => ({
      name: ctx.productMap.get(it.productId)?.name || "Item",
      qty: it.quantity,
      price: it.buyingPrice,
    }));
    const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
    return {
      docLabel: "Purchase order",
      number: p.invoiceNumber,
      date: p.purchaseDate,
      status: p.status,
      backTo: "/purchases/orders",
      partyLabel: "Supplier",
      partyName: sup?.company || "—",
      partyLine2: sup?.name || undefined,
      partyLine3: [sup?.phone, sup?.email].filter(Boolean).join(" · ") || undefined,
      meta: [],
      items,
      totals: [
        { label: "Subtotal", value: subtotal },
        ...(p.shippingCost ? [{ label: "Shipping", value: p.shippingCost }] : []),
        ...(p.otherCost ? [{ label: "Other", value: p.otherCost }] : []),
        { label: "Total", value: p.totalCost, emphasis: true },
      ],
      notes: p.notes,
    };
  }

  // expense
  const e = rec as Expense;
  return {
    docLabel: "Expense voucher",
    number: `EXP-${(e.id || "").slice(-6).toUpperCase()}`,
    date: e.date,
    backTo: "/finance/expenses",
    partyLabel: "Category",
    partyName: e.category.replace(/_/g, " "),
    meta: [{ label: "Recorded", value: dateShort(e.createdAt) }],
    items: [
      {
        name: e.description || e.category.replace(/_/g, " "),
        qty: 1,
        price: e.amount,
      },
    ],
    totals: [{ label: "Total", value: e.amount, emphasis: true }],
    notes: e.description,
  };
}
