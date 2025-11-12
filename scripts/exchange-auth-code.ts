import dotenv from "dotenv";
dotenv.config(); // Load from .env

import { google } from "googleapis";

/**
 * Exchange authorization code for refresh token
 * Usage: npx tsx scripts/exchange-auth-code.ts YOUR_AUTH_CODE
 */

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

async function exchangeAuthCode() {
  const authCode = process.argv[2];

  if (!authCode) {
    console.error("❌ Error: Please provide authorization code as argument");
    console.error("Usage: npx tsx scripts/exchange-auth-code.ts YOUR_AUTH_CODE");
    process.exit(1);
  }

  console.log("\n========================================");
  console.log("Exchange Authorization Code");
  console.log("========================================\n");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("❌ Error: Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env.local");
    process.exit(1);
  }

  console.log("✅ Found OAuth credentials");
  console.log(`📝 Authorization Code: ${authCode.substring(0, 30)}...\n`);

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3000/api/auth/callback/google"
  );

  console.log("⏳ Exchanging authorization code for tokens...\n");

  try {
    const { tokens } = await oauth2Client.getToken(authCode);

    if (!tokens.refresh_token) {
      console.error("❌ Error: No refresh token received!");
      console.error("   This might happen if you've authorized this app before.");
      console.error("   Try revoking access at: https://myaccount.google.com/permissions");
      console.error("   Then run the generate script again.");
      process.exit(1);
    }

    console.log("✅ Success! Tokens received:");
    console.log(`   Access Token: ${tokens.access_token?.substring(0, 30)}...`);
    console.log(`   Refresh Token: ${tokens.refresh_token?.substring(0, 30)}...`);
    console.log(`   Expires In: ${tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : "N/A"}`);
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
    console.log("========================================");
    console.log("🎉 Add this to your .env.local file:");
    console.log("========================================");
    console.log();
    console.log(`YOUTUBE_OAUTH_REFRESH_TOKEN="${tokens.refresh_token}"`);
    console.log();
    console.log("========================================");
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

exchangeAuthCode().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
