"use client";

import { useParams } from "next/navigation";
import { InviteLanding } from "@/components/invite/InviteLanding";

/**
 * Opened from the in-app INVITE_RECEIVED notification: `/invite/id/:invitationId`.
 * Carries no token; only the signed-in invitee can view or accept it.
 */
export default function InviteByIdPage() {
  const params = useParams();
  const invitationId =
    typeof params.invitationId === "string" ? params.invitationId : "";
  return <InviteLanding invitationId={invitationId} />;
}
