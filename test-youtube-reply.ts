/**
 * Test YouTube Comment Reply with Refresh Token
 *
 * This script tests if the YOUTUBE_OAUTH_REFRESH_TOKEN can be used to reply to comments
 */

import { google } from "googleapis";
import { prisma } from "./lib/db";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function testYouTubeReply() {
  console.log("\n🧪 Testing YouTube Comment Reply with Refresh Token\n");
  console.log("=".repeat(80));

  // Check environment variables
  console.log("\n🔑 Environment Variables:");
  console.log(`   GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`   GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`   YOUTUBE_OAUTH_REFRESH_TOKEN: ${process.env.YOUTUBE_OAUTH_REFRESH_TOKEN ? '✅ Set' : '❌ Missing'}`);
  console.log("");

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.YOUTUBE_OAUTH_REFRESH_TOKEN) {
    console.error("❌ Missing required environment variables!");
    process.exit(1);
  }

  try {
    // Get a PENDING comment to test with
    console.log("📋 Finding a PENDING comment to test...\n");

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

    if (!comment || !comment.draft) {
      console.log("❌ No PENDING comments with drafts found");
      console.log("   Please make sure you have at least one comment with a PENDING draft\n");
      process.exit(1);
    }

    console.log("✅ Found test comment:");
    console.log(`   Comment ID: ${comment.commentId}`);
    console.log(`   Author: ${comment.authorDisplayName}`);
    console.log(`   Text: ${comment.textOriginal?.substring(0, 60)}...`);
    console.log(`   Draft Reply: ${comment.draft.reply?.substring(0, 60)}...`);
    console.log("");

    // Create OAuth2 client
    console.log("🔧 Creating OAuth2 client...\n");

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL + "/api/auth/callback/google"
    );

    // Set refresh token
    oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN
    });

    console.log("✅ OAuth2 client created with refresh token\n");

    // Get access token (this will use the refresh token)
    console.log("🔄 Getting access token from refresh token...\n");

    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log("✅ Access token obtained:");
    console.log(`   Token: ${credentials.access_token?.substring(0, 20)}...`);
    console.log(`   Expires: ${credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : 'Not set'}`);
    console.log(`   Scope: ${credentials.scope}`);
    console.log("");

    // Check if YouTube scope is included
    if (!credentials.scope?.includes('youtube')) {
      console.error("❌ YouTube scope not found in token!");
      console.error("   The refresh token doesn't have YouTube permissions");
      console.error("   You need to re-authorize with YouTube scope\n");
      process.exit(1);
    }

    console.log("✅ YouTube scope is included\n");

    // Create YouTube client
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // Ask user for confirmation
    console.log("=".repeat(80));
    console.log("\n⚠️  WARNING: This will POST A REAL REPLY to YouTube!\n");
    console.log("Reply text:");
    console.log(`"${comment.draft.reply}"`);
    console.log("");
    console.log("To comment:");
    console.log(`"${comment.textOriginal}"`);
    console.log("");
    console.log("=".repeat(80));
    console.log("\n💡 To proceed, uncomment the line that posts the reply in the script\n");
    console.log("   Current status: DRY RUN (will not actually post)\n");

    // UNCOMMENT THE LINES BELOW TO ACTUALLY POST THE REPLY
    /*
    console.log("📤 Posting reply to YouTube...\n");

    const response = await youtube.comments.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          parentId: comment.commentId,
          textOriginal: comment.draft.reply!
        }
      }
    });

    console.log("✅ SUCCESS! Reply posted to YouTube");
    console.log(`   YouTube Reply ID: ${response.data.id}`);
    console.log(`   Published at: ${response.data.snippet?.publishedAt}`);
    console.log("");

    // Update draft status to POSTED
    await prisma.draft.update({
      where: { id: comment.draft.id },
      data: {
        status: "POSTED",
        postedAt: new Date()
      }
    });

    console.log("✅ Draft status updated to POSTED in database\n");
    */

    console.log("=".repeat(80));
    console.log("\n🎉 TEST COMPLETED SUCCESSFULLY!\n");
    console.log("✅ Refresh token is valid");
    console.log("✅ Access token obtained successfully");
    console.log("✅ YouTube scope is present");
    console.log("✅ OAuth2 client is working correctly");
    console.log("");
    console.log("💡 The refresh token can be used to post comments!");
    console.log("   To actually post, uncomment the code in the script.\n");

  } catch (error: any) {
    console.error("\n❌ Error during test:");
    console.error("Error type:", error?.constructor?.name);
    console.error("Error message:", error?.message);

    if (error?.response?.data) {
      console.error("\nAPI Error Details:");
      console.error(JSON.stringify(error.response.data, null, 2));
    }

    if (error?.code === 'invalid_grant') {
      console.error("\n⚠️  The refresh token is invalid or has been revoked");
      console.error("   You need to get a new refresh token by:");
      console.error("   1. Running: node get-youtube-refresh-token.js");
      console.error("   2. Or logout and login again in the app\n");
    }

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testYouTubeReply().catch((error) => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
