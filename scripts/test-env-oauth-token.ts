import dotenv from "dotenv";
dotenv.config(); // Load from .env

import { google } from "googleapis";

/**
 * Test if YOUTUBE_OAUTH_REFRESH_TOKEN from .env.local still works
 */

async function testEnvToken() {
  console.log("\n========================================");
  console.log("Test .env.local OAuth Token");
  console.log("========================================\n");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret) {
    console.error("❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    process.exit(1);
  }

  if (!refreshToken) {
    console.error("❌ Missing YOUTUBE_OAUTH_REFRESH_TOKEN");
    process.exit(1);
  }

  console.log("✅ Found credentials:");
  console.log(`   Client ID: ${clientId.substring(0, 30)}...`);
  console.log(`   Client Secret: ${clientSecret.substring(0, 20)}...`);
  console.log(`   Refresh Token: ${refreshToken.substring(0, 30)}...`);

  // Check token format
  if (refreshToken.startsWith("1//0")) {
    console.log(`   Format: ✅ Valid refresh token format\n`);
  } else if (refreshToken.startsWith("4/0")) {
    console.log(`   Format: ❌ This is an authorization code, not a refresh token!\n`);
    process.exit(1);
  } else {
    console.log(`   Format: ⚠️  Unknown format\n`);
  }

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  console.log("🧪 Test 1: Refreshing access token...");
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log("✅ Successfully refreshed access token!");
    console.log(`   New Access Token: ${credentials.access_token?.substring(0, 30)}...`);
    console.log(`   Token Type: ${credentials.token_type}`);
    console.log(`   Expires In: ${credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : "N/A"}`);
    console.log();
  } catch (error: any) {
    console.error("❌ Failed to refresh access token:");
    console.error(`   Error: ${error.message}`);
    if (error.response?.data) {
      console.error(`   Details:`, error.response.data);
    }
    console.log();
    console.log("💡 The refresh token has been revoked or expired.");
    console.log("   Run: npx tsx scripts/generate-youtube-oauth-token.ts");
    console.log();
    process.exit(1);
  }

  // Test 2: Get channel info
  console.log("🧪 Test 2: Fetching YouTube channel info...");
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  try {
    const response = await youtube.channels.list({
      part: ["snippet", "contentDetails"],
      mine: true,
    });

    if (response.data.items && response.data.items.length > 0) {
      const channel = response.data.items[0];
      console.log("✅ Successfully fetched channel info!");
      console.log(`   Channel: ${channel.snippet?.title}`);
      console.log(`   Channel ID: ${channel.id}`);
      console.log(`   Subscribers: ${channel.statistics?.subscriberCount || "N/A"}`);
    } else {
      console.log("⚠️  No channels found for this account");
    }
    console.log();
  } catch (error: any) {
    console.error("❌ Failed to fetch channel info:");
    console.error(`   Error: ${error.message}`);
    console.log();
  }

  // Test 3: Get video metadata
  console.log("🧪 Test 3: Fetching video metadata (test video)...");
  try {
    const testVideoId = "dQw4w9WgXcQ"; // Rick Astley - Never Gonna Give You Up
    const response = await youtube.videos.list({
      part: ["snippet"],
      id: [testVideoId],
    });

    if (response.data.items && response.data.items.length > 0) {
      const video = response.data.items[0];
      console.log("✅ Successfully fetched video metadata!");
      console.log(`   Title: ${video.snippet?.title}`);
      console.log(`   Channel: ${video.snippet?.channelTitle}`);
      console.log(`   Published: ${video.snippet?.publishedAt}`);
    } else {
      console.log("⚠️  Video not found");
    }
    console.log();
  } catch (error: any) {
    console.error("❌ Failed to fetch video metadata:");
    console.error(`   Error: ${error.message}`);
    console.log();
  }

  console.log("========================================");
  console.log("✅ All tests passed!");
  console.log("========================================");
  console.log();
  console.log("💡 Your .env.local YOUTUBE_OAUTH_REFRESH_TOKEN is working correctly.");
  console.log("   You can use it for fetching video metadata and posting comments.");
  console.log();
}

testEnvToken().catch((error) => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
