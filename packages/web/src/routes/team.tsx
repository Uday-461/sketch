/**
 * Team page — manage workspace members.
 * Primary use case: add WhatsApp users so they can chat with the bot.
 * Slack users are auto-created on first DM; this page lets admins manage
 * WhatsApp access and see everyone.
 *
 * Also: link provider identities (ClickUp, Google Drive, etc.) to users
 * so file-level access control works at query time.
 */
import { ConnectorLogo } from "@/components/connector-logos";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProviderIdentity, User } from "@/lib/api";
import { api } from "@/lib/api";
import { INTEGRATIONS, getIntegration } from "@/lib/integrations";
import {
  DotsThreeIcon,
  EnvelopeSimpleIcon,
  LinkIcon,
  PencilSimpleIcon,
  PlusIcon,
  SlackLogoIcon,
  SpinnerGapIcon,
  UserMinusIcon,
  UsersThreeIcon,
  WhatsappLogoIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute, useRouteContext } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { dashboardRoute } from "./dashboard";

export const teamRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/team",
  component: TeamPage,
});

export function TeamPage() {
  const { auth } = useRouteContext({ from: dashboardRoute.id });
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.users.list(),
  });

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [removingUser, setRemovingUser] = useState<User | null>(null);
  const [linkingUser, setLinkingUser] = useState<User | null>(null);

  const users = data?.users ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Team</h1>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <PlusIcon size={14} weight="bold" />
          Add member
        </Button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <LoadingSkeleton />
        ) : users.length === 0 ? (
          <EmptyState onAdd={() => setShowAddDialog(true)} />
        ) : (
          <MemberList
            users={users}
            adminEmail={auth.email ?? ""}
            onEdit={setEditingUser}
            onRemove={setRemovingUser}
            onLink={setLinkingUser}
          />
        )}
      </div>

      <AddMemberDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["users"] });
        }}
      />

      <EditMemberDialog
        user={editingUser}
        onOpenChange={(open) => !open && setEditingUser(null)}
        onSuccess={() => {
          setEditingUser(null);
          queryClient.invalidateQueries({ queryKey: ["users"] });
        }}
      />

      <RemoveMemberDialog
        user={removingUser}
        onOpenChange={(open) => !open && setRemovingUser(null)}
        onSuccess={() => {
          setRemovingUser(null);
          queryClient.invalidateQueries({ queryKey: ["users"] });
        }}
      />

      <LinkProviderDialog user={linkingUser} onOpenChange={(open) => !open && setLinkingUser(null)} />
    </div>
  );
}

function MemberList({
  users,
  adminEmail,
  onEdit,
  onRemove,
  onLink,
}: {
  users: User[];
  adminEmail: string;
  onEdit: (user: User) => void;
  onRemove: (user: User) => void;
  onLink: (user: User) => void;
}) {
  return (
    <>
      <p className="mb-3 text-sm font-medium text-muted-foreground">Team members</p>
      <div className="rounded-lg border border-border bg-card">
        {users.map((user, i) => (
          <MemberRow
            key={user.id}
            user={user}
            isCurrentAdmin={!!user.email && user.email === adminEmail}
            isLast={i === users.length - 1}
            onEdit={() => onEdit(user)}
            onRemove={() => onRemove(user)}
            onLink={() => onLink(user)}
          />
        ))}
      </div>
    </>
  );
}

function MemberRow({
  user,
  isCurrentAdmin,
  isLast,
  onEdit,
  onRemove,
  onLink,
}: {
  user: User;
  isCurrentAdmin: boolean;
  isLast: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onLink: () => void;
}) {
  const initials = getInitials(user.name);

  return (
    <div className={`flex items-center gap-4 px-4 py-4 ${isLast ? "" : "border-b border-border"}`}>
      <Avatar className="size-9">
        <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium">{user.name}</span>
        {isCurrentAdmin && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            You
          </Badge>
        )}
      </div>

      <TooltipProvider>
        <div className="flex items-center gap-2">
          <ChannelBadge
            icon={<SlackLogoIcon size={16} />}
            active={!!user.slack_user_id}
            tooltip={user.slack_user_id ? "Slack connected" : "Slack not connected"}
            activeColor="#E01E5A"
          />
          <ChannelBadge
            icon={<WhatsappLogoIcon size={16} />}
            active={!!user.whatsapp_number}
            tooltip={user.whatsapp_number ? "WhatsApp connected" : "WhatsApp not connected"}
            activeColor="#25D366"
          />
          <ChannelBadge
            icon={<EnvelopeSimpleIcon size={16} />}
            active={!!user.email}
            tooltip={user.email ? `Email: ${user.email}` : "Email not set"}
            activeColor="#6366F1"
          />
        </div>
      </TooltipProvider>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7">
            <DotsThreeIcon size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onLink}>
            <LinkIcon size={14} className="mr-2" />
            Link accounts
          </DropdownMenuItem>
          {!isCurrentAdmin && (
            <>
              <DropdownMenuItem onClick={onEdit}>
                <PencilSimpleIcon size={14} className="mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onRemove}>
                <UserMinusIcon size={14} className="mr-2" />
                Remove member
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ChannelBadge({
  icon,
  active,
  tooltip,
  activeColor,
}: {
  icon: React.ReactNode;
  active: boolean;
  tooltip: string;
  activeColor: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={active ? "" : "text-muted-foreground/50"} style={active ? { color: activeColor } : undefined}>
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <UsersThreeIcon size={24} className="text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm font-medium">Your team's empty!</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">Add your first team member to get started.</p>
      <Button size="sm" className="mt-4" onClick={onAdd}>
        <PlusIcon size={14} weight="bold" />
        Add member
      </Button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-24" />
      <div className="rounded-lg border border-border bg-card">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`flex items-center gap-4 px-4 py-4 ${i < 3 ? "border-b border-border" : ""}`}>
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 w-36" />
            <div className="ml-auto flex gap-2">
              <Skeleton className="size-4" />
              <Skeleton className="size-4" />
              <Skeleton className="size-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddMemberDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof api.users.create>[0] = { name: name.trim() };
      if (email.trim()) payload.email = email.trim();
      if (phone.trim()) payload.whatsappNumber = phone.trim();
      return api.users.create(payload);
    },
    onSuccess: () => {
      toast.success("Member added");
      resetAndClose();
      onSuccess();
    },
    onError: (err: Error) => {
      if (err.message.includes("already linked")) {
        setError("This email or number is already linked to another member");
      } else {
        toast.error(err.message);
      }
    },
  });

  const resetAndClose = () => {
    setName("");
    setEmail("");
    setPhone("");
    setError("");
    onOpenChange(false);
  };

  const hasValidEmail = email.trim().length > 0 && email.includes("@");
  const hasValidPhone = phone.trim().startsWith("+") && phone.trim().length >= 8;
  const canSubmit = name.trim().length > 0 && (hasValidEmail || hasValidPhone);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetAndClose();
        else onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>Add a team member with their email or WhatsApp number.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="add-name">Name</Label>
            <Input
              id="add-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              disabled={createMutation.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-email">Email</Label>
            <Input
              id="add-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              placeholder="name@example.com"
              disabled={createMutation.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-phone">WhatsApp number</Label>
            <Input
              id="add-phone"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError("");
              }}
              placeholder="+91 98765 43210"
              disabled={createMutation.isPending}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={createMutation.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <SpinnerGapIcon size={14} className="animate-spin" />
                Adding...
              </>
            ) : (
              "Add member"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({
  user,
  onOpenChange,
  onSuccess,
}: {
  user: User | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email ?? "");
      setPhone(user.whatsapp_number ?? "");
      setError("");
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.users.update(user?.id ?? "", {
        name: name.trim(),
        email: email.trim() || null,
        whatsappNumber: phone.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Member updated");
      onSuccess();
    },
    onError: (err: Error) => {
      if (err.message.includes("already linked")) {
        setError("This email or number is already linked to another member");
      } else {
        toast.error(err.message);
      }
    },
  });

  const isDirty =
    user &&
    (name.trim() !== user.name ||
      (email.trim() || null) !== (user.email ?? null) ||
      (phone.trim() || null) !== (user.whatsapp_number ?? null));
  const canSubmit =
    isDirty &&
    name.trim().length > 0 &&
    (!email.trim() || email.includes("@")) &&
    (!phone.trim() || (phone.trim().startsWith("+") && phone.trim().length >= 8));

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit member</DialogTitle>
          <DialogDescription>Update this member's details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>

          {user?.slack_user_id && (
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Slack</Label>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
                <SlackLogoIcon size={16} style={{ color: "#E01E5A" }} />
                <span className="text-sm text-muted-foreground">Connected</span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              placeholder="name@example.com"
              disabled={updateMutation.isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-phone">WhatsApp number</Label>
            <Input
              id="edit-phone"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError("");
              }}
              placeholder="+91 98765 43210"
              disabled={updateMutation.isPending}
            />
            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : phone.trim() ? (
              <p className="text-xs text-muted-foreground">
                This number will be linked to {user?.name}'s identity on WhatsApp.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={updateMutation.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={() => updateMutation.mutate()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? (
              <>
                <SpinnerGapIcon size={14} className="animate-spin" />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMemberDialog({
  user,
  onOpenChange,
  onSuccess,
}: {
  user: User | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const removeMutation = useMutation({
    mutationFn: () => api.users.remove(user?.id ?? ""),
    onSuccess: () => {
      toast.success(`${user?.name} has been removed`);
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove team member?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>{user?.name} will lose access to this Sketch workspace immediately.</p>
              <p className="text-muted-foreground">Their past conversations will be retained.</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={removeMutation.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
            {removeMutation.isPending ? (
              <>
                <SpinnerGapIcon size={14} className="animate-spin" />
                Removing...
              </>
            ) : (
              "Remove"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Provider identity linking dialog — map a user to their accounts in connected integrations. */
function LinkProviderDialog({
  user,
  onOpenChange,
}: {
  user: User | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  // Fetch connected integrations to know which providers are available
  const { data: connectorsData } = useQuery({
    queryKey: ["connectors"],
    queryFn: () => api.integrations.list(),
    enabled: !!user,
  });

  // Fetch this user's existing provider identities
  const { data: identitiesData, isLoading: identitiesLoading } = useQuery({
    queryKey: ["identities", user?.id],
    queryFn: () => api.identities.listForUser(user?.id ?? ""),
    enabled: !!user,
  });

  const connectors = connectorsData?.connectors ?? [];
  const identities = identitiesData?.identities ?? [];

  // Only show providers that have at least one connected integration
  const connectedProviders = [...new Set(connectors.map((c) => c.connectorType))];

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link accounts</DialogTitle>
          <DialogDescription>
            Map {user?.name}'s accounts in connected integrations. This controls which files they can access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {identitiesLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : connectedProviders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <p className="text-sm text-muted-foreground">No integrations connected yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">Connect an integration first to link user accounts.</p>
            </div>
          ) : (
            connectedProviders.map((provider) => {
              const existing = identities.find((i) => i.provider === provider);
              return (
                <ProviderLinkRow
                  key={provider}
                  provider={provider}
                  userId={user?.id ?? ""}
                  existing={existing ?? null}
                  onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["identities", user?.id] });
                  }}
                />
              );
            })
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A single provider row inside the LinkProviderDialog. */
function ProviderLinkRow({
  provider,
  userId,
  existing,
  onSuccess,
}: {
  provider: string;
  userId: string;
  existing: ProviderIdentity | null;
  onSuccess: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [providerUserId, setProviderUserId] = useState("");
  const [providerEmail, setProviderEmail] = useState("");

  const integration = getIntegration(provider as Parameters<typeof getIntegration>[0]);
  const displayName = integration?.name ?? provider;
  const color = integration?.color ?? "#888";

  const connectMutation = useMutation({
    mutationFn: () =>
      api.identities.connect({
        userId,
        provider,
        providerUserId: providerUserId.trim(),
        providerEmail: providerEmail.trim() || null,
      }),
    onSuccess: () => {
      toast.success(`${displayName} account linked`);
      setIsEditing(false);
      setProviderUserId("");
      setProviderEmail("");
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.identities.disconnect(userId, provider),
    onSuccess: () => {
      toast.success(`${displayName} account unlinked`);
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (existing && !isEditing) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
        <span style={{ color }}>
          <ConnectorLogo type={provider} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{existing.providerEmail ?? existing.providerUserId}</p>
        </div>
        <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">
          Linked
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending}
        >
          <XIcon size={14} />
        </Button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-3">
        <div className="flex items-center gap-2 mb-3">
          <span style={{ color }}>
            <ConnectorLogo type={provider} size={18} />
          </span>
          <p className="text-sm font-medium">{displayName}</p>
        </div>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor={`link-${provider}-id`} className="text-xs">
              User ID
            </Label>
            <Input
              id={`link-${provider}-id`}
              value={providerUserId}
              onChange={(e) => setProviderUserId(e.target.value)}
              placeholder={getProviderIdPlaceholder(provider)}
              className="h-8 text-sm"
              disabled={connectMutation.isPending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`link-${provider}-email`} className="text-xs">
              Email <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`link-${provider}-email`}
              value={providerEmail}
              onChange={(e) => setProviderEmail(e.target.value)}
              placeholder="user@example.com"
              className="h-8 text-sm"
              disabled={connectMutation.isPending}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setIsEditing(false);
                setProviderUserId("");
                setProviderEmail("");
              }}
              disabled={connectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => connectMutation.mutate()}
              disabled={!providerUserId.trim() || connectMutation.isPending}
            >
              {connectMutation.isPending ? <SpinnerGapIcon size={12} className="animate-spin" /> : "Link"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-3">
      <span style={{ color }} className="opacity-50">
        <ConnectorLogo type={provider} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted-foreground">{displayName}</p>
        <p className="text-xs text-muted-foreground/70">Not linked</p>
      </div>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setIsEditing(true)}>
        Link
      </Button>
    </div>
  );
}

function getProviderIdPlaceholder(provider: string): string {
  switch (provider) {
    case "clickup":
      return "ClickUp user ID (numeric)";
    case "google_drive":
      return "Google user ID or email";
    case "linear":
      return "Linear user ID";
    case "notion":
      return "Notion user ID";
    default:
      return "Provider user ID";
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
