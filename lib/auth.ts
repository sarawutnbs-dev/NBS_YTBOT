import { prisma } from "./db";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession, type DefaultSession, type NextAuthOptions } from "next-auth";
import { cache } from "react";
import type { User, Account, Profile } from "next-auth";
import type { JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";

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
    }),
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        console.log('\n🔐 Credentials login attempt:', credentials.username);

        // Find user by username
        const user = await prisma.user.findUnique({
          where: { username: credentials.username }
        });

        if (!user) {
          console.log('❌ User not found');
          return null;
        }

        if (!user.allowed) {
          console.log('❌ User not allowed');
          return null;
        }

        if (!user.password) {
          console.log('❌ User has no password set');
          return null;
        }

        // Verify password
        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          console.log('❌ Invalid password');
          return null;
        }

        console.log('✅ Credentials login successful\n');

        return {
          id: user.id,
          email: user.email,
          name: user.username,
          role: user.role,
          allowed: user.allowed
        } as any;
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
        // For credentials login, user object already has id and role
        if ((user as any).role) {
          token.id = user.id;
          token.role = (user as any).role;
          token.allowed = (user as any).allowed;
        } else {
          // For OAuth login, fetch from database
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email ?? "" }
          });

          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.allowed = dbUser.allowed;
          }
        }
      }

      // Store OAuth tokens in JWT only (not in database)
      // Database token storage disabled - using .env YOUTUBE_OAUTH_REFRESH_TOKEN instead
      if (account) {
        token.accessToken = account.access_token;
        // Only set refreshToken if Google provided it; otherwise keep existing
        if (typeof account.refresh_token !== 'undefined') {
          token.refreshToken = account.refresh_token as any;
        }
        console.log("[Auth] ✅ OAuth tokens stored in JWT session");
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
