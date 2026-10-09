import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  delta?: number;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
}

export function StatCard({ label, value, delta, hint, icon, tone = "default" }: StatCardProps) {
  const toneClass: Record<NonNullable<StatCardProps["tone"]>, string> = {
    default: "text-foreground",
    success: "text-[color:var(--success)]",
    warning: "text-[color:var(--warning)]",
    destructive: "text-destructive",
    info: "text-[color:var(--info)]",
  };

  return (
    <Card className="p-5 flex flex-col gap-2 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className={cn("text-2xl font-semibold tracking-tight", toneClass[tone])}>{value}</div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-h-[1rem]">
        {typeof delta === "number" && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              delta >= 0 ? "text-[color:var(--success)]" : "text-destructive",
            )}
          >
            {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </Card>
  );
}
