import { google } from "googleapis";
import { prisma } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { getEnv } from "./config";

export type OAuthTokenPayload = {
  accessToken: string;
  refreshToken?: string | null;
  expiryDate?: Date | null;
  scope?: string | null;
};

async function buildOAuthClient() {
  const env = getEnv();
  const client = new google.auth.OAuth2({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.NEXTAUTH_URL ? `${env.NEXTAUTH_URL}/api/auth/callback/google` : undefined
  });

  return client;
}

async function getStoredToken(userId: string) {
  const record = await prisma.oAuthToken.findFirst({
    where: {
      userId,
      provider: "google"
    },
    orderBy: { createdAt: "desc" }
  });

  if (!record) return null;

  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken ? decryptSecret(record.refreshToken) : null,
    expiryDate: record.expiresAt ?? null,
    scope: record.scope
  } satisfies OAuthTokenPayload;
}

export async function upsertOAuthToken(userId: string, payload: OAuthTokenPayload) {
  await prisma.oAuthToken.upsert({
    where: { userId_provider: { userId, provider: "google" } },
    update: {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken ? encryptSecret(payload.refreshToken) : null,
      expiresAt: payload.expiryDate ?? null,
      scope: payload.scope ?? null
    },
    create: {
      userId,
      provider: "google",
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken ? encryptSecret(payload.refreshToken) : null,
      expiresAt: payload.expiryDate ?? null,
      scope: payload.scope ?? null
    }
  });
}

export async function getYouTubeClientForUser(userId: string) {
  const credentials = await getStoredToken(userId);
  if (!credentials?.accessToken) {
    throw new Error("Missing YouTube OAuth credentials");
  }

  const client = await buildOAuthClient();
  client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken ?? undefined,
    expiry_date: credentials.expiryDate?.getTime()
  });

  return google.youtube({ version: "v3", auth: client });
}

export async function replyToComment({
  userId,
  parentId,
  text
}: {
  userId: string;
  parentId: string;
  text: string;
}) {
  const youtube = await getYouTubeClientForUser(userId);

  const { data } = await youtube.comments.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        parentId,
        textOriginal: text
      }
    }
  });

  return data;
}
