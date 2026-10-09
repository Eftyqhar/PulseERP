import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Loader2, Trash2, PiggyBank } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbList, createItem, removeItem, logAudit } from "@/lib/db";
import { auth } from "@/lib/auth-context";
import type { Investment, Investor } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/finance/investment")({
  head: () => ({ meta: [{ title: "Investment — PulseERP" }] }),
  component: InvestmentPage,
});

const schema = z.object({
  source: z.string().min(1).max(120),
  amount: z.coerce.number().min(0.01),
  date: z.string().min(1),
  investorId: z.string().optional(),
  notes: z.string().max(400).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function InvestmentPage() {
  const { data, loading } = useDbList<Investment>("investments");
  const { data: investors } = useDbList<Investor>("investors");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      source: "",
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      investorId: "",
      notes: "",
    },
  });

  const investorMap = useMemo(() => new Map(investors.map((i) => [i.id, i])), [investors]);
  const total = useMemo(() => data.reduce((s, i) => s + i.amount, 0), [data]);

  const onSubmit = form.handleSubmit(async (vals) => {
    setSaving(true);
    try {
      const id = await createItem("investments", {
        source: vals.source,
        amount: vals.amount,
        notes: vals.notes || "",
        investorId: vals.investorId || "",
        date: new Date(vals.date).getTime(),
        createdBy: auth.currentUser?.uid || "",
      });
      await logAudit({
        action: "investment.create",
        entity: "investment",
        entityId: id,
        newValue: vals,
      });
      toast.success("Investment recorded");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  });

  const handleDelete = async (i: Investment) => {
    await removeItem(`investments/${i.id}`);
    await logAudit({ action: "investment.delete", entity: "investment", entityId: i.id });
    toast.success("Deleted");
  };

  const columns: ColumnDef<Investment>[] = [
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.date)}</span>,
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => <span className="font-medium">{row.original.source}</span>,
    },
    {
      id: "investor",
      header: "Investor",
      cell: ({ row }) => {
        const name = row.original.investorId
          ? investorMap.get(row.original.investorId)?.name
          : null;
        return <span className="text-xs text-muted-foreground">{name || "—"}</span>;
      },
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => <span className="font-medium">{currency(row.original.amount)}</span>,
    },
    {
      accessorKey: "notes",
      header: "Notes",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.notes || "—"}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive"
            onClick={() => handleDelete(row.original)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investment"
        description="Capital injected into the business."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New investment
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total investment"
          value={currency(total)}
          icon={<PiggyBank className="size-4" />}
        />
        <StatCard label="Entries" value={data.length} />
        <StatCard
          label="Latest"
          value={data.length ? currency([...data].sort((a, b) => b.date - a.date)[0].amount) : "—"}
        />
      </div>

      {!loading && data.length === 0 ? (
        <EmptyState
          icon={<PiggyBank className="size-5" />}
          title="No investments yet"
          description="Record initial capital and follow-on investments."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New investment
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={[...data].sort((a, b) => b.date - a.date)}
          loading={loading}
          searchPlaceholder="Search investments…"
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New investment</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Source</Label>
                <Input {...form.register("source")} placeholder="e.g. Owner equity" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Amount</Label>
                <Input type="number" step="0.01" min="0" {...form.register("amount")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Investor (optional)</Label>
                <Select
                  value={form.watch("investorId") || "__none__"}
                  onValueChange={(v) => form.setValue("investorId", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {investors.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Notes</Label>
                <Textarea rows={3} {...form.register("notes")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
