import "server-only";

/**
 * Sessions live in secondary storage (Redis), and each one carries a copy of
 * the user row. `getSession()` returns that copy without reading the
 * database, so a change written straight to `users` (Prisma or raw SQL)
 * stays invisible until the person signs in again.
 *
 * Call this after such a write: it re-reads the user and rewrites the copy in
 * every active session. A failure is logged and swallowed: the database
 * write already succeeded, and the app shell also reads these fields from the
 * database.
 */
export async function refreshUserSessionCache(userId: string): Promise<void> {
  try {
    // Imported lazily: server/auth/auth.ts imports services that call this.
    const { auth } = await import("@/server/auth/auth");
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.findUserById(userId);
    if (user) {
      await ctx.internalAdapter.refreshUserSessions(user);
    }
  } catch (err) {
    console.error(
      "[auth] Failed to refresh cached sessions after a user update",
      err instanceof Error ? err.name : "unknown_error"
    );
  }
}
