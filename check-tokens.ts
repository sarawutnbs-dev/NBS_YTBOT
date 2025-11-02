/**
 * Check OAuth tokens stored in database
 */

import { prisma } from "./lib/db";

async function checkTokens() {
  console.log("\n🔍 Checking OAuth Tokens in Database\n");
  console.log("=".repeat(80));

  // Get all users
  const users = await prisma.user.findMany({
    where: { allowed: true },
    select: {
      id: true,
      email: true,
      role: true,
    }
  });

  if (users.length === 0) {
    console.log("\n❌ No allowed users found");
    await prisma.$disconnect();
    return;
  }

  console.log(`\n👥 Found ${users.length} allowed user(s):\n`);

  for (const user of users) {
    console.log(`📧 ${user.email} (${user.role})`);
    console.log(`   User ID: ${user.id}`);

    // Check for OAuth tokens
    const tokens = await prisma.oAuthToken.findMany({
      where: { userId: user.id }
    });

    if (tokens.length === 0) {
      console.log(`   ❌ No OAuth tokens found`);
      console.log(`   💡 This user needs to logout and login again\n`);
      continue;
    }

    console.log(`   ✅ Found ${tokens.length} OAuth token(s):\n`);

    for (const token of tokens) {
      console.log(`   Provider: ${token.provider}`);
      console.log(`   Access Token: ${token.accessToken ? '✅ Set (length: ' + token.accessToken.length + ')' : '❌ Missing'}`);
      console.log(`   Refresh Token: ${token.refreshToken ? '✅ Set (encrypted)' : '❌ Missing'}`);
      console.log(`   Expires At: ${token.expiresAt ? token.expiresAt.toISOString() : 'Not set'}`);
      console.log(`   Scope: ${token.scope || 'Not set'}`);
      console.log(`   Created At: ${token.createdAt.toISOString()}`);
      console.log(`   Updated At: ${token.updatedAt.toISOString()}`);

      // Check if token is expired
      if (token.expiresAt) {
        const now = new Date();
        const isExpired = now > token.expiresAt;
        if (isExpired) {
          console.log(`   ⚠️  Access token is EXPIRED (will be auto-refreshed on next use)`);
        } else {
          const minutesLeft = Math.floor((token.expiresAt.getTime() - now.getTime()) / 1000 / 60);
          console.log(`   ✅ Access token is valid (expires in ${minutesLeft} minutes)`);
        }
      }

      // Check if YouTube scope is included
      if (token.scope?.includes('youtube')) {
        console.log(`   ✅ YouTube scope is included`);
      } else {
        console.log(`   ❌ YouTube scope NOT found in token scope`);
        console.log(`   💡 User needs to re-authenticate to get YouTube permissions`);
      }

      console.log("");
    }
  }

  console.log("=".repeat(80));
  console.log("\n📋 Summary:\n");

  const totalTokens = await prisma.oAuthToken.count();
  const tokensWithYouTube = await prisma.oAuthToken.count({
    where: {
      scope: {
        contains: 'youtube'
      }
    }
  });

  console.log(`   Total OAuth tokens: ${totalTokens}`);
  console.log(`   Tokens with YouTube scope: ${tokensWithYouTube}`);

  if (tokensWithYouTube === 0) {
    console.log("\n⚠️  WARNING: No tokens with YouTube scope found!");
    console.log("   All users need to logout and login again to grant YouTube permissions.\n");
  } else if (tokensWithYouTube < users.length) {
    console.log("\n⚠️  WARNING: Some users don't have YouTube scope!");
    console.log("   Those users need to logout and login again.\n");
  } else {
    console.log("\n✅ All users have YouTube tokens!\n");
  }

  await prisma.$disconnect();
}

checkTokens().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
