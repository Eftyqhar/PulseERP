import { createFileRoute } from "@tanstack/react-router";
import { SimpleEntityPage } from "@/components/admin/SimpleEntityPage";

export const Route = createFileRoute("/_authenticated/sellers")({
  head: () => ({ meta: [{ title: "Sellers — PulseERP" }] }),
  component: SellersPage,
});

function SellersPage() {
  return (
    <SimpleEntityPage
      title="Sellers"
      description="People who sell your products. Reuse them on orders instead of retyping names."
      path="sellers"
      entityLabel="seller"
    />
  );
}
