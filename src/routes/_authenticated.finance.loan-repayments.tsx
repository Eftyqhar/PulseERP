import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Loader2, Trash2, HandCoins, Landmark } from "lucide-react";
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
import type { Loan, LoanRepayment } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/finance/loan-repayments")({
  head: () => ({
    meta: [
      { title: "Loan Repayments — PulseERP" },
      {
        name: "description",
        content: "Record and track repayments made against outstanding loans.",
      },
      { property: "og:title", content: "Loan Repayments — PulseERP" },
      {
        property: "og:description",
        content: "Record and track repayments made against outstanding loans.",
      },
    ],
  }),
  component: LoanRepaymentsPage,
});

const schema = z.object({
  loanId: z.string().min(1, "Select a loan"),
  amount: z.coerce.number().min(0.01),
  date: z.string().min(1),
  method: z.string().max(60).optional().or(z.literal("")),
  notes: z.string().max(400).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function LoanRepaymentsPage() {
  const { data, loading } = useDbList<LoanRepayment>("loan_repayments");
  const { data: loans } = useDbList<Loan>("loans");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      loanId: "",
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      method: "",
      notes: "",
    },
  });

  const loanMap = useMemo(() => new Map(loans.map((l) => [l.id, l])), [loans]);

  const rows = useMemo(
    () =>
      [...data]
        .filter((r) => filter === "all" || r.loanId === filter)
        .sort((a, b) => b.date - a.date),
    [data, filter],
  );

  const totals = useMemo(() => {
    const borrowed = loans.reduce((s, l) => s + Number(l.principal || 0), 0);
    const paid = data.reduce((s, r) => s + Number(r.amount || 0), 0);
    return { borrowed, paid, outstanding: Math.max(0, borrowed - paid) };
  }, [loans, data]);

  const onSubmit = form.handleSubmit(async (vals) => {
    setSaving(true);
    try {
      const id = await createItem("loan_repayments", {
        loanId: vals.loanId,
        amount: vals.amount,
        date: new Date(vals.date).getTime(),
        method: vals.method || "",
        notes: vals.notes || "",
        createdBy: auth.currentUser?.uid || "",
      });
      await logAudit({
        action: "loan_repayment.create",
        entity: "loan_repayment",
        entityId: id,
        newValue: vals,
      });
      toast.success("Repayment recorded");
      setOpen(false);
      form.reset({
        loanId: "",
        amount: 0,
        date: new Date().toISOString().slice(0, 10),
        method: "",
        notes: "",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  });

  const handleDelete = async (r: LoanRepayment) => {
    await removeItem(`loan_repayments/${r.id}`);
    await logAudit({ action: "loan_repayment.delete", entity: "loan_repayment", entityId: r.id });
    toast.success("Deleted");
  };

  const columns: ColumnDef<LoanRepayment>[] = [
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.date)}</span>,
    },
    {
      id: "loan",
      header: "Loan",
      cell: ({ row }) => (
        <span className="font-medium">
          {loanMap.get(row.original.loanId)?.lender || "Deleted loan"}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => <span className="font-medium">{currency(row.original.amount)}</span>,
    },
    {
      accessorKey: "method",
      header: "Method",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.method || "—"}</span>
      ),
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
        title="Loan Repayments"
        description="Payments made back to lenders."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/finance/loans">
                <Landmark className="size-4" /> Loans
              </Link>
            </Button>
            <Button onClick={() => setOpen(true)} disabled={loans.length === 0}>
              <Plus className="size-4" /> New repayment
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="Total borrowed"
          value={currency(totals.borrowed)}
          icon={<Landmark className="size-4" />}
        />
        <StatCard label="Total repaid" value={currency(totals.paid)} tone="success" />
        <StatCard label="Outstanding" value={currency(totals.outstanding)} tone="warning" />
        <StatCard label="Payments" value={data.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs text-muted-foreground">Loan</Label>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-56 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All loans</SelectItem>
            {loans.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.lender}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="size-5" />}
          title="No repayments yet"
          description={
            loans.length
              ? "Record a payment against one of your loans."
              : "Add a loan first, then record repayments here."
          }
          action={
            loans.length ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" /> New repayment
              </Button>
            ) : (
              <Button asChild>
                <Link to="/finance/loans">
                  <Landmark className="size-4" /> Go to Loans
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          searchPlaceholder="Search repayments…"
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New repayment</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Loan</Label>
                <Select
                  value={form.watch("loanId")}
                  onValueChange={(v) => form.setValue("loanId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select loan" />
                  </SelectTrigger>
                  <SelectContent>
                    {loans.map((l) => {
                      const paid = data
                        .filter((r) => r.loanId === l.id)
                        .reduce((s, r) => s + Number(r.amount || 0), 0);
                      const out = Math.max(0, Number(l.principal || 0) - paid);
                      return (
                        <SelectItem key={l.id} value={l.id}>
                          {l.lender} · {currency(out)} due
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {form.formState.errors.loanId && (
                  <p className="text-xs text-destructive">{form.formState.errors.loanId.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Amount</Label>
                <Input type="number" step="0.01" min="0" {...form.register("amount")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Method (optional)</Label>
                <Input {...form.register("method")} placeholder="Bank transfer, bKash, cash…" />
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
