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

/**
 * Get OAuth token from environment variable as fallback
 */
async function getTokenFromEnv() {
  const env = getEnv();

  if (!env.YOUTUBE_OAUTH_REFRESH_TOKEN) {
    return null;
  }

  return {
    accessToken: "", // Will be obtained from refresh token
    refreshToken: env.YOUTUBE_OAUTH_REFRESH_TOKEN,
    expiryDate: null,
    scope: null
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
  // Try to get credentials from database first
  let credentials = await getStoredToken(userId);

  // If not found in database, try environment variable as fallback
  if (!credentials) {
    console.log("[YouTube] No tokens found in database, trying environment variable...");
    credentials = await getTokenFromEnv();
  }

  // If still no credentials, throw error
  if (!credentials?.refreshToken) {
    throw new Error("Missing YouTube OAuth credentials. Please login or set YOUTUBE_OAUTH_REFRESH_TOKEN.");
  }

  const client = await buildOAuthClient();

  // If we have an access token, use it. Otherwise, just set refresh token
  if (credentials.accessToken) {
    client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken ?? undefined,
      expiry_date: credentials.expiryDate?.getTime()
    });
  } else {
    // Only refresh token available (from env), set it and let Google API refresh it
    console.log("[YouTube] Using refresh token from environment variable");
    client.setCredentials({
      refresh_token: credentials.refreshToken
    });
  }

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
