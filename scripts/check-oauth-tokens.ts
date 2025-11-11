import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

/**
 * Script to check OAuth tokens in database
 */

async function checkOAuthTokens() {
  console.log("\n========================================");
  console.log("OAuth Tokens in Database");
  console.log("========================================\n");

  // Get all OAuth tokens
  const tokens = await prisma.oAuthToken.findMany({
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (tokens.length === 0) {
    console.log("❌ No OAuth tokens found in database");
    console.log("   This means API posting relies on .env.local token");
    console.log();
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${tokens.length} OAuth token(s):\n`);

  for (const token of tokens) {
    console.log("─".repeat(60));
    console.log(`User: ${token.user.email}`);
    console.log(`User ID: ${token.user.id}`);
    console.log(`Role: ${token.user.role}`);
    console.log(`Provider: ${token.provider}`);
    console.log(`Access Token: ${token.accessToken.substring(0, 30)}...`);

    if (token.refreshToken) {
      try {
        const decrypted = decryptSecret(token.refreshToken);
        console.log(`Refresh Token: ${decrypted.substring(0, 30)}... (encrypted in DB)`);
      } catch (error) {
        console.log(`Refresh Token: [ERROR decrypting]`);
      }
    } else {
      console.log(`Refresh Token: [MISSING]`);
    }

    console.log(`Scope: ${token.scope || "(none)"}`);
    console.log(`Expires At: ${token.expiresAt ? token.expiresAt.toISOString() : "N/A"}`);

    const now = new Date();
    if (token.expiresAt) {
      const isExpired = token.expiresAt < now;
      if (isExpired) {
        console.log(`Status: ❌ EXPIRED (${Math.floor((now.getTime() - token.expiresAt.getTime()) / 1000 / 60)} minutes ago)`);
      } else {
        const minutesLeft = Math.floor((token.expiresAt.getTime() - now.getTime()) / 1000 / 60);
        console.log(`Status: ✅ Valid (${minutesLeft} minutes left)`);
      }
    } else {
      console.log(`Status: ⚠️  No expiry info (might still work with refresh token)`);
    }

    console.log(`Created: ${token.createdAt.toISOString()}`);
    console.log(`Updated: ${token.updatedAt.toISOString()}`);
  }

  console.log("─".repeat(60));
  console.log();

  // Check .env.local token
  console.log("========================================");
  console.log("Token from .env.local");
  console.log("========================================\n");

  const envRefreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
  if (envRefreshToken) {
    console.log(`YOUTUBE_OAUTH_REFRESH_TOKEN: ${envRefreshToken.substring(0, 30)}...`);

    // Check if it looks like a valid refresh token
    if (envRefreshToken.startsWith("1//0")) {
      console.log(`Format: ✅ Looks like a valid refresh token`);
    } else if (envRefreshToken.startsWith("4/0")) {
      console.log(`Format: ❌ This is an authorization code, not a refresh token!`);
      console.log(`   Authorization codes can only be used once and expire quickly.`);
      console.log(`   You need to exchange it for a refresh token.`);
    } else {
      console.log(`Format: ⚠️  Unknown format (expected to start with "1//0")`);
    }
  } else {
    console.log("❌ YOUTUBE_OAUTH_REFRESH_TOKEN not set in .env.local");
  }

  console.log();

  // Summary
  console.log("========================================");
  console.log("Summary");
  console.log("========================================\n");

  const validTokensInDB = tokens.filter((t) => {
    if (!t.expiresAt) return !!t.refreshToken; // If no expiry but has refresh token, consider valid
    return t.expiresAt > new Date();
  });

  console.log(`✅ Valid tokens in database: ${validTokensInDB.length}`);
  console.log(`❌ Expired/invalid tokens: ${tokens.length - validTokensInDB.length}`);

  if (envRefreshToken && envRefreshToken.startsWith("1//0")) {
    console.log(`✅ .env.local has valid refresh token format`);
  } else if (envRefreshToken) {
    console.log(`❌ .env.local token is invalid`);
  } else {
    console.log(`⚠️  No token in .env.local`);
  }

  console.log();

  if (validTokensInDB.length > 0) {
    console.log("💡 Recommendation: API posting should work (using DB tokens)");
  } else if (envRefreshToken && envRefreshToken.startsWith("1//0")) {
    console.log("💡 Recommendation: API posting uses fallback (.env.local token)");
  } else {
    console.log("💡 Recommendation: Generate new OAuth token");
    console.log("   Run: npx tsx scripts/generate-youtube-oauth-token.ts");
  }

  console.log();

  await prisma.$disconnect();
}

checkOAuthTokens().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
