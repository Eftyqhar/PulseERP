import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useDbList, createItem, updateItem, removeItem, logAudit } from "@/lib/db";
import { dateShort } from "@/lib/format";

const schema = z.object({
  name: z.string().min(1, "Required").max(80),
  description: z.string().max(400).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

interface NamedItem {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export function SimpleEntityPage({
  title,
  description,
  path,
  entityLabel,
}: {
  title: string;
  description: string;
  path: string;
  entityLabel: string;
}) {
  const { data, loading } = useDbList<NamedItem>(path);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NamedItem | null>(null);
  const [confirm, setConfirm] = useState<NamedItem | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", description: "" });
    setOpen(true);
  };
  const openEdit = (item: NamedItem) => {
    setEditing(item);
    form.reset({ name: item.name, description: item.description || "" });
    setOpen(true);
  };

  const onSubmit = form.handleSubmit(async (vals) => {
    setSaving(true);
    try {
      if (editing) {
        await updateItem(`${path}/${editing.id}`, { ...vals, description: vals.description || "" });
        await logAudit({
          action: `${entityLabel}.update`,
          entity: entityLabel,
          entityId: editing.id,
          oldValue: { name: editing.name },
          newValue: vals,
        });
        toast.success(`${title.replace(/s$/, "")} updated`);
      } else {
        const id = await createItem(path, { ...vals, description: vals.description || "" });
        await logAudit({
          action: `${entityLabel}.create`,
          entity: entityLabel,
          entityId: id,
          newValue: vals,
        });
        toast.success(`${title.replace(/s$/, "")} added`);
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  });

  const handleDelete = async () => {
    if (!confirm) return;
    try {
      await removeItem(`${path}/${confirm.id}`);
      await logAudit({
        action: `${entityLabel}.delete`,
        entity: entityLabel,
        entityId: confirm.id,
        oldValue: { name: confirm.name },
      });
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setConfirm(null);
    }
  };

  const columns: ColumnDef<NamedItem>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{row.original.description || "—"}</span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => <span className="text-xs">{dateShort(row.original.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive"
            onClick={() => setConfirm(row.original)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Add
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchPlaceholder={`Search ${title.toLowerCase()}…`}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${title.replace(/s$/, "")}` : `New ${title.replace(/s$/, "")}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input {...form.register("name")} autoFocus />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea rows={3} {...form.register("description")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete?"
        description={confirm ? `${confirm.name} will be removed.` : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
