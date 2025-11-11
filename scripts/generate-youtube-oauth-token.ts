import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { google } from "googleapis";
import readline from "readline";

/**
 * Script to generate YouTube OAuth Refresh Token
 *
 * This script will:
 * 1. Generate an authorization URL
 * 2. Ask you to visit the URL and authorize the app
 * 3. Exchange the authorization code for a refresh token
 * 4. Display the refresh token for you to add to .env.local
 *
 * Usage:
 *   npx tsx scripts/generate-youtube-oauth-token.ts
 */

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

async function generateRefreshToken() {
  console.log("\n========================================");
  console.log("YouTube OAuth Refresh Token Generator");
  console.log("========================================\n");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("❌ Error: Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env.local");
    process.exit(1);
  }

  console.log("✅ Found OAuth credentials:");
  console.log(`   Client ID: ${clientId.substring(0, 30)}...`);
  console.log(`   Client Secret: ${clientSecret.substring(0, 20)}...`);
  console.log();

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3000/api/auth/callback/google" // Redirect URI
  );

  // Generate authorization URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // Force consent screen to get refresh token
  });

  console.log("🔗 Step 1: Authorize the application");
  console.log("   Please visit this URL to authorize:");
  console.log();
  console.log(`   ${authUrl}`);
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const code = await new Promise<string>((resolve) => {
    rl.question("📝 Step 2: Enter the authorization code from the URL: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (!code) {
    console.error("\n❌ No authorization code provided");
    process.exit(1);
  }

  console.log("\n⏳ Step 3: Exchanging authorization code for tokens...");

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.error("\n❌ Error: No refresh token received!");
      console.error("   This might happen if you've authorized this app before.");
      console.error("   Try revoking access at: https://myaccount.google.com/permissions");
      console.error("   Then run this script again.");
      process.exit(1);
    }

    console.log("\n✅ Success! Tokens received:");
    console.log(`   Access Token: ${tokens.access_token?.substring(0, 30)}...`);
    console.log(`   Refresh Token: ${tokens.refresh_token?.substring(0, 30)}...`);
    console.log(`   Expires In: ${tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : "N/A"}`);
    console.log();

    console.log("========================================");
    console.log("🎉 Add this to your .env.local file:");
    console.log("========================================");
    console.log();
    console.log(`YOUTUBE_OAUTH_REFRESH_TOKEN="${tokens.refresh_token}"`);
    console.log();
    console.log("========================================");
    console.log();

    // Test the refresh token
    console.log("🧪 Testing refresh token...");
    oauth2Client.setCredentials({ refresh_token: tokens.refresh_token });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    try {
      const response = await youtube.channels.list({
        part: ["snippet"],
        mine: true,
      });

      if (response.data.items && response.data.items.length > 0) {
        const channel = response.data.items[0];
        console.log(`✅ Refresh token works! Authenticated as: ${channel.snippet?.title}`);
        console.log(`   Channel ID: ${channel.id}`);
      }
    } catch (testError) {
      console.error("⚠️  Warning: Could not test refresh token:", testError);
      console.log("   But the token might still work. Try adding it to .env.local");
    }

    console.log();
    console.log("✅ Done! Update your .env.local file with the refresh token above.");
    console.log();
  } catch (error) {
    console.error("\n❌ Error exchanging authorization code:");
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

generateRefreshToken().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
