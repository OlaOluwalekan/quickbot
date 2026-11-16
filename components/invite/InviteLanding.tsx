"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, AlertCircle, CheckCircle2, ArrowRight, Clock, Shield } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

interface InviteInfo {
  valid: boolean;
  status?: string;
  isExpired?: boolean;
  error?: string;
  id?: string;
  email?: string;
  signedInEmailMatches?: boolean | null;
  role?: string;
  expiresAt?: string;
  workspace?: { id: string; title: string } | null;
  project?: { id: string; name: string } | null;
  inviter?: { name: string | null; email: string };
  requiresSignIn?: boolean;
}

/**
 * Invitation landing UI. Opened either from the emailed link (`token`) or from
 * the in-app notification (`invitationId`, signed-in invitee only).
 */
export type InviteLandingProps =
  | { token: string; invitationId?: undefined }
  | { invitationId: string; token?: undefined };

export function InviteLanding({ token, invitationId }: InviteLandingProps) {
  const router = useRouter();
  const tInvite = useTranslations("Invite");
  const tRoot = useTranslations();
  const format = useFormatter();
  const lookup = token
    ? { key: "token", value: token }
    : { key: "id", value: invitationId ?? "" };
  const selfPath = token
    ? `/invite/${token}`
    : `/invite/id/${invitationId ?? ""}`;
  const { data: session, isPending: authLoading } = authClient.useSession();
  const actor = session?.user ? { email: session.user.email } : null;

  const [loading, setLoading] = React.useState(true);
  const [inviteInfo, setInviteInfo] = React.useState<InviteInfo | null>(null);
  const [accepting, setAccepting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!lookup.value) return;
    let isMounted = true;
    setLoading(true);
    fetch(
      `/api/v1/invitations/info?${lookup.key}=${encodeURIComponent(lookup.value)}`
    )
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        const data = json?.data ?? json;
        setInviteInfo(data);
        if (!data?.valid) {
          setErrorMsg(data?.error || tInvite("unavailableDefault"));
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setErrorMsg(tInvite("loadError"));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
    // Id lookups depend on who is signed in, so refetch when the session changes
  }, [lookup.key, lookup.value, session?.user?.id, tInvite]);

  const handleAccept = async () => {
    if (!lookup.value || accepting) return;
    setAccepting(true);
    try {
      const res = await fetch("/api/v1/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          token ? { token } : { invitationId: lookup.value }
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        throw json?.error ?? { status: res.status };
      }
      const data = json?.data ?? json;
      toast.success(tInvite("acceptedSuccess"));
      if (data?.workspaceId) {
        router.push(`/workspaces/${data.workspaceId}`);
      } else {
        router.push("/workspaces");
      }
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, tRoot, tInvite("acceptError"));
      toast.error(msg);
      setErrorMsg(msg);
    } finally {
      setAccepting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8 text-accent" />
          <p className="text-sm text-muted">{tInvite("checking")}</p>
        </div>
      </div>
    );
  }

  if (inviteInfo?.requiresSignIn && !actor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Users className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-fg">{tInvite("signInRequiredTitle")}</h1>
          <Button asChild className="w-full gap-2">
            <Link href={`/login?callbackUrl=${encodeURIComponent(selfPath)}`}>
              {tInvite("signInButton")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (errorMsg || !inviteInfo || !inviteInfo.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-fg">{tInvite("unavailableTitle")}</h1>
          <p className="text-sm text-muted">
            {errorMsg || inviteInfo?.error || tInvite("unavailableDefault")}
          </p>
          <div className="pt-2">
            <Button asChild variant="outline" className="w-full">
              <Link href="/workspaces">{tInvite("goToDashboard")}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const resourceTitle = inviteInfo.workspace?.title || inviteInfo.project?.name || tInvite("resourceWorkspace");
  const resourceType = inviteInfo.workspace ? tInvite("resourceWorkspace").toLowerCase() : tInvite("resourceProject").toLowerCase();
  const inviterName = inviteInfo.inviter?.name || tInvite("defaultInviter");
  const roleName = inviteInfo.role ? inviteInfo.role.toLowerCase() : tInvite("roleMember");
  const isEmailMatch = Boolean(actor && inviteInfo.signedInEmailMatches);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-sm">
            <Users className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{tInvite("heading")}</h1>
          <p className="text-sm text-muted">
            {tInvite("invitedTo", {
              inviter: inviterName,
              resourceType,
              resourceTitle,
              role: roleName,
            })}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-2 p-4 text-xs space-y-2 text-muted">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-accent" /> {tInvite("roleLabel")}
            </span>
            <span className="font-medium text-fg uppercase">{inviteInfo.role}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{tInvite("sentTo")}</span>
            <span className="font-medium text-fg font-mono">{inviteInfo.email}</span>
          </div>
          {inviteInfo.expiresAt && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> {tInvite("expires")}
              </span>
              <span>{format.dateTime(new Date(inviteInfo.expiresAt), { dateStyle: "medium" })}</span>
            </div>
          )}
        </div>

        {!actor ? (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-center text-subtle">
              {tInvite("signInPrompt")}
            </p>
            <Button asChild className="w-full gap-2">
              <Link href={`/login?callbackUrl=${encodeURIComponent(selfPath)}`}>
                {tInvite("signInToAccept")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/signup?callbackUrl=${encodeURIComponent(selfPath)}`}>
                {tInvite("createAccount")}
              </Link>
            </Button>
          </div>
        ) : !isEmailMatch ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-xs text-warning space-y-1">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{tInvite("accountMismatchTitle")}</span>
              </div>
              <p>
                {tInvite("accountMismatchDesc", {
                  currentEmail: actor.email,
                  invitedEmail: inviteInfo.email ?? "",
                })}
              </p>
            </div>
            <p className="text-xs text-center text-muted">
              {tInvite("switchAccountPrompt")}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/login?callbackUrl=${encodeURIComponent(selfPath)}`}>
                {tInvite("switchAccount")}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <Button
              className="w-full gap-2"
              disabled={accepting}
              onClick={handleAccept}
            >
              {accepting ? (
                <>
                  <Spinner className="h-4 w-4" />
                  <span>{tInvite("joining", { title: resourceTitle })}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {tInvite("acceptAndJoin", {
                      resourceType: inviteInfo.workspace ? tInvite("resourceWorkspace") : tInvite("resourceProject"),
                    })}
                  </span>
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
