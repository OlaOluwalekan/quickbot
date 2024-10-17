import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import { db } from "./utils/db";
import authConfig from "./auth.config";
import { getUserById } from "./utils/actions/user";

export const {
  handlers: { GET, POST },
  signIn,
  signOut,
  auth,
} = NextAuth({
  callbacks: {
    /**
     * Handles the sign-in process for a user.
     *
     * @param {Object} params - The parameters for the sign-in function.
     * @param {Object} params.user - The user object containing user details.
     * @param {Object} params.account - The account object containing account details.
     *
     * @returns {Promise<boolean>} - Returns a promise that resolves to true if the sign-in is successful, otherwise false.
     *
     * The function checks if the account provider is not "credentials". If so, it allows the sign-in by returning true.
     * If the provider is "credentials", it retrieves the user by ID and checks if the user exists and has a verified email.
     * If both conditions are met, it returns true, allowing the sign-in. Otherwise, it returns false.
     */
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
    /**
     * Updates the session object with user details based on the provided token.
     *
     * @param {Object} params - The parameters for the session function.
     * @param {Object} params.token - The token object containing user identification.
     * @param {Object} params.session - The session object to be updated with user details.
     *
     * @returns {Object} - Returns the updated session object.
     *
     * The function checks if the token contains a user ID (`sub`) and if the session has a user object.
     * If both conditions are met, it assigns the user ID from the token to the session user ID.
     * It then retrieves the existing user details by ID. If the user exists, it updates the session
     * user object with the user's tokens and name.
     */
    async session({ token, session }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
        const existingUser = await getUserById(session.user.id);
        if (existingUser) {
          (session.user as any).token = existingUser.tokens;
          session.user.name = existingUser.name;
        }
      }
      return session;
    },
    /**
     * Asynchronously processes a JSON Web Token (JWT).
     *
     * @param {Object} param - The parameter object.
     * @param {Object} param.token - The JWT token object.
     * @returns {Promise<Object>} The processed token object.
     */
    async jwt({ token }) {
      if (!token.sub) return token;

      return token;
    },
  },
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  ...authConfig,
});
