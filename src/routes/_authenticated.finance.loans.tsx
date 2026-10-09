import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Loader2, Trash2, Landmark, HandCoins } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDbList, createItem, removeItem, logAudit } from "@/lib/db";
import { auth } from "@/lib/auth-context";
import type { Loan, LoanRepayment } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/finance/loans")({
  head: () => ({
    meta: [
      { title: "Loans — PulseERP" },
      { name: "description", content: "Track loans taken from banks, partners and other sources." },
      { property: "og:title", content: "Loans — PulseERP" },
      {
        property: "og:description",
        content: "Track loans taken from banks, partners and other sources.",
      },
    ],
  }),
  component: LoansPage,
});

const schema = z.object({
  lender: z.string().min(1).max(120),
  principal: z.coerce.number().min(0.01),
  interestRate: z.coerce.number().min(0),
  startDate: z.string().min(1),
  dueDate: z.string().optional().or(z.literal("")),
  notes: z.string().max(400).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function LoansPage() {
  const { data, loading } = useDbList<Loan>("loans");
  const { data: repayments } = useDbList<LoanRepayment>("loan_repayments");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      lender: "",
      principal: 0,
      interestRate: 0,
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      notes: "",
    },
  });

  const paidByLoan = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of repayments) m.set(r.loanId, (m.get(r.loanId) || 0) + Number(r.amount || 0));
    return m;
  }, [repayments]);

  const totals = useMemo(() => {
    const principal = data.reduce((s, l) => s + Number(l.principal || 0), 0);
    const paid = repayments.reduce((s, r) => s + Number(r.amount || 0), 0);
    return { principal, paid, outstanding: Math.max(0, principal - paid) };
  }, [data, repayments]);

  const onSubmit = form.handleSubmit(async (vals) => {
    setSaving(true);
    try {
      const id = await createItem("loans", {
        lender: vals.lender,
        principal: vals.principal,
        interestRate: vals.interestRate || 0,
        startDate: new Date(vals.startDate).getTime(),
        dueDate: vals.dueDate ? new Date(vals.dueDate).getTime() : null,
        notes: vals.notes || "",
        status: "active",
        createdBy: auth.currentUser?.uid || "",
      });
      await logAudit({ action: "loan.create", entity: "loan", entityId: id, newValue: vals });
      toast.success("Loan recorded");
      setOpen(false);
      form.reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  });

  const handleDelete = async (l: Loan) => {
    await removeItem(`loans/${l.id}`);
    await logAudit({
      action: "loan.delete",
      entity: "loan",
      entityId: l.id,
      oldValue: { lender: l.lender },
    });
    toast.success("Deleted");
  };

  const columns: ColumnDef<Loan>[] = [
    {
      accessorKey: "startDate",
      header: "Taken on",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.startDate)}</span>,
    },
    {
      accessorKey: "lender",
      header: "Lender",
      cell: ({ row }) => <span className="font-medium">{row.original.lender}</span>,
    },
    {
      accessorKey: "principal",
      header: "Principal",
      cell: ({ row }) => <span className="font-medium">{currency(row.original.principal)}</span>,
    },
    {
      accessorKey: "interestRate",
      header: "Interest",
      cell: ({ row }) => <span className="text-xs">{Number(row.original.interestRate || 0)}%</span>,
    },
    {
      id: "paid",
      header: "Repaid",
      cell: ({ row }) => (
        <span className="text-xs">{currency(paidByLoan.get(row.original.id) || 0)}</span>
      ),
    },
    {
      id: "outstanding",
      header: "Outstanding",
      cell: ({ row }) => {
        const out = Math.max(
          0,
          Number(row.original.principal || 0) - (paidByLoan.get(row.original.id) || 0),
        );
        return (
          <span className={out === 0 ? "text-xs text-muted-foreground" : "font-medium"}>
            {currency(out)}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const out = Number(row.original.principal || 0) - (paidByLoan.get(row.original.id) || 0);
        return (
          <Badge variant={out <= 0 ? "secondary" : "outline"}>
            {out <= 0 ? "Settled" : "Active"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "dueDate",
      header: "Due",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.dueDate ? dateShort(row.original.dueDate) : "—"}
        </span>
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
        title="Loans"
        description="Money borrowed from banks, partners or other sources."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/finance/loan-repayments">
                <HandCoins className="size-4" /> Repayments
              </Link>
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New loan
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="Total borrowed"
          value={currency(totals.principal)}
          icon={<Landmark className="size-4" />}
        />
        <StatCard label="Repaid" value={currency(totals.paid)} tone="success" />
        <StatCard label="Outstanding" value={currency(totals.outstanding)} tone="warning" />
        <StatCard label="Loans" value={data.length} />
      </div>

      {!loading && data.length === 0 ? (
        <EmptyState
          icon={<Landmark className="size-5" />}
          title="No loans yet"
          description="Record borrowed capital to track outstanding balances and repayments."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New loan
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={[...data].sort((a, b) => b.startDate - a.startDate)}
          loading={loading}
          searchPlaceholder="Search loans…"
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New loan</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Lender / source</Label>
                <Input {...form.register("lender")} placeholder="e.g. City Bank, Family loan" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Principal amount</Label>
                <Input type="number" step="0.01" min="0" {...form.register("principal")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Interest rate (%)</Label>
                <Input type="number" step="0.01" min="0" {...form.register("interestRate")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Taken on</Label>
                <Input type="date" {...form.register("startDate")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Due date (optional)</Label>
                <Input type="date" {...form.register("dueDate")} />
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
