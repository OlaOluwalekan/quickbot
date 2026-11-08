"use client";

import * as React from "react";
import {
  Users,
  UserPlus,
  Trash2,
  LogOut,
  RotateCcw,
  Activity,
  Crown,
  Mail,
  Check,
  Copy,
  AlertCircle,
  Globe,
  Link as LinkIcon,
  Eye,
  Clock,
  ShieldAlert,
  Lock,
  HelpCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

const ROLE_RANK: Record<string, number> = {
  VIEWER: 1,
  COMMENTER: 2,
  EDITOR: 3,
  ADMIN: 4,
};

interface MemberItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  username: string | null;
  image: string | null;
  avatarUrl: string | null;
  role: string;
  inherited?: boolean;
  source?: "WORKSPACE" | "PROJECT" | "BOTH";
  inheritedRole?: string | null;
  canComment?: boolean | null;
  canAsk?: boolean | null;
  inheritedCanComment?: boolean | null;
  inheritedCanAsk?: boolean | null;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  monthlyCreditCap?: number | null;
  monthlyCreditsUsed?: number;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: {
    id: string;
    name: string | null;
    email: string;
    username: string | null;
  };
}

interface ActivityItem {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  meta: Record<string, unknown> | null;
  actor: {
    id: string;
    name: string | null;
    username: string | null;
    image: string | null;
  };
}

interface ShareLinkItem {
  id: string;
  workspaceId: string;
  responseId: string | null;
  responsePrompt?: string | null;
  scope: "WORKSPACE" | "RESPONSE";
  view: "EDITED_IF_AVAILABLE" | "ORIGINAL";
  tokenPrefix: string;
  showAuthor: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  createdBy?: {
    id: string;
    name: string | null;
    username: string | null;
  };
}

export interface ShareAndPeopleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string;
  workspaceTitle?: string;
  projectId?: string;
  projectName?: string;
  currentUserId: string;
  initialTab?: "members" | "invite" | "public" | "activity";
  initialScope?: "WORKSPACE" | "RESPONSE";
  initialResponseId?: string | null;
  initialResponsePrompt?: string | null;
}

export function ShareAndPeopleDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceTitle,
  projectId,
  projectName,
  currentUserId,
  initialTab = "members",
  initialScope = "WORKSPACE",
  initialResponseId = null,
  initialResponsePrompt = null,
}: ShareAndPeopleDialogProps) {
  const isProject = Boolean(projectId && !workspaceId);
  const tMembers = useTranslations("Members");
  const roleLabel = (role: string) =>
    role in ROLE_RANK
      ? tMembers(`roles.${role as "VIEWER" | "COMMENTER" | "EDITOR" | "ADMIN"}`)
      : role;
  const resourceId = (isProject ? projectId : workspaceId) || "";
  const resourceTitle =
    (isProject ? projectName : workspaceTitle) ||
    (isProject ? "Project" : "Workspace");
  const resourceLabel = isProject ? "project" : "workspace";
  const baseApiPath = isProject
    ? `/api/v1/projects/${resourceId}`
    : `/api/v1/workspaces/${resourceId}`;

  const [activeTab, setActiveTab] = React.useState<
    "members" | "invite" | "public" | "activity"
  >(initialTab);

  // Members state
  const [loadingMembers, setLoadingMembers] = React.useState(false);
  const [owner, setOwner] = React.useState<MemberItem | null>(null);
  const [members, setMembers] = React.useState<MemberItem[]>([]);
  const [canManage, setCanManage] = React.useState(false);
  const [isOwner, setIsOwner] = React.useState(false);

  // Invite state
  const [emailOrUsername, setEmailOrUsername] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<string>("EDITOR");
  const [sendingInvite, setSendingInvite] = React.useState(false);
  const [pendingInvites, setPendingInvites] = React.useState<PendingInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = React.useState(false);

  // Public Share Links state (Step 7.6)
  const [shareLinks, setShareLinks] = React.useState<ShareLinkItem[]>([]);
  const [loadingShares, setLoadingShares] = React.useState(false);
  const [shareScope, setShareScope] = React.useState<"WORKSPACE" | "RESPONSE">(
    initialScope
  );
  const [shareResponseId, setShareResponseId] = React.useState<string | null>(
    initialResponseId
  );
  const [shareView, setShareView] = React.useState<
    "EDITED_IF_AVAILABLE" | "ORIGINAL"
  >("EDITED_IF_AVAILABLE");
  const [shareExpiry, setShareExpiry] = React.useState<"none" | "7" | "30">(
    "none"
  );
  const [shareShowAuthor, setShareShowAuthor] = React.useState(false);
  const [creatingShare, setCreatingShare] = React.useState(false);
  const [createdShareUrl, setCreatedShareUrl] = React.useState<string | null>(
    null
  );
  const [copiedShareUrl, setCopiedShareUrl] = React.useState(false);

  // Activity state
  const [activities, setActivities] = React.useState<ActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = React.useState(false);

  // Transfer ownership dialog
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [transferTarget, setTransferTarget] = React.useState<MemberItem | null>(
    null
  );
  const [transferConfirmText, setTransferConfirmText] = React.useState("");
  const [transferring, setTransferring] = React.useState(false);

  // Copy link state
  const [copiedLink, setCopiedLink] = React.useState(false);

  // Custom collaborator credit cap being typed (replaces the select inline)
  const [customCap, setCustomCap] = React.useState<{
    userId: string;
    value: string;
  } | null>(null);

  // Sync initial tab / scope when opened
  React.useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setShareScope(initialScope);
      setShareResponseId(initialResponseId);
      setCreatedShareUrl(null);
      setCopiedShareUrl(false);
    }
  }, [open, initialTab, initialScope, initialResponseId]);

  const fetchMembers = React.useCallback(async () => {
    if (!resourceId) return;
    setLoadingMembers(true);
    try {
      const res = await fetch(`${baseApiPath}/members`);
      if (res.ok) {
        const json = await res.json();
        const data = json?.data ?? json;
        setOwner(data?.owner ?? null);
        setMembers(Array.isArray(data?.members) ? data.members : []);
        setCanManage(Boolean(data?.canManage));
        setIsOwner(Boolean(data?.isOwner));
      }
    } catch {
      toast.error("Failed to load members");
    } finally {
      setLoadingMembers(false);
    }
  }, [resourceId, baseApiPath]);

  const fetchInvites = React.useCallback(async () => {
    if (!resourceId) return;
    setLoadingInvites(true);
    try {
      const res = await fetch(`${baseApiPath}/invitations`);
      if (res.ok) {
        const json = await res.json();
        const data = json?.data ?? json;
        setPendingInvites(Array.isArray(data) ? data : []);
      }
    } catch {
      // Ignore if user does not have manage_members permission
    } finally {
      setLoadingInvites(false);
    }
  }, [resourceId, baseApiPath]);

  const fetchShares = React.useCallback(async () => {
    if (!resourceId || isProject) return;
    setLoadingShares(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${resourceId}/shares`);
      if (res.ok) {
        const json = await res.json();
        const data = json?.data ?? json;
        setShareLinks(Array.isArray(data) ? data : []);
      }
    } catch {
      // Ignore if user does not have workspace.share permission
    } finally {
      setLoadingShares(false);
    }
  }, [resourceId, isProject]);

  const fetchActivity = React.useCallback(async () => {
    if (!resourceId) return;
    setLoadingActivity(true);
    try {
      const res = await fetch(`${baseApiPath}/activity?limit=30`);
      if (res.ok) {
        const json = await res.json();
        const data = json?.data ?? json;
        setActivities(Array.isArray(data?.items) ? data.items : []);
      }
    } catch {
      toast.error("Failed to load activity log");
    } finally {
      setLoadingActivity(false);
    }
  }, [resourceId, baseApiPath]);

  React.useEffect(() => {
    if (open && resourceId) {
      fetchMembers();
      fetchInvites();
      fetchShares();
      fetchActivity();
    }
  }, [open, resourceId, fetchMembers, fetchInvites, fetchShares, fetchActivity]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = emailOrUsername.trim();
    if (!input || sendingInvite) return;

    setSendingInvite(true);
    try {
      const res = await fetch(`${baseApiPath}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrUsername: input, role: inviteRole }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message || "Failed to send invitation");
      }
      toast.success("Invitation sent");
      setEmailOrUsername("");
      fetchInvites();
      fetchActivity();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to send invitation";
      toast.error(msg);
    } finally {
      setSendingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      const res = await fetch(`${baseApiPath}/invitations/${inviteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error?.message || "Failed to revoke invitation");
      }
      toast.success("Invitation revoked");
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      fetchActivity();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to revoke invitation";
      toast.error(msg);
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      const res = await fetch(`${baseApiPath}/invitations/${inviteId}/resend`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error?.message || "Failed to resend invitation");
      }
      toast.success("Invitation resent");
      fetchInvites();
      fetchActivity();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to resend invitation";
      toast.error(msg);
    }
  };

  const handleCreateShareLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProject || !workspaceId || creatingShare) return;
    if (shareScope === "RESPONSE" && !shareResponseId) {
      toast.error("Please select a response to share");
      return;
    }

    setCreatingShare(true);
    setCreatedShareUrl(null);
    try {
      const expiresInDays =
        shareExpiry === "7" ? 7 : shareExpiry === "30" ? 30 : null;
      const res = await fetch("/api/v1/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          scope: shareScope,
          responseId: shareScope === "RESPONSE" ? shareResponseId : undefined,
          view: shareView,
          expiresInDays,
          showAuthor: shareShowAuthor,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message || "Failed to create share link");
      }
      const data = json?.data ?? json;
      const url = data?.url as string | undefined;
      if (url) {
        setCreatedShareUrl(url);
        try {
          await navigator.clipboard.writeText(url);
          setCopiedShareUrl(true);
          setTimeout(() => setCopiedShareUrl(false), 2500);
          toast.success("Public link created and copied to clipboard");
        } catch {
          toast.success("Public link created");
        }
      }
      fetchShares();
      fetchActivity();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create share link";
      toast.error(msg);
    } finally {
      setCreatingShare(false);
    }
  };

  const handleRevokeShareLink = async (shareId: string) => {
    try {
      const res = await fetch(`/api/v1/shares/${shareId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error?.message || "Failed to revoke share link");
      }
      toast.success("Share link revoked immediately");
      fetchShares();
      fetchActivity();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to revoke share link";
      toast.error(msg);
    }
  };

  const handleCopyCreatedShareUrl = async () => {
    if (!createdShareUrl) return;
    try {
      await navigator.clipboard.writeText(createdShareUrl);
      setCopiedShareUrl(true);
      toast.success("Public link copied to clipboard");
      setTimeout(() => setCopiedShareUrl(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const saveCap = async (
    targetUserId: string,
    monthlyCreditCap: number | null
  ) => {
    try {
      const res = await fetch(`${baseApiPath}/members/${targetUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyCreditCap }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error?.message || "Failed to update credit cap");
      }
      toast.success(
        monthlyCreditCap === null
          ? "Collaborator credit cap set to unlimited"
          : `Collaborator credit cap set to ${monthlyCreditCap} credits/month`
      );
      fetchMembers();
      fetchActivity();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to update credit cap";
      toast.error(msg);
    }
  };

  const handleCapSelect = (m: MemberItem, val: string) => {
    if (val === "custom") {
      setCustomCap({
        userId: m.userId,
        value:
          m.monthlyCreditCap === null ? "" : String(m.monthlyCreditCap ?? 300),
      });
      return;
    }
    void saveCap(m.userId, val === "unlimited" ? null : Number(val));
  };

  const submitCustomCap = async () => {
    if (!customCap) return;
    const trimmed = customCap.value.trim();
    let cap: number | null = null;
    if (trimmed) {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0) {
        toast.error("Please enter a whole number of 0 or more");
        return;
      }
      cap = parsed;
    }
    await saveCap(customCap.userId, cap);
    setCustomCap(null);
  };

  const handleToggleCapability = async (
    targetUserId: string,
    capability: "canComment" | "canAsk",
    value: boolean
  ) => {
    try {
      const res = await fetch(`${baseApiPath}/members/${targetUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [capability]: value }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error?.message || "Failed to update member capability");
      }
      toast.success("Member capability updated");
      fetchMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update capability";
      toast.error(msg);
    }
  };

  const handleUpdateRole = async (targetUserId: string, newRole: string) => {
    try {
      const res = await fetch(`${baseApiPath}/members/${targetUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const json = await res.json();
        if (json?.error?.code === "role_below_inherited") {
          throw new Error(tMembers("errors.belowInherited"));
        }
        throw new Error(json?.error?.message || "Failed to update member role");
      }
      toast.success("Member role updated");
      fetchMembers();
      fetchActivity();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update role";
      toast.error(msg);
    }
  };

  const handleRemoveMember = async (targetUserId: string, isSelf = false) => {
    const confirmMsg = isSelf
      ? `Are you sure you want to leave this ${resourceLabel}?`
      : "Are you sure you want to remove this member?";
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`${baseApiPath}/members/${targetUserId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        if (json?.error?.code === "member_inherited") {
          throw new Error(tMembers("errors.inheritedMember"));
        }
        throw new Error(json?.error?.message || "Failed to remove member");
      }
      toast.success(
        isSelf ? `You have left the ${resourceLabel}` : "Member removed"
      );
      if (isSelf) {
        onOpenChange(false);
        window.location.href = "/workspaces";
      } else {
        fetchMembers();
        fetchActivity();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to remove member";
      toast.error(msg);
    }
  };

  const handleExecuteTransfer = async () => {
    if (!transferTarget || transferring) return;
    setTransferring(true);
    try {
      const res = await fetch(`${baseApiPath}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newOwnerId: transferTarget.userId,
          confirmation: transferConfirmText.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message || "Failed to transfer ownership");
      }
      toast.success("Ownership transferred successfully");
      setTransferOpen(false);
      setTransferTarget(null);
      setTransferConfirmText("");
      fetchMembers();
      fetchActivity();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to transfer ownership";
      toast.error(msg);
    } finally {
      setTransferring(false);
    }
  };

  const handleCopyLink = () => {
    if (typeof window === "undefined") return;
    const url = isProject
      ? `${window.location.origin}/workspaces`
      : `${window.location.origin}/workspaces/${resourceId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const allMembers = React.useMemo(() => {
    const list: MemberItem[] = [];
    if (owner) list.push(owner);
    return list.concat(members);
  }, [owner, members]);

  const activeShareCount = React.useMemo(
    () => shareLinks.filter((s) => s.status === "ACTIVE").length,
    [shareLinks]
  );

  const renderInviteForm = () => (
    <form onSubmit={handleSendInvite} className="space-y-2.5">
      <Label
        htmlFor="inviteInput"
        className="text-xs font-semibold uppercase tracking-wider text-muted"
      >
        Invite people by email or @username
      </Label>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <Input
            id="inviteInput"
            type="text"
            placeholder="colleague@example.com or @username"
            className="pl-9 h-9 bg-surface text-sm"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            required
          />
        </div>
        <div className="flex gap-2">
          <Select value={inviteRole} onValueChange={setInviteRole}>
            <SelectTrigger
              className="w-32 h-9 bg-surface text-xs"
              aria-label="Select role"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="VIEWER">Viewer</SelectItem>
              <SelectItem value="COMMENTER">Commenter</SelectItem>
              <SelectItem value="EDITOR">Editor</SelectItem>
              {isOwner && <SelectItem value="ADMIN">Admin</SelectItem>}
            </SelectContent>
          </Select>
          <Button
            type="submit"
            size="sm"
            disabled={sendingInvite}
            className="h-9 px-4 gap-1.5"
          >
            {sendingInvite ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5" />
                <span>Invite</span>
              </>
            )}
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-subtle">
        Sends a 7-day, single-use invitation link. Counts toward the
        owner&apos;s plan member limit.
      </p>
    </form>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-surface border-border">
          <DialogHeader className="p-6 pb-4 border-b border-border">
            <div className="flex items-center justify-between gap-3 pr-6">
              <div className="min-w-0">
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-fg">
                  <Users className="h-5 w-5 text-accent shrink-0" />
                  <span className="truncate">
                    Share &ldquo;{resourceTitle}&rdquo;
                  </span>
                </DialogTitle>
                <DialogDescription className="text-sm text-muted mt-1">
                  Manage collaborators, public share links, and {resourceLabel}{" "}
                  activity
                </DialogDescription>
              </div>
              {!isProject && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={handleCopyLink}
                >
                  {copiedLink ? (
                    <Check className="h-3.5 w-3.5 text-accent" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedLink ? "Copied" : "Copy Link"}</span>
                </Button>
              )}
            </div>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(v) =>
              setActiveTab(v as "members" | "invite" | "public" | "activity")
            }
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="px-6 border-b border-border bg-surface-2/40">
              <TabsList className="bg-transparent p-0 gap-4 h-11 border-b-0">
                <TabsTrigger
                  value="members"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 text-sm font-medium gap-1.5"
                >
                  <Users className="h-4 w-4" />
                  <span>People ({allMembers.length})</span>
                </TabsTrigger>
                {canManage && (
                  <TabsTrigger
                    value="invite"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 text-sm font-medium gap-1.5"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>Invitations</span>
                    {pendingInvites.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1 text-[10px] px-1.5 py-0"
                      >
                        {pendingInvites.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}
                {!isProject && canManage && (
                  <TabsTrigger
                    value="public"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 text-sm font-medium gap-1.5"
                  >
                    <Globe className="h-4 w-4" />
                    <span>Public Link</span>
                    {activeShareCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1 text-[10px] px-1.5 py-0"
                      >
                        {activeShareCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="activity"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 text-sm font-medium gap-1.5"
                >
                  <Activity className="h-4 w-4" />
                  <span>Activity</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* TAB 1: PEOPLE & INLINE INVITE */}
            <TabsContent
              value="members"
              className="flex-1 overflow-y-auto p-6 m-0 space-y-5"
            >
              {canManage && (
                <div className="rounded-xl border border-border bg-surface-2/40 p-4">
                  {renderInviteForm()}
                </div>
              )}

              {loadingMembers ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner className="h-6 w-6 text-accent" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Members ({allMembers.length})
                    </h3>
                  </div>

                  {allMembers.map((m) => {
                    const isMemberOwner = m.role === "OWNER";
                    const isSelf = m.userId === currentUserId;
                    const canEditThisMember =
                      canManage &&
                      !isMemberOwner &&
                      (isOwner || m.role !== "ADMIN");

                    return (
                      <div
                        key={m.id}
                        className="p-3 sm:p-3.5 rounded-xl border border-border bg-surface hover:bg-surface-2/40 transition-colors space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="h-9 w-9 rounded-xl border border-border shrink-0">
                              {m.avatarUrl ? (
                                <AvatarImage
                                  src={m.avatarUrl}
                                  alt={m.name || "Member"}
                                />
                              ) : null}
                              <AvatarFallback className="bg-surface-2 text-xs font-semibold">
                                {m.name?.charAt(0) || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-sm text-fg truncate">
                                  {m.name}
                                </span>
                                {isSelf && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    You
                                  </Badge>
                                )}
                                {isMemberOwner && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent bg-accent-soft px-1.5 py-0.5 rounded-md">
                                    <Crown className="h-3 w-3" /> Owner
                                  </span>
                                )}
                                {(m.inherited || m.inheritedRole) && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 text-muted"
                                  >
                                    {m.inheritedRole
                                      ? tMembers("inheritedBadge", {
                                          role: roleLabel(m.inheritedRole),
                                        })
                                      : tMembers("inheritedBadgePlain")}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted truncate">
                                {m.username && <span>@{m.username}</span>}
                                <span>{m.email}</span>
                              </div>
                            </div>
                          </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!isMemberOwner &&
                            (isOwner && customCap?.userId === m.userId ? (
                              <form
                                className="flex items-center gap-1"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void submitCustomCap();
                                }}
                              >
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  inputMode="numeric"
                                  autoFocus
                                  value={customCap.value}
                                  onChange={(e) =>
                                    setCustomCap({
                                      userId: m.userId,
                                      value: e.target.value,
                                    })
                                  }
                                  placeholder="Unlimited"
                                  aria-label="Monthly credit cap (leave blank for unlimited)"
                                  className="h-8 w-24 text-xs"
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  className="h-8 px-2 text-xs"
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => setCustomCap(null)}
                                >
                                  Cancel
                                </Button>
                              </form>
                            ) : isOwner && !(m.inherited && !isProject) ? (
                              <Select
                                value={
                                  m.monthlyCreditCap === null ||
                                  m.monthlyCreditCap === undefined
                                    ? "unlimited"
                                    : [100, 300, 500, 1000].includes(
                                          m.monthlyCreditCap
                                        )
                                      ? String(m.monthlyCreditCap)
                                      : "custom"
                                }
                                onValueChange={(val) => handleCapSelect(m, val)}
                              >
                                <SelectTrigger
                                  className="h-8 text-xs w-36 bg-surface"
                                  title="Monthly credit cap: covers everything this person spends from the owner's credits, across all of the owner's workspaces"
                                >
                                  <span className="truncate">
                                    {m.monthlyCreditsUsed ?? 0} /{" "}
                                    {m.monthlyCreditCap === null ||
                                    m.monthlyCreditCap === undefined
                                      ? "∞ cr"
                                      : `${m.monthlyCreditCap} cr`}
                                  </span>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="100">
                                    Cap: 100 cr/mo
                                  </SelectItem>
                                  <SelectItem value="300">
                                    Cap: 300 cr/mo
                                  </SelectItem>
                                  <SelectItem value="500">
                                    Cap: 500 cr/mo
                                  </SelectItem>
                                  <SelectItem value="1000">
                                    Cap: 1000 cr/mo
                                  </SelectItem>
                                  <SelectItem value="unlimited">
                                    Unlimited
                                  </SelectItem>
                                  <SelectItem value="custom">
                                    Custom cap...
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[11px] text-muted font-mono"
                                title={
                                  m.inherited && !isProject
                                    ? "Credit cap is set on the project's members"
                                    : "Monthly credit cap"
                                }
                              >
                                {m.monthlyCreditsUsed ?? 0} /{" "}
                                {m.monthlyCreditCap === null ||
                                m.monthlyCreditCap === undefined
                                  ? "∞"
                                  : m.monthlyCreditCap}{" "}
                                cr
                              </Badge>
                            ))}
                          {isMemberOwner ? (
                            <span className="text-xs font-semibold text-muted px-2 py-1">
                              Owner
                            </span>
                          ) : canEditThisMember ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <Select
                                value={m.role}
                                onValueChange={(val) =>
                                  handleUpdateRole(m.userId, val)
                                }
                              >
                                <SelectTrigger
                                  className="h-8 text-xs w-28 bg-surface"
                                  title={
                                    m.inheritedRole
                                      ? tMembers(m.source === "PROJECT" ? "manageOnProject" : "lowerOnProject")
                                      : undefined
                                  }
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {["VIEWER", "COMMENTER", "EDITOR", ...(isOwner ? ["ADMIN"] : [])]
                                    .filter(
                                      (role) =>
                                        ROLE_RANK[role]! >=
                                        (m.inheritedRole ? (ROLE_RANK[m.inheritedRole] ?? 1) : 1)
                                    )
                                    .map((role) => (
                                      <SelectItem key={role} value={role}>
                                        {roleLabel(role)}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              {m.inheritedRole && (
                                <span className="text-[10px] text-muted">
                                  {tMembers(m.source === "PROJECT" ? "manageOnProject" : "lowerOnProject")}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-end gap-0.5">
                              <Badge
                                variant="outline"
                                className="text-xs uppercase"
                              >
                                {m.role}
                              </Badge>
                              {m.inheritedRole && (
                                <span className="text-[10px] text-muted">
                                  {tMembers(m.source === "PROJECT" ? "manageOnProject" : "lowerOnProject")}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Member actions */}
                          {isOwner && !isMemberOwner && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-8 px-2 text-muted hover:text-accent"
                              title="Transfer Ownership"
                              onClick={() => {
                                setTransferTarget(m);
                                setTransferConfirmText("");
                                setTransferOpen(true);
                              }}
                            >
                              <Crown className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {!isMemberOwner &&
                            (canEditThisMember || isSelf) &&
                            !(!isProject && m.source === "PROJECT") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted hover:text-danger"
                              title={
                                isSelf
                                  ? `Leave ${resourceLabel}`
                                  : "Remove member"
                              }
                              onClick={() =>
                                handleRemoveMember(m.userId, isSelf)
                              }
                            >
                              {isSelf ? (
                                <LogOut className="h-4 w-4" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>

                      {!isMemberOwner && m.role !== "ADMIN" && (
                        <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-3 text-xs">
                          {(() => {
                            const isCommentInherited = Boolean(
                              m.inheritedCanComment === true ||
                                (m.inheritedRole &&
                                  ["COMMENTER", "EDITOR", "ADMIN"].includes(m.inheritedRole))
                            );
                            const effectiveComment =
                              isCommentInherited ||
                              (m.canComment !== undefined && m.canComment !== null
                                ? m.canComment
                                : ["COMMENTER", "EDITOR"].includes(m.role));

                            const isAskInherited = Boolean(
                              m.inheritedCanAsk === true ||
                                (m.inheritedRole &&
                                  ["EDITOR", "ADMIN"].includes(m.inheritedRole))
                            );
                            const effectiveAsk =
                              isAskInherited ||
                              (m.canAsk !== undefined && m.canAsk !== null
                                ? m.canAsk
                                : m.role === "EDITOR");

                            return (
                              <div className="flex items-center gap-5 sm:gap-6 flex-wrap">
                                <div className="flex items-center gap-2">
                                  {isCommentInherited ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-2 cursor-not-allowed opacity-75 select-none">
                                          <Switch size="sm" checked={true} disabled />
                                          <span className="text-xs text-muted font-medium flex items-center gap-1 whitespace-nowrap">
                                            {tMembers("capabilities.comment")}
                                            <Lock className="h-3 w-3 text-muted" />
                                          </span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {tMembers("capabilities.inheritedLocked")}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                      <Switch
                                        size="sm"
                                        checked={effectiveComment}
                                        disabled={!canEditThisMember}
                                        onCheckedChange={(val) =>
                                          handleToggleCapability(m.userId, "canComment", val)
                                        }
                                      />
                                      <span className="text-xs text-fg-muted font-medium whitespace-nowrap">
                                        {tMembers("capabilities.comment")}
                                      </span>
                                    </label>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  {isAskInherited ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-2 cursor-not-allowed opacity-75 select-none">
                                          <Switch size="sm" checked={true} disabled />
                                          <span className="text-xs text-muted font-medium flex items-center gap-1 whitespace-nowrap">
                                            {tMembers("capabilities.ask")}
                                            <Lock className="h-3 w-3 text-muted" />
                                          </span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {tMembers("capabilities.inheritedLocked")}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                          <Switch
                                            size="sm"
                                            checked={effectiveAsk}
                                            disabled={!canEditThisMember}
                                            onCheckedChange={(val) =>
                                              handleToggleCapability(m.userId, "canAsk", val)
                                            }
                                          />
                                          <span className="text-xs text-fg-muted font-medium flex items-center gap-1 whitespace-nowrap">
                                            {tMembers("capabilities.ask")}
                                            <HelpCircle className="h-3 w-3 text-muted/70 hover:text-fg-muted" />
                                          </span>
                                        </label>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {tMembers("capabilities.askHint")}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              )}
            </TabsContent>

            {/* TAB 2: INVITATIONS */}
            {canManage && (
              <TabsContent
                value="invite"
                className="flex-1 overflow-y-auto p-6 m-0 space-y-6"
              >
                <div className="rounded-xl border border-border bg-surface-2/40 p-4">
                  {renderInviteForm()}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-fg flex items-center justify-between">
                    <span>Pending Invitations</span>
                    <span className="text-xs font-normal text-muted">
                      {pendingInvites.length} pending
                    </span>
                  </h3>

                  {loadingInvites ? (
                    <div className="py-4 text-center">
                      <Spinner className="h-5 w-5 text-accent mx-auto" />
                    </div>
                  ) : pendingInvites.length === 0 ? (
                    <p className="text-xs text-muted py-4 text-center border border-dashed border-border rounded-xl">
                      No pending invitations.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {pendingInvites.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface text-xs"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-fg font-mono truncate">
                                {inv.email}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase"
                              >
                                {inv.role}
                              </Badge>
                            </div>
                            <p className="text-subtle text-[11px]">
                              Expires{" "}
                              {new Date(inv.expiresAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2 gap-1 text-muted hover:text-accent"
                              onClick={() => handleResendInvite(inv.id)}
                            >
                              <RotateCcw className="h-3 w-3" /> Resend
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2 text-muted hover:text-danger"
                              onClick={() => handleRevokeInvite(inv.id)}
                            >
                              Revoke
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            {/* TAB 3: PUBLIC LINK (Step 7.6) */}
            {!isProject && canManage && (
              <TabsContent
                value="public"
                className="flex-1 overflow-y-auto p-6 m-0 space-y-6"
              >
                <form
                  onSubmit={handleCreateShareLink}
                  className="rounded-xl border border-border bg-surface-2/40 p-4 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-accent" />
                      <span>Create Public Share Link</span>
                    </h3>
                  </div>

                  {/* Scope & View selectors */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted">Share scope</Label>
                      <Select
                        value={shareScope}
                        onValueChange={(v) => {
                          const next = v as "WORKSPACE" | "RESPONSE";
                          setShareScope(next);
                        }}
                      >
                        <SelectTrigger className="h-9 bg-surface text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WORKSPACE">
                            Entire workspace
                          </SelectItem>
                          {shareResponseId && (
                            <SelectItem value="RESPONSE">
                              This response only
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted">
                        Version to display
                      </Label>
                      <Select
                        value={shareView}
                        onValueChange={(v) =>
                          setShareView(
                            v as "EDITED_IF_AVAILABLE" | "ORIGINAL"
                          )
                        }
                      >
                        <SelectTrigger className="h-9 bg-surface text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EDITED_IF_AVAILABLE">
                            Edited if available
                          </SelectItem>
                          <SelectItem value="ORIGINAL">
                            Original AI output
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted">Expiration</Label>
                      <Select
                        value={shareExpiry}
                        onValueChange={(v) =>
                          setShareExpiry(v as "none" | "7" | "30")
                        }
                      >
                        <SelectTrigger className="h-9 bg-surface text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No expiration</SelectItem>
                          <SelectItem value="7">7 days</SelectItem>
                          <SelectItem value="30">30 days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {shareScope === "RESPONSE" && initialResponsePrompt && (
                    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
                      <span className="font-semibold text-fg">
                        Sharing single response:{" "}
                      </span>
                      <span className="italic">
                        &ldquo;{initialResponsePrompt.slice(0, 100)}
                        {initialResponsePrompt.length > 100 ? "…" : ""}&rdquo;
                      </span>
                    </div>
                  )}

                  {/* Show my name toggle */}
                  <label className="flex items-center gap-2 text-xs text-fg cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={shareShowAuthor}
                      onChange={(e) => setShareShowAuthor(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <span>Show my name on the public page</span>
                  </label>

                  {/* Warning Banner */}
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-fg">
                    <ShieldAlert className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <p>
                      Anyone with this link can read this{" "}
                      {shareScope === "RESPONSE" ? "response" : "workspace"}.
                      They don&apos;t need an account. Annotations, comments,
                      questions, collaborators, and edit history are never
                      included.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={creatingShare}
                      className="gap-1.5"
                    >
                      {creatingShare ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : (
                        <>
                          <LinkIcon className="h-3.5 w-3.5" />
                          <span>Create public link</span>
                        </>
                      )}
                    </Button>
                  </div>
                </form>

                {/* One-time Created Link Display */}
                {createdShareUrl && (
                  <div className="rounded-xl border border-accent/40 bg-accent-soft/20 p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-fg">
                        Your public share link (shown only once)
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        Ready to share
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={createdShareUrl}
                        className="h-9 font-mono text-xs bg-surface"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCopyCreatedShareUrl}
                        className="h-9 shrink-0 gap-1.5"
                      >
                        {copiedShareUrl ? (
                          <Check className="h-3.5 w-3.5 text-accent" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedShareUrl ? "Copied" : "Copy"}</span>
                      </Button>
                    </div>
                  </div>
                )}

                {/* Existing Share Links */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-fg">
                      Public Share Links
                    </h3>
                    <span className="text-xs text-muted">
                      {activeShareCount} active
                    </span>
                  </div>

                  {loadingShares ? (
                    <div className="py-4 text-center">
                      <Spinner className="h-5 w-5 text-accent mx-auto" />
                    </div>
                  ) : shareLinks.length === 0 ? (
                    <p className="text-xs text-muted py-6 text-center border border-dashed border-border rounded-xl">
                      No public links created yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {shareLinks.map((link) => (
                        <div
                          key={link.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface text-xs"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-semibold text-fg">
                                /s/{link.tokenPrefix}…
                              </span>
                              <Badge
                                variant={
                                  link.status === "ACTIVE"
                                    ? "secondary"
                                    : "outline"
                                }
                                className="text-[10px] uppercase"
                              >
                                {link.status}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase text-muted"
                              >
                                {link.scope === "RESPONSE"
                                  ? "Single response"
                                  : "Workspace"}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-[10px] text-muted"
                              >
                                {link.view === "ORIGINAL"
                                  ? "Original"
                                  : "Edited"}
                              </Badge>
                            </div>
                            {link.scope === "RESPONSE" &&
                              link.responsePrompt && (
                                <p className="text-[11px] text-muted truncate max-w-md italic">
                                  &ldquo;{link.responsePrompt}&rdquo;
                                </p>
                              )}
                            <div className="flex items-center gap-3 text-[11px] text-subtle flex-wrap">
                              <span className="inline-flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {link.viewCount}{" "}
                                {link.viewCount === 1 ? "view" : "views"}
                              </span>
                              {link.expiresAt ? (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Expires{" "}
                                  {new Date(
                                    link.expiresAt
                                  ).toLocaleDateString()}
                                </span>
                              ) : (
                                <span>Never expires</span>
                              )}
                              {link.showAuthor && <span>Author shown</span>}
                            </div>
                          </div>

                          {link.status === "ACTIVE" && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs px-2.5 text-muted hover:text-danger shrink-0"
                              onClick={() => handleRevokeShareLink(link.id)}
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            {/* TAB 4: ACTIVITY */}
            <TabsContent
              value="activity"
              className="flex-1 overflow-y-auto p-6 m-0 space-y-4"
            >
              {loadingActivity ? (
                <div className="py-12 text-center">
                  <Spinner className="h-6 w-6 text-accent mx-auto" />
                </div>
              ) : activities.length === 0 ? (
                <p className="text-xs text-muted py-8 text-center border border-dashed border-border rounded-xl">
                  No activity recorded yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {activities.map((act) => (
                    <div
                      key={act.id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-border bg-surface text-xs"
                    >
                      <Avatar className="h-7 w-7 rounded-lg border border-border shrink-0 mt-0.5">
                        {act.actor.image ? (
                          <AvatarImage
                            src={act.actor.image}
                            alt={act.actor.name || "User"}
                          />
                        ) : null}
                        <AvatarFallback className="bg-surface-2 text-[10px] font-semibold">
                          {act.actor.name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-fg">
                            {act.actor.name ||
                              act.actor.username ||
                              "Collaborator"}
                          </span>
                          <span className="text-[11px] text-subtle shrink-0">
                            {new Date(act.createdAt).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-muted text-xs">
                          <span className="font-medium text-fg">
                            {act.action}
                          </span>
                          {act.meta && Object.keys(act.meta).length > 0 && (
                            <span className="text-subtle ml-1 font-mono text-[11px]">
                              {JSON.stringify(act.meta)}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Transfer Ownership Modal */}
      {transferOpen && transferTarget && (
        <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
          <DialogContent className="max-w-md bg-surface border-border p-6 space-y-4">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2 text-danger">
                <AlertCircle className="h-5 w-5" />
                <span>Transfer Ownership</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted">
                You are about to transfer ownership of &ldquo;{resourceTitle}
                &rdquo; to{" "}
                <span className="font-semibold text-fg">
                  {transferTarget.name}
                </span>
                . You will become an Administrator and will lose exclusive
                ownership privileges.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <p className="text-muted">
                To confirm this transfer, please type{" "}
                <span className="font-bold font-mono text-fg">TRANSFER</span> or
                the {resourceLabel} name below:
              </p>
              <Input
                type="text"
                placeholder={`Type TRANSFER or ${resourceLabel} name`}
                className="h-9 bg-surface font-mono text-xs"
                value={transferConfirmText}
                onChange={(e) => setTransferConfirmText(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTransferOpen(false)}
                disabled={transferring}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={
                  transferring ||
                  (transferConfirmText.trim() !== "TRANSFER" &&
                    transferConfirmText.trim() !== resourceTitle.trim())
                }
                onClick={handleExecuteTransfer}
              >
                {transferring ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  "Confirm Transfer"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
