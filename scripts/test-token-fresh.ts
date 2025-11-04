import { google } from "googleapis";
import dotenv from "dotenv";
import path from "node:path";

// Load .env first, then override with .env.local
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env.local"), override: true });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

async function main() {
  console.log("\n🧪 Testing refresh token immediately after loading from env...\n");
  console.log(`📄 Loaded refresh token: ${REFRESH_TOKEN?.substring(0, 30)}...\n`);

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error("Missing credentials in env");
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

  console.log("🔄 Attempting to get access token...\n");

  try {
    const accessTokenResponse = await oauth2Client.getAccessToken();
    const accessToken = typeof accessTokenResponse === "string"
      ? accessTokenResponse
      : accessTokenResponse?.token;

    if (!accessToken) {
      throw new Error("No access token returned");
    }

    console.log(`✅ Access token obtained: ${accessToken.substring(0, 30)}...\n`);

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const channelResponse = await youtube.channels.list({ part: ["id", "snippet"], mine: true });

    if (!channelResponse.data.items?.length) {
      console.warn("⚠️  No channels returned for this token.\n");
      return;
    }

    console.log("✅ Channel identities:");
    channelResponse.data.items.forEach((channel, index) => {
      const title = channel.snippet?.title ?? "(untitled)";
      const id = channel.id ?? "(no id)";
      console.log(`   ${index + 1}. ${title} (${id})`);
    });
    console.log("\n🎉 Success! Token is valid and has channel access.\n");

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.response?.data) {
      console.error("Response data:", JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("\n❌ Test failed:", error.message);
  process.exitCode = 1;
});
