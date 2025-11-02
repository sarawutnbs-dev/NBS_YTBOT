/**
 * Test YouTube API with current OAuth tokens
 */

import { google } from "googleapis";
import { prisma } from "./lib/db";

async function testYouTubeAPI() {
  console.log("\n🧪 Testing YouTube API Access\n");
  console.log("=".repeat(80));

  // Get a comment to test with
  const comment = await prisma.comment.findFirst({
    where: {
      draft: {
        status: "PENDING"
      }
    },
    include: {
      draft: true
    }
  });

  if (!comment) {
    console.log("❌ No PENDING comments found");
    return;
  }

  console.log(`\n📝 Test Comment:`);
  console.log(`   Comment ID: ${comment.id}`);
  console.log(`   YouTube Comment ID: ${comment.commentId}`);
  console.log(`   Author: ${comment.authorDisplayName}`);
  console.log(`   Reply: ${comment.draft?.reply?.substring(0, 50)}...`);
  console.log("");

  // Check environment variables
  console.log("🔑 Environment Variables:");
  console.log(`   GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`   GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`   NEXTAUTH_URL: ${process.env.NEXTAUTH_URL || 'Not set'}`);
  console.log("");

  // Get user with tokens from database
  // Note: NextAuth stores tokens in JWT, not in database
  // We need to get them from a valid session
  console.log("⚠️  Important Notes:");
  console.log("   1. OAuth tokens are stored in JWT session, not database");
  console.log("   2. To test API, you need to:");
  console.log("      - Logout: http://localhost:3000/api/auth/signout");
  console.log("      - Login: http://localhost:3000/api/auth/signin");
  console.log("      - Google will ask for YouTube permissions");
  console.log("   3. Check that Google OAuth consent screen includes:");
  console.log("      - https://www.googleapis.com/auth/youtube.force-ssl");
  console.log("");

  // Test YouTube API configuration
  console.log("🔧 Testing YouTube API Configuration:");

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL + "/api/auth/callback/google"
    );

    console.log("   ✅ OAuth2 client created");
    console.log(`   Redirect URI: ${process.env.NEXTAUTH_URL}/api/auth/callback/google`);

    // Check if we can create YouTube client
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    console.log("   ✅ YouTube client created");
    console.log("");

    console.log("📋 Required Scopes:");
    console.log("   - openid");
    console.log("   - email");
    console.log("   - profile");
    console.log("   - https://www.googleapis.com/auth/youtube.force-ssl");
    console.log("");

    console.log("🎯 Next Steps:");
    console.log("   1. Check Google Cloud Console:");
    console.log("      https://console.cloud.google.com/apis/credentials");
    console.log("   2. Verify OAuth 2.0 Client ID includes redirect URI:");
    console.log(`      ${process.env.NEXTAUTH_URL}/api/auth/callback/google`);
    console.log("   3. Check OAuth consent screen includes YouTube scope");
    console.log("   4. Logout and login again to get new tokens");
    console.log("");

  } catch (error) {
    console.error("❌ Error:", error);
  }

  await prisma.$disconnect();
}

testYouTubeAPI();
