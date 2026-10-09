import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbList } from "@/lib/db";
import type { Product } from "@/lib/types";
import { currency, percent } from "@/lib/format";
import { totalCost, unitProfit, profitMargin } from "@/lib/calc";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/finance/simulator")({
  head: () => ({ meta: [{ title: "Profit Simulator — PulseERP" }] }),
  component: SimulatorPage,
});

interface Inputs {
  buyingPrice: number;
  sellingPrice: number;
  courierCost: number;
  packagingCost: number;
  marketingCost: number;
  transactionFee: number;
  otherCost: number;
}

const emptyInputs: Inputs = {
  buyingPrice: 0,
  sellingPrice: 0,
  courierCost: 0,
  packagingCost: 0,
  marketingCost: 0,
  transactionFee: 0,
  otherCost: 0,
};

function SimulatorPage() {
  const { data: products } = useDbList<Product>("products");
  const [productId, setProductId] = useState<string>("");
  const [inputs, setInputs] = useState<Inputs>(emptyInputs);

  const current = useMemo(() => {
    const p = products.find((x) => x.id === productId);
    if (!p) return null;
    return {
      buyingPrice: p.buyingPrice,
      sellingPrice: p.sellingPrice,
      courierCost: p.courierCost,
      packagingCost: p.packagingCost,
      marketingCost: p.marketingCost,
      transactionFee: p.transactionFee,
      otherCost: p.otherCost,
    } satisfies Inputs;
  }, [products, productId]);

  const calc = (i: Inputs) => {
    const tc = totalCost(i);
    const profit = unitProfit(i);
    const margin = profitMargin(i);
    return { tc, profit, margin };
  };

  const currentCalc = current ? calc(current) : { tc: 0, profit: 0, margin: 0 };
  const newCalc = calc(inputs);
  const diff = newCalc.profit - currentCalc.profit;

  const loadFromProduct = (id: string) => {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) {
      setInputs({
        buyingPrice: p.buyingPrice,
        sellingPrice: p.sellingPrice,
        courierCost: p.courierCost,
        packagingCost: p.packagingCost,
        marketingCost: p.marketingCost,
        transactionFee: p.transactionFee,
        otherCost: p.otherCost,
      });
    }
  };

  const fields: Array<{ key: keyof Inputs; label: string }> = [
    { key: "buyingPrice", label: "Buying cost" },
    { key: "sellingPrice", label: "Selling price" },
    { key: "courierCost", label: "Courier cost" },
    { key: "packagingCost", label: "Packaging cost" },
    { key: "marketingCost", label: "Marketing cost" },
    { key: "transactionFee", label: "Transaction fee" },
    { key: "otherCost", label: "Other cost" },
  ];

  const volumes = [10, 50, 100, 500];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profit simulator"
        description="Tweak prices and costs live to see profit, margin and bulk projections."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold mb-4">Inputs</h3>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Load from existing product (optional)</Label>
              <Select value={productId} onValueChange={loadFromProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a product…" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={inputs[f.key]}
                    onChange={(e) => setInputs({ ...inputs, [f.key]: Number(e.target.value) })}
                  />
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-muted/30">
          <h3 className="font-semibold mb-4">Live comparison</h3>
          <div className="space-y-4 text-sm">
            <CompareRow
              label="Total cost"
              curr={currency(currentCalc.tc)}
              next={currency(newCalc.tc)}
            />
            <CompareRow
              label="Profit / unit"
              curr={currency(currentCalc.profit)}
              next={currency(newCalc.profit)}
              positive={newCalc.profit >= currentCalc.profit}
            />
            <CompareRow
              label="Margin"
              curr={percent(currentCalc.margin)}
              next={percent(newCalc.margin)}
              positive={newCalc.margin >= currentCalc.margin}
            />
            <div className="pt-3 border-t flex items-center justify-between">
              <span className="text-muted-foreground">Profit difference</span>
              <span
                className={cn(
                  "font-semibold inline-flex items-center gap-1",
                  diff >= 0 ? "text-[color:var(--success)]" : "text-destructive",
                )}
              >
                {diff >= 0 ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                {currency(Math.abs(diff))}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-4">Bulk profit projection</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {volumes.map((v) => (
            <Card key={v} className="p-4 bg-muted/30">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                {v} units
              </div>
              <div
                className={cn(
                  "text-xl font-semibold mt-1",
                  newCalc.profit * v >= 0 ? "text-[color:var(--success)]" : "text-destructive",
                )}
              >
                {currency(newCalc.profit * v)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Revenue {currency(inputs.sellingPrice * v)}
              </div>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
}

function CompareRow({
  label,
  curr,
  next,
  positive,
}: {
  label: string;
  curr: string;
  next: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">{curr}</span>
        <span className="text-muted-foreground">→</span>
        <span
          className={cn(
            "font-semibold text-base",
            positive === undefined
              ? ""
              : positive
                ? "text-[color:var(--success)]"
                : "text-destructive",
          )}
        >
          {next}
        </span>
      </div>
    </div>
  );
}
