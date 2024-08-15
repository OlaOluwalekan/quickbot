import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import { db } from "./utils/db";
import authConfig from "./auth.config";
import { getUserById } from "./utils/actions/user";
import { SessionProps } from "./types/user";

export const {
  handlers: { GET, POST },
  signIn,
  signOut,
  auth,
} = NextAuth({
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "credentials") {
        return true;
      }
      const existingUser = await getUserById(user.id as string);
      if (!existingUser || !existingUser.emailVerified) {
        return false;
      }
      return true;
    },
    async session({ token, session }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
        const existingUser = await getUserById(session.user.id);
        if (existingUser) {
          (session.user as any).token = existingUser.tokens;
        }
      }
      return session;
    },
    async jwt({ token }) {
      if (!token.sub) return token;

      return token;
    },
  },
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  ...authConfig,
});
