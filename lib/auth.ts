import { prisma } from "./db";
import GoogleProvider from "next-auth/providers/google";
import { getServerSession, type DefaultSession, type NextAuthOptions } from "next-auth";
import { cache } from "react";
import type { User, Account, Profile } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { upsertOAuthToken } from "./youtubeWrite";

const env = (
  (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env ?? {}
);

export type ExtendedUser = DefaultSession["user"] & {
  id: string;
  role: "ADMIN" | "USER";
  allowed: boolean;
  accessToken?: string;
  refreshToken?: string;
};

export type AppSession = DefaultSession & {
  user: ExtendedUser;
};

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope: "openid email profile https://www.googleapis.com/auth/youtube.force-ssl"
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async signIn({ user, account, profile }: { user: User; account: Account | null; profile?: Profile }) {
      console.log('\n🔐 SignIn attempt:');
      console.log('User email:', user?.email);
      console.log('User name:', user?.name);
      console.log('User id:', user?.id);
      
      if (!user?.email) {
        console.log('❌ No email provided');
        return false;
      }

      const record = await prisma.user.findUnique({
        where: { email: user.email }
      });

      console.log('Database lookup result:', record ? '✅ Found' : '❌ Not found');
      console.log('Record:', record);

      if (!record) {
        console.log('❌ User not found in database');
        return false;
      }

      if (!record.allowed) {
        console.log('❌ User not allowed');
        return false;
      }

      // Create or update user in database
      await prisma.user.upsert({
        where: { email: user.email },
        update: {
          updatedAt: new Date()
        },
        create: {
          email: user.email,
          role: 'USER',
          allowed: true
        }
      });

      console.log('✅ SignIn successful\n');
      return true;
    },
    async jwt({ token, user, account }: { token: JWT; user?: User; account?: Account | null }) {
      if (user) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email ?? "" }
        });

        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.allowed = dbUser.allowed;
        }
      }

      // Store OAuth tokens in JWT
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;

        // Also store tokens in database for YouTube API with automatic refresh
        if (token.id && account.access_token) {
          console.log("[Auth] 💾 Storing OAuth tokens in database");
          await upsertOAuthToken(token.id as string, {
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? null,
            expiryDate: account.expires_at ? new Date(account.expires_at * 1000) : null,
            scope: account.scope ?? null
          });
          console.log("[Auth] ✅ Tokens stored successfully");
        }
      }

      return token;
    },
    async session({ session, token }: { session: any; token: JWT }) {
      if (!session.user) {
        return session as AppSession;
      }

      return {
        ...session,
        user: {
          ...session.user,
          id: token.id as string,
          role: (token.role ?? "USER") as ExtendedUser["role"],
          allowed: Boolean(token.allowed),
          accessToken: token.accessToken as string,
          refreshToken: token.refreshToken as string
        }
      } as AppSession;
    }
  },
  pages: {
    signIn: "/auth/login"
  }
};

export const getServerAuthSession = cache(() => getServerSession(authOptions));
