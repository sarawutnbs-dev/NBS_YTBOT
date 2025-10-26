import { prisma } from "./db";
import GoogleProvider from "next-auth/providers/google";
import { getServerSession, type DefaultSession, type NextAuthOptions } from "next-auth";
import { cache } from "react";
import type { User, Account, Profile } from "next-auth";
import type { JWT } from "next-auth/jwt";

const env = (
  (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env ?? {}
);

export type ExtendedUser = DefaultSession["user"] & {
  id: string;
  role: "ADMIN" | "USER";
  allowed: boolean;
};

export type AppSession = DefaultSession & {
  user: ExtendedUser;
};

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? ""
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
          allowed: Boolean(token.allowed)
        }
      } as AppSession;
    }
  },
  pages: {
    signIn: "/auth/login"
  }
};

export const getServerAuthSession = cache(() => getServerSession(authOptions));
