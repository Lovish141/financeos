import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

// Database sessions (NOT JWT). next-auth's Credentials provider is incompatible
// with the database strategy, so credential login/logout is handled explicitly
// in `src/lib/auth-session.ts` (mint/destroy a real Session row). Here we only
// wire up the adapter + database strategy so `auth()` reads that Session row on
// every request — which is what makes role changes and revocation take effect
// on the user's very next request (Module 7 acceptance).
export const { handlers, auth, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: SESSION_MAX_AGE_SEC },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    // Database strategy passes the freshly-read DB user. Return a MINIMAL,
    // sanitized session — never leak passwordHash or the raw session token
    // (they must not reach the /api/auth/session response). Surfaces role +
    // companyId so every server component/route has them without an extra query.
    async session({ session, user }) {
      return {
        expires: session.expires,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          companyId: user.companyId,
        },
      };
    },
  },
});
