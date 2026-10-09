import { createFileRoute } from "@tanstack/react-router";
import { SimpleEntityPage } from "@/components/admin/SimpleEntityPage";

export const Route = createFileRoute("/_authenticated/inventory/categories")({
  head: () => ({ meta: [{ title: "Categories — PulseERP" }] }),
  component: () => (
    <SimpleEntityPage
      title="Categories"
      description="Organize products into categories."
      path="categories"
      entityLabel="category"
    />
  ),
});
