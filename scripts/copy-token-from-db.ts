import dotenv from "dotenv";
dotenv.config(); // Load from .env

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import fs from "fs";
import path from "path";

/**
 * Script to copy refresh token from database to .env.local
 */

async function copyTokenFromDB() {
  console.log("\n========================================");
  console.log("Copy Refresh Token from Database");
  console.log("========================================\n");

  // Get all OAuth tokens with refresh tokens
  const tokens = await prisma.oAuthToken.findMany({
    where: {
      provider: "google",
      refreshToken: { not: null },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (tokens.length === 0) {
    console.error("❌ No OAuth tokens with refresh tokens found in database");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Found ${tokens.length} token(s) with refresh tokens:\n`);

  // Display all tokens
  tokens.forEach((token, idx) => {
    console.log(`${idx + 1}. ${token.user.email} (${token.user.role})`);
    console.log(`   Provider: ${token.provider}`);
    console.log(`   Updated: ${token.updatedAt.toISOString()}`);
    console.log();
  });

  // Auto-select the first (most recently updated) token
  const selectedToken = tokens[0];

  console.log("─".repeat(60));
  console.log(`Selected token: ${selectedToken.user.email}`);
  console.log("─".repeat(60));
  console.log();

  // Decrypt the refresh token
  let decryptedRefreshToken: string;
  try {
    decryptedRefreshToken = decryptSecret(selectedToken.refreshToken!);
    console.log("✅ Successfully decrypted refresh token");
    console.log(`   Decrypted Token: ${decryptedRefreshToken.substring(0, 30)}...`);
    console.log();
  } catch (error) {
    console.error("❌ Failed to decrypt refresh token:", error);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Check if it's a valid refresh token format
  if (!decryptedRefreshToken.startsWith("1//0")) {
    console.warn("⚠️  Warning: Token doesn't start with '1//0' (expected format for refresh tokens)");
    console.log(`   Token starts with: ${decryptedRefreshToken.substring(0, 10)}`);
    console.log();
  }

  // Read .env.local file
  const envPath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) {
    console.error("❌ .env.local file not found at:", envPath);
    await prisma.$disconnect();
    process.exit(1);
  }

  let envContent = fs.readFileSync(envPath, "utf-8");

  // Update YOUTUBE_OAUTH_REFRESH_TOKEN
  const tokenRegex = /^YOUTUBE_OAUTH_REFRESH_TOKEN=.*/m;

  if (tokenRegex.test(envContent)) {
    // Replace existing token
    const oldMatch = envContent.match(tokenRegex);
    if (oldMatch) {
      const oldValue = oldMatch[0].split("=")[1].replace(/"/g, "");
      console.log("📝 Found existing YOUTUBE_OAUTH_REFRESH_TOKEN:");
      console.log(`   Old: ${oldValue.substring(0, 30)}...`);
      console.log();
    }

    envContent = envContent.replace(tokenRegex, `YOUTUBE_OAUTH_REFRESH_TOKEN="${decryptedRefreshToken}"`);
    console.log("✅ Replaced YOUTUBE_OAUTH_REFRESH_TOKEN");
  } else {
    // Add new token
    envContent += `\nYOUTUBE_OAUTH_REFRESH_TOKEN="${decryptedRefreshToken}"\n`;
    console.log("✅ Added YOUTUBE_OAUTH_REFRESH_TOKEN");
  }

  // Write back to .env.local
  fs.writeFileSync(envPath, envContent, "utf-8");

  console.log("✅ Successfully updated .env.local");
  console.log();

  // Test the new token
  console.log("🧪 Testing the new token...");
  console.log();

  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: decryptedRefreshToken });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log("✅ Token is valid! Successfully refreshed access token.");
    console.log(`   New Access Token: ${credentials.access_token?.substring(0, 30)}...`);
    console.log(`   Expires: ${credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : "N/A"}`);
    console.log();
  } catch (error: any) {
    console.error("❌ Token refresh failed:");
    console.error(`   ${error.message}`);
    console.log();
  }

  console.log("========================================");
  console.log("Summary");
  console.log("========================================");
  console.log();
  console.log(`✅ Copied refresh token from: ${selectedToken.user.email}`);
  console.log(`✅ Updated: .env.local`);
  console.log();
  console.log("💡 Your scripts should now work:");
  console.log("   - npx tsx scripts/update-missing-metadata.ts");
  console.log("   - npx tsx scripts/check-single-video.ts");
  console.log();

  await prisma.$disconnect();
}

copyTokenFromDB().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
