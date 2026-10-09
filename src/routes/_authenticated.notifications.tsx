import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, AlertTriangle, PackageX, Boxes } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/admin/EmptyState";
import { useDbList } from "@/lib/db";
import type { Product } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — PulseERP" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { data: products } = useDbList<Product>("products");

  const items = useMemo(() => {
    const list: {
      id: string;
      type: "out" | "low";
      title: string;
      message: string;
      href: string;
    }[] = [];
    products.forEach((p) => {
      if (p.currentStock <= 0) {
        list.push({
          id: `out-${p.id}`,
          type: "out",
          title: `${p.name} is out of stock`,
          message: `SKU ${p.sku} — reorder immediately`,
          href: `/inventory/products`,
        });
      } else if (p.currentStock <= p.minimumStock) {
        list.push({
          id: `low-${p.id}`,
          type: "low",
          title: `${p.name} is running low`,
          message: `Only ${p.currentStock} left (min ${p.minimumStock})`,
          href: `/inventory/products`,
        });
      }
    });
    return list;
  }, [products]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Live stock alerts derived from your inventory."
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-5" />}
          title="All clear"
          description="No active alerts. We'll notify you when stock runs low or runs out."
        />
      ) : (
        <Card className="divide-y">
          {items.map((n) => {
            const Icon = n.type === "out" ? PackageX : AlertTriangle;
            const tone =
              n.type === "out"
                ? "text-destructive bg-destructive/10"
                : "text-[color:var(--warning)] bg-[color:var(--warning)]/10";
            return (
              <Link
                key={n.id}
                to={n.href}
                className="flex items-start gap-3 p-4 hover:bg-muted/40 transition-colors"
              >
                <div className={`size-9 rounded-md grid place-items-center shrink-0 ${tone}`}>
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{n.message}</div>
                </div>
                <Boxes className="size-4 text-muted-foreground mt-1.5" />
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
