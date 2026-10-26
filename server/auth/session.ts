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
};

export async function getActor(req?: Request): Promise<Actor | null> {
  const session = await auth.api.getSession({
    headers: req ? req.headers : await headers(),
  });
  if (!session) return null;
  return {
    userId: session.user.id,
    role: ((session.user as { role?: string }).role ?? "USER") as Actor["role"],
    sessionId: session.session.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
  };
}

export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect("/login");
  return a;
}
