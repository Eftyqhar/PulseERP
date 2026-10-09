import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Database, Download, Upload, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import {
  updateItem,
  useDbValue,
  logAudit,
  exportSqliteDatabase,
  importSqliteDatabase,
  resetSqliteDatabase,
} from "@/lib/db";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — PulseERP" }] }),
  component: SettingsPage,
});

interface CompanySettings {
  companyName: string;
  logoUrl: string;
  currency: string;
  lowStockThreshold: number;
  emailAlerts: boolean;
}

const DEFAULTS: CompanySettings = {
  companyName: "PulseERP",
  logoUrl: "",
  currency: "BDT",
  lowStockThreshold: 5,
  emailAlerts: true,
};

function SettingsPage() {
  const { profile, isSuperAdmin, updateUserDisplayName } = useAuth();
  const { value, loading } = useDbValue<CompanySettings>("settings/company");

  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [company, setCompany] = useState<CompanySettings>(DEFAULTS);
  const [savingCompany, setSavingCompany] = useState(false);

  const [dbProcessing, setDbProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) setCompany({ ...DEFAULTS, ...value });
  }, [value]);

  useEffect(() => {
    if (profile?.displayName) setDisplayName(profile.displayName);
  }, [profile]);

  const saveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    try {
      await updateUserDisplayName(displayName);
      await logAudit({ action: "user.update_profile", entity: "user", entityId: profile.uid });
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingProfile(false);
    }
  };

  const saveCompany = async () => {
    if (!isSuperAdmin) return toast.error("Only super admins can change company settings");
    setSavingCompany(true);
    try {
      await updateItem("settings/company", company);
      await logAudit({ action: "settings.update", entity: "settings", newValue: company });
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingCompany(false);
    }
  };

  const handleExportSqlite = async () => {
    setDbProcessing(true);
    try {
      const bytes = await exportSqliteDatabase();
      const blob = new Blob([bytes], { type: "application/x-sqlite3" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pulse-erp-${new Date().toISOString().split("T")[0]}.sqlite`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("SQLite database downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setDbProcessing(false);
    }
  };

  const handleImportSqlite = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isSuperAdmin) {
      toast.error("Only super admins can restore database files");
      return;
    }

    setDbProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      await importSqliteDatabase(new Uint8Array(buffer));
      toast.success("SQLite database restored successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import SQLite database");
    } finally {
      setDbProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleResetSqlite = async () => {
    if (!isSuperAdmin) {
      toast.error("Only super admins can reset database");
      return;
    }

    if (
      !confirm(
        "Are you sure you want to reset the database to demo defaults? All current changes will be overwritten.",
      )
    ) {
      return;
    }

    setDbProcessing(true);
    try {
      await resetSqliteDatabase();
      toast.success("Database reset to defaults");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset");
    } finally {
      setDbProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your profile, company preferences, and SQLite database."
      />

      <Card className="p-6 space-y-4">
        <div>
          <h3 className="font-semibold">My profile</h3>
          <p className="text-xs text-muted-foreground">
            Public name shown in audit logs and the header.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
          <div className="space-y-1.5">
            <Label className="text-xs">Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input value={profile?.email || ""} disabled />
          </div>
        </div>
        <div>
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile && <Loader2 className="size-4 animate-spin" />}Save profile
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Company settings</h3>
          <p className="text-xs text-muted-foreground">
            Affects exports, reports and notifications.
            {!isSuperAdmin && (
              <span className="ml-1 text-[color:var(--warning)]">
                (read-only — super admin required)
              </span>
            )}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
          <div className="space-y-1.5">
            <Label className="text-xs">Company name</Label>
            <Input
              value={company.companyName}
              onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
              disabled={!isSuperAdmin || loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Logo URL</Label>
            <Input
              type="url"
              placeholder="https://example.com/logo.png"
              value={company.logoUrl}
              onChange={(e) => setCompany({ ...company, logoUrl: e.target.value })}
              disabled={!isSuperAdmin || loading}
            />
            {company.logoUrl && (
              <img
                src={company.logoUrl}
                alt="Logo preview"
                className="mt-2 h-10 w-10 rounded object-contain border"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Currency</Label>
            <Input
              value={company.currency}
              onChange={(e) => setCompany({ ...company, currency: e.target.value.toUpperCase() })}
              disabled={!isSuperAdmin || loading}
              maxLength={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Default low-stock threshold</Label>
            <Input
              type="number"
              min="0"
              value={company.lowStockThreshold}
              onChange={(e) =>
                setCompany({ ...company, lowStockThreshold: Number(e.target.value) })
              }
              disabled={!isSuperAdmin || loading}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
            <div>
              <Label className="text-sm">Email alerts</Label>
              <p className="text-xs text-muted-foreground">Notify admins when stock runs low.</p>
            </div>
            <Switch
              checked={company.emailAlerts}
              onCheckedChange={(c) => setCompany({ ...company, emailAlerts: c })}
              disabled={!isSuperAdmin || loading}
            />
          </div>
        </div>
        <div>
          <Button onClick={saveCompany} disabled={savingCompany || !isSuperAdmin}>
            {savingCompany && <Loader2 className="size-4 animate-spin" />}Save settings
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="size-5 text-primary" />
            <h3 className="font-semibold">SQLite Database Management</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Running on embedded SQLite 3 engine with persistent browser IndexedDB storage.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button variant="outline" onClick={handleExportSqlite} disabled={dbProcessing}>
            {dbProcessing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Export .sqlite file
          </Button>

          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={dbProcessing || !isSuperAdmin}
          >
            <Upload className="size-4" />
            Import .sqlite file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sqlite,.db,.sqlite3"
            className="hidden"
            onChange={handleImportSqlite}
          />

          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={handleResetSqlite}
            disabled={dbProcessing || !isSuperAdmin}
          >
            <RefreshCw className="size-4" />
            Reset to defaults
          </Button>
        </div>
      </Card>
    </div>
  );
}
