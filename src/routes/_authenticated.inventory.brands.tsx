import { createFileRoute } from "@tanstack/react-router";
import { SimpleEntityPage } from "@/components/admin/SimpleEntityPage";

export const Route = createFileRoute("/_authenticated/inventory/brands")({
  head: () => ({ meta: [{ title: "Brands — PulseERP" }] }),
  component: () => (
    <SimpleEntityPage
      title="Brands"
      description="Manage product brands."
      path="brands"
      entityLabel="brand"
    />
  ),
});
