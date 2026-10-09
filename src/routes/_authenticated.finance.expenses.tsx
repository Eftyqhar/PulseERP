import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Loader2, Trash2, Receipt, FileText } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbList, createItem, removeItem, logAudit } from "@/lib/db";
import { auth } from "@/lib/auth-context";
import type { Expense } from "@/lib/types";
import { currency, dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/finance/expenses")({
  head: () => ({ meta: [{ title: "Expenses — PulseERP" }] }),
  component: ExpensesPage,
});

const CATEGORIES: Expense["category"][] = [
  "advertising",
  "courier",
  "packaging",
  "office_rent",
  "salary",
  "internet",
  "electricity",
  "miscellaneous",
];

const schema = z.object({
  category: z.enum(CATEGORIES as [Expense["category"], ...Expense["category"][]]),
  amount: z.coerce.number().min(0.01),
  description: z.string().max(300).optional().or(z.literal("")),
  date: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

function ExpensesPage() {
  const { data, loading } = useDbList<Expense>("expenses");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: "miscellaneous",
      amount: 0,
      description: "",
      date: new Date().toISOString().slice(0, 10),
    },
  });

  const stats = useMemo(() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const total = data.reduce((s, e) => s + e.amount, 0);
    const month = data.filter((e) => e.date >= startMonth).reduce((s, e) => s + e.amount, 0);
    const byCat = new Map<string, number>();
    data.forEach((e) => byCat.set(e.category, (byCat.get(e.category) || 0) + e.amount));
    const topCat = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])[0];
    return { total, month, topCat };
  }, [data]);

  const onSubmit = form.handleSubmit(async (vals) => {
    setSaving(true);
    try {
      const id = await createItem("expenses", {
        ...vals,
        description: vals.description || "",
        date: new Date(vals.date).getTime(),
        createdBy: auth.currentUser?.uid || "",
      });
      await logAudit({ action: "expense.create", entity: "expense", entityId: id, newValue: vals });
      toast.success("Expense recorded");
      setOpen(false);
      form.reset({
        category: "miscellaneous",
        amount: 0,
        description: "",
        date: new Date().toISOString().slice(0, 10),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  });

  const handleDelete = async (e: Expense) => {
    await removeItem(`expenses/${e.id}`);
    await logAudit({
      action: "expense.delete",
      entity: "expense",
      entityId: e.id,
      oldValue: { amount: e.amount },
    });
    toast.success("Deleted");
  };

  const columns: ColumnDef<Expense>[] = [
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.date)}</span>,
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px] capitalize">
          {row.original.category.replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.description || "—"}</span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => <span className="font-medium">{currency(row.original.amount)}</span>,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button asChild variant="ghost" size="icon" className="size-8" title="Invoice">
            <Link to="/invoice/$type/$id" params={{ type: "expense", id: row.original.id }}>
              <FileText className="size-3.5" />
            </Link>
          </Button>
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
        title="Expenses"
        description="Track every business expense by category."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New expense
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total expenses" value={currency(stats.total)} />
        <StatCard label="This month" value={currency(stats.month)} />
        <StatCard
          label="Top category"
          value={stats.topCat?.[0]?.replace(/_/g, " ") || "—"}
          hint={stats.topCat ? currency(stats.topCat[1]) : ""}
        />
      </div>

      {!loading && data.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-5" />}
          title="No expenses recorded"
          description="Record an expense to start tracking outgoing money."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New expense
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={[...data].sort((a, b) => b.date - a.date)}
          loading={loading}
          searchPlaceholder="Search expenses…"
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select
                  value={form.watch("category")}
                  onValueChange={(v) => form.setValue("category", v as Expense["category"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Amount</Label>
                <Input type="number" step="0.01" min="0" {...form.register("amount")} />
                {form.formState.errors.amount && (
                  <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Description</Label>
                <Textarea rows={3} {...form.register("description")} />
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
