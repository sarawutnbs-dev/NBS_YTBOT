import { google } from "googleapis";
import { getEnv } from "./config";

/**
 * Build OAuth client with credentials from environment variables only.
 * No database token storage - always uses fresh tokens from .env
 */
async function buildOAuthClient() {
  const env = getEnv({ skipCache: true }); // Always read fresh from env

  if (!env.YOUTUBE_OAUTH_REFRESH_TOKEN) {
    throw new Error("Missing YOUTUBE_OAUTH_REFRESH_TOKEN in environment variables");
  }

  const client = new google.auth.OAuth2({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });

  // Set refresh token - Google will automatically get access token when needed
  client.setCredentials({
    refresh_token: env.YOUTUBE_OAUTH_REFRESH_TOKEN
  });

  return client;
}

/**
 * Get YouTube client for posting comments/replies.
 * Uses OAuth tokens from .env only (no database lookup).
 *
 * @param userId - User ID (kept for compatibility but not used for token lookup)
 */
export async function getYouTubeClientForUser(userId: string) {
  console.log(`[YouTube] Creating client from .env tokens (userId: ${userId})`);

  const client = await buildOAuthClient();
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
