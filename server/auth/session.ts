import "server-only";

export type Actor = {
  userId: string;
  role: "USER" | "ADMIN";
  sessionId: string;
  email: string;
};

/**
 * Stub returning null until Better Auth is wired in Step 1.3.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getActor(_req?: Request): Promise<Actor | null> {
  return null;
}
