import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";

export type Actor = {
  userId: string;
  role: "USER" | "ADMIN";
  sessionId: string;
  email: string;
  name?: string;
  image?: string | null;
  username?: string | null;
  displayUsername?: string | null;
  usernameClaimedAt?: Date | null;
  usernameChangeCount?: number;
};

export async function getActor(req?: Request): Promise<Actor | null> {
  const session = await auth.api.getSession({
    headers: req ? req.headers : await headers(),
  });
  if (!session) return null;
  const u = session.user as {
    role?: string;
    username?: string | null;
    displayUsername?: string | null;
    usernameClaimedAt?: Date | string | null;
    usernameChangeCount?: number;
  };
  return {
    userId: session.user.id,
    role: ((u.role ?? "USER") as Actor["role"]),
    sessionId: session.session.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
    ...(u.username !== undefined && { username: u.username }),
    ...(u.displayUsername !== undefined && { displayUsername: u.displayUsername }),
    ...(u.usernameClaimedAt !== undefined && {
      usernameClaimedAt: u.usernameClaimedAt ? new Date(u.usernameClaimedAt) : null,
    }),
    ...(u.usernameChangeCount !== undefined && {
      usernameChangeCount: u.usernameChangeCount,
    }),
  };
}

export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect("/login");
  return a;
}
