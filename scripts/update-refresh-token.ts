/**
 * Update YouTube OAuth Refresh Token in Database
 * 
 * This script reads YOUTUBE_OAUTH_REFRESH_TOKEN from .env.local
 * and stores it in the OAuthToken table for the specified user.
 */

import { config } from "dotenv";
import { resolve } from "path";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { google } from "googleapis";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { getEnv } = await import("../lib/config");
  const env = getEnv();

  console.log("\n🔄 Updating YouTube OAuth Refresh Token in Database\n");
  console.log("=".repeat(80));

  // Validate environment variables
  if (!env.YOUTUBE_OAUTH_REFRESH_TOKEN) {
    console.error("\n❌ YOUTUBE_OAUTH_REFRESH_TOKEN not found in .env.local");
    console.error("   Run: node get-youtube-refresh-token.js first\n");
    process.exit(1);
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.error("\n❌ Google OAuth credentials missing from .env.local");
    console.error("   Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET\n");
    process.exit(1);
  }

  console.log("\n✅ Environment variables loaded");
  console.log(`   Refresh Token: ${env.YOUTUBE_OAUTH_REFRESH_TOKEN.substring(0, 20)}...\n`);

  // Find allowed user
  const users = await prisma.user.findMany({
    where: { allowed: true },
    orderBy: { createdAt: "asc" }
  });

  if (users.length === 0) {
    console.error("❌ No allowed users found in database");
    console.error("   Create a user first with scripts/add-user.ts\n");
    process.exit(1);
  }

  console.log(`\n👥 Found ${users.length} allowed user(s):\n`);
  users.forEach((u, i) => {
    console.log(`   ${i + 1}. ${u.email} (${u.role})`);
  });

  // Use the first allowed user (usually the admin)
  const targetUser = users[0];
  console.log(`\n🎯 Using user: ${targetUser.email} (${targetUser.id})\n`);

  // Exchange refresh token for access token to get expiry and scope
  console.log("🔄 Exchanging refresh token for access token...\n");

  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: env.YOUTUBE_OAUTH_REFRESH_TOKEN
  });

  let accessToken: string | null = null;
  let expiryDate: Date | null = null;
  let scope: string | null = null;

  try {
    const tokenResponse = await oauth2Client.getAccessToken();
    accessToken = typeof tokenResponse.token === "string" 
      ? tokenResponse.token 
      : tokenResponse.token || null;

    if (!accessToken) {
      throw new Error("Failed to obtain access token");
    }

    const tokenInfo = await oauth2Client.getTokenInfo(accessToken);
    const inferredScopes = tokenInfo.scopes ?? 
      ((tokenInfo as any).scope?.split(/[\s,]+/) ?? []);
    
    scope = inferredScopes.join(" ");
    expiryDate = tokenResponse.res?.data?.expiry_date 
      ? new Date(tokenResponse.res.data.expiry_date)
      : new Date(Date.now() + 3600 * 1000); // Default 1 hour

    console.log("✅ Access token obtained successfully");
    console.log(`   Scope: ${scope}`);
    console.log(`   Expires: ${expiryDate.toISOString()}\n`);

    // Verify YouTube scope
    if (!scope.includes("youtube")) {
      console.error("⚠️  WARNING: YouTube scope not found in token!");
      console.error("   Expected: https://www.googleapis.com/auth/youtube.force-ssl");
      console.error("   Got: " + scope + "\n");
    } else {
      console.log("✅ YouTube scope verified\n");
    }

  } catch (error: any) {
    console.error("❌ Failed to exchange refresh token:");
    console.error("   " + error.message + "\n");
    process.exit(1);
  }

  // Encrypt the refresh token before storing
  const encryptedRefreshToken = encryptSecret(env.YOUTUBE_OAUTH_REFRESH_TOKEN);

  console.log("💾 Upserting OAuth token in database...\n");

  // Upsert the token
  await prisma.oAuthToken.upsert({
    where: {
      userId_provider: {
        userId: targetUser.id,
        provider: "google"
      }
    },
    update: {
      accessToken: accessToken!,
      refreshToken: encryptedRefreshToken,
      expiresAt: expiryDate,
      scope: scope
    },
    create: {
      userId: targetUser.id,
      provider: "google",
      accessToken: accessToken!,
      refreshToken: encryptedRefreshToken,
      expiresAt: expiryDate,
      scope: scope
    }
  });

  console.log("✅ OAuth token saved to database successfully!\n");
  console.log("=".repeat(80));
  console.log("\n📋 Summary:\n");
  console.log(`   User: ${targetUser.email}`);
  console.log(`   Provider: google`);
  console.log(`   Access Token: ${accessToken!.substring(0, 20)}...`);
  console.log(`   Refresh Token: Encrypted and stored`);
  console.log(`   Scope: ${scope}`);
  console.log(`   Expires: ${expiryDate?.toISOString()}\n`);

  console.log("🎉 Done! Your app can now post replies to YouTube.\n");
  console.log("💡 Next steps:");
  console.log("   1. Restart your Next.js dev server");
  console.log("   2. Try posting a reply from the moderation page");
  console.log("   3. Run 'npx tsx check-tokens.ts' to verify\n");
}

main()
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
