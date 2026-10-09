import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDbValue } from "@/lib/db";
import type { Order } from "@/lib/types";
import { currency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/label/order/$id")({
  head: () => ({
    meta: [
      { title: "POS Label — PulseERP" },
      {
        name: "description",
        content: "Printable 50x75mm thermal POS shipping label for a customer order.",
      },
    ],
  }),
  component: LabelPage,
});

interface CompanySettings {
  companyName?: string;
  logoUrl?: string;
  phone?: string;
}

function LabelPage() {
  const { id } = Route.useParams();
  const { value: order, loading } = useDbValue<Order>(`orders/${id}`);
  const { value: company } = useDbValue<CompanySettings>("settings/company");
  const barcodeRef = useRef<SVGSVGElement>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const companyName = company?.companyName || "PulseERP";
  const code = order?.orderNumber || id;

  useEffect(() => {
    if (!order || !barcodeRef.current) return;
    try {
      JsBarcode(barcodeRef.current, code, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 44,
        width: 1.6,
      });
    } catch {
      /* ignore */
    }
  }, [order, code]);

  useEffect(() => {
    if (!order || !qrRef.current) return;
    QRCode.toCanvas(qrRef.current, code, { width: 96, margin: 0 }).catch(() => {});
  }, [order, code]);

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading label…</div>;
  if (!order) return <div className="p-8 text-sm text-destructive">Order not found.</div>;

  const total =
    order.items.reduce((s, it) => s + it.sellingPrice * it.quantity, 0) -
    (order.discount || 0) +
    (order.deliveryCharge || 0);
  const cod = order.paymentMethod === "cod" ? total : 0;
  const qty = order.items.reduce((s, it) => s + it.quantity, 0);

  return (
    <div className="pb-16">
      <style>{`
        @page { size: 50mm 75mm; margin: 0; }
        @media print {
          body * { visibility: hidden !important; }
          #pos-label, #pos-label * { visibility: visible !important; }
          #pos-label { position: absolute; inset: 0; margin: 0; width: 50mm; height: 75mm; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/orders">
            <ArrowLeft className="size-4" /> Back
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Print label
        </Button>
      </div>

      <div
        id="pos-label"
        className="mx-auto bg-white text-neutral-900 border rounded shadow-sm"
        style={{
          width: "50mm",
          height: "75mm",
          padding: "2.5mm",
          fontSize: "7.5pt",
          lineHeight: 1.25,
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-1.5 justify-center">
          {company?.logoUrl ? (
            <img src={company.logoUrl} alt={companyName} className="h-5 object-contain" />
          ) : null}
          <div className="font-bold uppercase tracking-wide" style={{ fontSize: "10pt" }}>
            {companyName}
          </div>
        </div>
        <div className="text-center" style={{ fontSize: "7pt" }}>
          ID: {order.orderNumber}
        </div>

        {/* Barcode */}
        <div className="flex justify-center mt-1">
          <svg ref={barcodeRef} style={{ width: "100%", height: "11mm" }} />
        </div>

        {/* QR + meta */}
        <div className="flex gap-2 mt-1 items-start">
          <canvas ref={qrRef} style={{ width: "16mm", height: "16mm" }} />
          <div className="flex-1" style={{ fontSize: "7pt" }}>
            <div>Invoice : {order.orderNumber}</div>
            <div>Pay : {(order.paymentMethod || "").toUpperCase()}</div>
            <div>Items : {qty}</div>
            {order.soldBy ? <div>By : {order.soldBy}</div> : null}
          </div>
        </div>

        {/* Recipient */}
        <div className="mt-1 border border-neutral-400 rounded p-1" style={{ fontSize: "7pt" }}>
          <div className="truncate">Name : {order.customerName || "—"}</div>
          <div>Phone : {order.customerPhone || "—"}</div>
          <div className="line-clamp-2">Address : {order.customerAddress || "—"}</div>
        </div>

        {/* COD */}
        <div
          className="mt-1 flex border border-neutral-800 rounded overflow-hidden font-semibold"
          style={{ fontSize: "9pt" }}
        >
          <div className="flex-1 px-1 py-0.5 border-r border-neutral-800">COD</div>
          <div className="px-1 py-0.5">{cod ? currency(cod) : "PAID"}</div>
        </div>

        <div className="mt-1 flex justify-between text-neutral-600" style={{ fontSize: "6pt" }}>
          <span>P: {new Date(order.orderDate || Date.now()).toLocaleDateString("en-GB")}</span>
          <span>{company?.phone || ""}</span>
        </div>
      </div>
    </div>
  );
}
