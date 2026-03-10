/**
 * Generic connect dialog for integrations.
 * Reads auth fields and connect steps from the integration registry,
 * so adding a new integration requires zero dialog changes.
 *
 * Google Drive has a two-step flow: credentials → shared drive picker.
 * Other integrations connect immediately after credential validation.
 */
import { ConnectorLogo } from "@/components/connector-logos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { IntegrationDefinition } from "@/lib/integrations";
import { ArrowLeftIcon, ArrowSquareOutIcon, FolderIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

interface SharedDrive {
  id: string;
  name: string;
}

interface ConnectIntegrationDialogProps {
  integration: IntegrationDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}

export function ConnectIntegrationDialog({
  integration,
  open,
  onOpenChange,
  onConnected,
}: ConnectIntegrationDialogProps) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Google Drive two-step state
  const [step, setStep] = useState<"credentials" | "drives">("credentials");
  const [sharedDrives, setSharedDrives] = useState<SharedDrive[]>([]);
  const [selectedDriveIds, setSelectedDriveIds] = useState<Set<string>>(new Set());
  const [rootFolders, setRootFolders] = useState<SharedDrive[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());

  const isGoogleDrive = integration?.type === "google_drive";
  const isMyDriveMode = isGoogleDrive && sharedDrives.length === 0;

  /** For non-Google-Drive: connect directly. For Google Drive: validate + browse drives/folders. */
  const validateMutation = useMutation({
    mutationFn: async () => {
      if (!integration) throw new Error("No integration selected");
      const credentials = buildCredentials();

      if (isGoogleDrive) {
        const result = await api.integrations.browseGoogleDrive(
          credentials as { client_id: string; client_secret: string; refresh_token: string },
        );
        return { drives: result.sharedDrives, folders: result.rootFolders };
      }

      // Non-Google-Drive: connect immediately
      await api.integrations.connect({
        connectorType: integration.type,
        authType: integration.authType,
        credentials,
      });
      return { drives: null, folders: null };
    },
    onSuccess: (data) => {
      if (data.drives !== null) {
        // Google Drive: move to scope picker
        setSharedDrives(data.drives);
        setSelectedDriveIds(new Set(data.drives.map((d) => d.id)));
        setRootFolders(data.folders ?? []);
        setSelectedFolderIds(new Set((data.folders ?? []).map((f) => f.id)));
        setStep("drives");
      } else {
        // Non-Google-Drive: done
        toast.success(`${integration?.name} connected successfully.`);
        resetAndClose();
        onConnected();
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to connect. Check your credentials and try again.");
    },
  });

  /** Google Drive step 2: connect with selected drives or folders. */
  const connectWithDrivesMutation = useMutation({
    mutationFn: async () => {
      if (!integration) throw new Error("No integration selected");
      const credentials = buildCredentials();
      const scopeConfig =
        sharedDrives.length > 0
          ? { sharedDrives: Array.from(selectedDriveIds) }
          : { folders: Array.from(selectedFolderIds) };
      return api.integrations.connect({
        connectorType: integration.type,
        authType: integration.authType,
        credentials,
        scopeConfig,
      });
    },
    onSuccess: () => {
      toast.success(`${integration?.name} connected successfully.`);
      resetAndClose();
      onConnected();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to connect.");
    },
  });

  const buildCredentials = (): Record<string, unknown> => {
    const credentials: Record<string, unknown> = {};
    for (const field of integration?.authFields ?? []) {
      credentials[field.key] = fieldValues[field.key]?.trim() ?? "";
    }
    return credentials;
  };

  const resetAndClose = () => {
    setFieldValues({});
    setStep("credentials");
    setSharedDrives([]);
    setSelectedDriveIds(new Set());
    setRootFolders([]);
    setSelectedFolderIds(new Set());
    onOpenChange(false);
  };

  const handleFieldChange = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleDrive = (driveId: string) => {
    setSelectedDriveIds((prev) => {
      const next = new Set(prev);
      if (next.has(driveId)) next.delete(driveId);
      else next.add(driveId);
      return next;
    });
  };

  const toggleFolder = (folderId: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const allFieldsFilled = integration?.authFields.every((f) => (fieldValues[f.key] ?? "").trim().length > 0) ?? false;
  const isPending = validateMutation.isPending || connectWithDrivesMutation.isPending;

  if (!integration) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetAndClose();
        else onOpenChange(next);
      }}
    >
      <DialogContent>
        {step === "credentials" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <IntegrationIcon color={integration.color} name={integration.name} type={integration.type} />
                Connect {integration.name}
              </DialogTitle>
              <DialogDescription>{integration.description}</DialogDescription>
            </DialogHeader>

            <ol className="list-inside list-decimal space-y-1.5 text-xs text-muted-foreground">
              {integration.connectSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <a href={integration.credentialUrl} target="_blank" rel="noopener noreferrer">
                  Get credentials
                  <ArrowSquareOutIcon className="size-3.5" />
                </a>
              </Button>
            </div>

            <div className="space-y-3">
              {integration.authFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`auth-${field.key}`} className="text-xs">
                    {field.label}
                  </Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={`auth-${field.key}`}
                      value={fieldValues[field.key] ?? ""}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      disabled={isPending}
                      className="min-h-24 font-mono text-xs"
                    />
                  ) : (
                    <Input
                      id={`auth-${field.key}`}
                      type={field.type === "password" ? "password" : "text"}
                      value={fieldValues[field.key] ?? ""}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      disabled={isPending}
                      className="font-mono text-xs"
                    />
                  )}
                  {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
                </div>
              ))}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={isPending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button onClick={() => validateMutation.mutate()} disabled={!allFieldsFilled || isPending}>
                {isPending ? (
                  <>
                    <SpinnerGapIcon size={14} className="animate-spin" />
                    {isGoogleDrive ? "Validating..." : "Connecting..."}
                  </>
                ) : isGoogleDrive ? (
                  "Validate & Select Drives"
                ) : (
                  "Connect"
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* Step 2: Shared drive picker or folder picker (Google Drive only) */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <IntegrationIcon color={integration.color} name={integration.name} type={integration.type} />
                {isMyDriveMode ? "Select Folders" : "Select Shared Drives"}
              </DialogTitle>
              <DialogDescription>
                {isMyDriveMode
                  ? "Choose which folders to sync from your Google Drive. You can change this later."
                  : "Choose which shared drives to sync. You can change this later."}
              </DialogDescription>
            </DialogHeader>

            {isMyDriveMode ? (
              <FolderPicker
                folders={rootFolders}
                selectedIds={selectedFolderIds}
                onToggle={toggleFolder}
                disabled={isPending}
              />
            ) : (
              <SharedDrivePicker
                drives={sharedDrives}
                selectedIds={selectedDriveIds}
                onToggle={toggleDrive}
                disabled={isPending}
              />
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("credentials")} disabled={isPending}>
                <ArrowLeftIcon size={14} />
                Back
              </Button>
              <Button
                onClick={() => connectWithDrivesMutation.mutate()}
                disabled={isPending || (isMyDriveMode ? selectedFolderIds.size === 0 : selectedDriveIds.size === 0)}
              >
                {isPending ? (
                  <>
                    <SpinnerGapIcon size={14} className="animate-spin" />
                    Connecting...
                  </>
                ) : isMyDriveMode ? (
                  `Connect ${selectedFolderIds.size} folder${selectedFolderIds.size === 1 ? "" : "s"}`
                ) : (
                  `Connect ${selectedDriveIds.size} drive${selectedDriveIds.size === 1 ? "" : "s"}`
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Shared drive picker — used in both connect and manage dialogs. */
export function SharedDrivePicker({
  drives,
  selectedIds,
  onToggle,
  disabled,
}: {
  drives: SharedDrive[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  if (drives.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-6 text-center">
        <FolderIcon size={24} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No shared drives found.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Make sure the service account or OAuth user has access to shared drives.
        </p>
      </div>
    );
  }

  const allSelected = drives.every((d) => selectedIds.has(d.id));

  return (
    <div className="space-y-1.5">
      {/* Select all toggle */}
      <button
        type="button"
        onClick={() => {
          if (allSelected) {
            for (const d of drives) onToggle(d.id);
          } else {
            for (const d of drives) {
              if (!selectedIds.has(d.id)) onToggle(d.id);
            }
          }
        }}
        disabled={disabled}
        className="flex w-full items-center gap-2 px-1 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <span className="inline-flex size-4 items-center justify-center rounded border border-border">
          {allSelected && <span className="size-2 rounded-sm bg-foreground" />}
        </span>
        {allSelected ? "Deselect all" : "Select all"} ({drives.length})
      </button>

      <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-border">
        {drives.map((drive) => {
          const isSelected = selectedIds.has(drive.id);
          return (
            <button
              key={drive.id}
              type="button"
              onClick={() => onToggle(drive.id)}
              disabled={disabled}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-50 ${
                isSelected ? "bg-muted/30" : ""
              }`}
            >
              <span
                className={`inline-flex size-4 shrink-0 items-center justify-center rounded border ${
                  isSelected ? "border-primary bg-primary" : "border-border"
                }`}
              >
                {isSelected && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3 text-primary-foreground"
                    role="img"
                    aria-label="Selected"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <FolderIcon size={16} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{drive.name}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {selectedIds.size} of {drives.length} drive{drives.length === 1 ? "" : "s"} selected
      </p>
    </div>
  );
}

/** Folder picker for My Drive mode — selects root-level folders to sync. */
export function FolderPicker({
  folders,
  selectedIds,
  onToggle,
  disabled,
}: {
  folders: Array<{ id: string; name: string }>;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  if (folders.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-6 text-center">
        <FolderIcon size={24} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No folders found in your Drive.</p>
      </div>
    );
  }

  const allSelected = folders.every((f) => selectedIds.has(f.id));

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => {
          if (allSelected) {
            for (const f of folders) onToggle(f.id);
          } else {
            for (const f of folders) {
              if (!selectedIds.has(f.id)) onToggle(f.id);
            }
          }
        }}
        disabled={disabled}
        className="flex w-full items-center gap-2 px-1 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <span className="inline-flex size-4 items-center justify-center rounded border border-border">
          {allSelected && <span className="size-2 rounded-sm bg-foreground" />}
        </span>
        {allSelected ? "Deselect all" : "Select all"} ({folders.length})
      </button>

      <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-border">
        {folders.map((folder) => {
          const isSelected = selectedIds.has(folder.id);
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => onToggle(folder.id)}
              disabled={disabled}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-50 ${
                isSelected ? "bg-muted/30" : ""
              }`}
            >
              <span
                className={`inline-flex size-4 shrink-0 items-center justify-center rounded border ${
                  isSelected ? "border-primary bg-primary" : "border-border"
                }`}
              >
                {isSelected && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3 text-primary-foreground"
                    role="img"
                    aria-label="Selected"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <FolderIcon size={16} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{folder.name}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {selectedIds.size} of {folders.length} folder{folders.length === 1 ? "" : "s"} selected
      </p>
    </div>
  );
}

export function IntegrationIcon({
  color,
  name,
  type,
  size = "sm",
}: { color: string; name: string; type?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "size-6",
    md: "size-8",
    lg: "size-10",
  };

  const logoSizes = { sm: 12, md: 16, lg: 20 };
  const fontSizes = { sm: "text-[11px]", md: "text-xs", lg: "text-sm" };

  const logo = type ? <ConnectorLogo type={type} size={logoSizes[size]} className="text-white" /> : null;

  return (
    <div
      className={`${sizeClasses[size]} flex items-center justify-center rounded-md font-semibold text-white`}
      style={{ backgroundColor: color }}
    >
      {logo || <span className={fontSizes[size]}>{name[0]}</span>}
    </div>
  );
}
