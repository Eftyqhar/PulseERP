import type { Product } from "./types";

const n = (v: unknown) => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(x) ? x : 0;
};

export function importCost(
  p: Partial<
    Pick<Product, "shipmentCost" | "customsDuty" | "importTax" | "clearanceFee" | "importOtherCost">
  >,
) {
  return (
    n(p.shipmentCost) + n(p.customsDuty) + n(p.importTax) + n(p.clearanceFee) + n(p.importOtherCost)
  );
}

export function marketingCost(
  p: Partial<
    Pick<
      Product,
      "marketingCost" | "adsCost" | "influencerCost" | "promotionCost" | "marketplaceFee"
    >
  >,
) {
  return (
    n(p.marketingCost) +
    n(p.adsCost) +
    n(p.influencerCost) +
    n(p.promotionCost) +
    n(p.marketplaceFee)
  );
}

export function totalCost(
  p: Pick<
    Product,
    "buyingPrice" | "courierCost" | "packagingCost" | "transactionFee" | "otherCost"
  > &
    Partial<
      Pick<
        Product,
        | "shipmentCost"
        | "customsDuty"
        | "importTax"
        | "clearanceFee"
        | "importOtherCost"
        | "marketingCost"
        | "adsCost"
        | "influencerCost"
        | "promotionCost"
        | "marketplaceFee"
      >
    >,
) {
  return (
    n(p.buyingPrice) +
    n(p.courierCost) +
    n(p.packagingCost) +
    marketingCost(p) +
    n(p.transactionFee) +
    n(p.otherCost) +
    importCost(p)
  );
}

export function unitProfit(
  p: Pick<
    Product,
    | "sellingPrice"
    | "buyingPrice"
    | "courierCost"
    | "packagingCost"
    | "transactionFee"
    | "otherCost"
  >,
) {
  return n(p.sellingPrice) - totalCost(p);
}

export function profitMargin(p: Parameters<typeof unitProfit>[0]) {
  const sp = n(p.sellingPrice);
  if (!sp) return 0;
  return (unitProfit(p) / sp) * 100;
}

export function inventoryValue(p: Pick<Product, "currentStock" | "buyingPrice">) {
  return (p.currentStock || 0) * (p.buyingPrice || 0);
}

export function potentialRevenue(p: Pick<Product, "currentStock" | "sellingPrice">) {
  return (p.currentStock || 0) * (p.sellingPrice || 0);
}

export function potentialProfit(p: Product) {
  return (p.currentStock || 0) * unitProfit(p);
}

export function stockStatus(p: Pick<Product, "currentStock" | "minimumStock">) {
  if (p.currentStock <= 0) return "out" as const;
  if (p.currentStock <= p.minimumStock) return "low" as const;
  return "healthy" as const;
}
