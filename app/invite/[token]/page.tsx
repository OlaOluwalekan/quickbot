"use client";

import { useParams } from "next/navigation";
import { InviteLanding } from "@/components/invite/InviteLanding";

/** Opened from the invitation email: `/invite/:token`. */
export default function InviteLandingPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  return <InviteLanding token={token} />;
}
