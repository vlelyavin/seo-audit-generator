import NextAuth from "next-auth";
// import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
// import { compare } from "bcryptjs";
import { prisma } from "./prisma";
import { encryptToken } from "./token-encryption";

// Wrap PrismaAdapter to encrypt OAuth tokens before they're stored
const baseAdapter = PrismaAdapter(prisma);
const adapter: typeof baseAdapter = {
  ...baseAdapter,
  linkAccount: (account) => {
    const encrypted = {
      ...account,
      ...(account.access_token ? { access_token: encryptToken(account.access_token) } : {}),
      ...(account.refresh_token ? { refresh_token: encryptToken(account.refresh_token) } : {}),
    };
    return baseAdapter.linkAccount!(encrypted);
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/en/login",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      checks: ["state"],
    }),
    // Credentials auth disabled — Google only
    // Credentials({
    //   name: "credentials",
    //   credentials: {
    //     email: { label: "Email", type: "email" },
    //     password: { label: "Password", type: "password" },
    //   },
    //   async authorize(credentials) {
    //     if (!credentials?.email || !credentials?.password) return null;
    //     const user = await prisma.user.findUnique({
    //       where: { email: credentials.email as string },
    //     });
    //     if (!user?.password) return null;
    //     const isValid = await compare(
    //       credentials.password as string,
    //       user.password
    //     );
    //     if (!isValid) return null;
    //     return {
    //       id: user.id,
    //       email: user.email,
    //       name: user.name,
    //       image: user.image,
    //     };
    //   },
    // }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }

      // Cache role/planId in JWT; refresh from DB every 5 minutes
      const JWT_DB_REFRESH_MS = 5 * 60 * 1000;
      const lastCheck = (token.lastDbCheck as number) ?? 0;
      const needsRefresh = Date.now() - lastCheck > JWT_DB_REFRESH_MS;

      if (token.email && (needsRefresh || !token.role)) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { role: true, planId: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.planId = dbUser.planId;
        }
        // Auto-grant admin role if email matches ADMIN_EMAIL env var
        const adminEmail = process.env.ADMIN_EMAIL;
        if (adminEmail && token.email === adminEmail) {
          token.role = "admin";
        }
        token.lastDbCheck = Date.now();
      }

      // Force logout if Google account was revoked by admin (check periodically)
      if (token.id && !user && needsRefresh) {
        const linkedAccount = await prisma.account.findFirst({
          where: { userId: token.id as string, provider: "google" },
        });
        if (!linkedAccount) {
          return null;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.planId = token.planId as string;
      }
      return session;
    },
  },
});
