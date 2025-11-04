import path from "node:path";
import { fileURLToPath } from "node:url";

import { google } from "googleapis";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env first, then override with .env.local
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env.local"), override: true });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

async function main() {
	console.log("\n🔍 Checking YouTube identity from stored refresh token...\n");

	if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
		throw new Error("Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or YOUTUBE_OAUTH_REFRESH_TOKEN in env");
	}

	const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
	oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

	console.log("🔄 Requesting access token using refresh token...\n");

	const accessTokenResponse = await oauth2Client.getAccessToken();
	const accessToken = typeof accessTokenResponse === "string"
		? accessTokenResponse
		: accessTokenResponse?.token;

	if (!accessToken) {
		throw new Error("Unable to exchange refresh token for access token");
	}

	console.log(`✅ Access token obtained: ${accessToken.substring(0, 20)}...\n`);

		const tokenInfo = await oauth2Client.getTokenInfo(accessToken);
		const scopes = tokenInfo?.scopes ?? [];
		console.log("📋 Token scopes:", scopes.length ? scopes.join(", ") : "(none)", "\n");

	const youtube = google.youtube({ version: "v3", auth: oauth2Client });
	const channelResponse = await youtube.channels.list({ part: ["id", "snippet"], mine: true });

	if (!channelResponse.data.items?.length) {
		console.warn("⚠️  No channels returned for this token.");
		console.warn("   Make sure you choose the correct brand/channel account when authorizing.\n");
		return;
	}

	console.log("✅ Channel identities:");
	channelResponse.data.items.forEach((channel, index) => {
		const title = channel.snippet?.title ?? "(untitled)";
		const id = channel.id ?? "(no id)";
		console.log(`   ${index + 1}. ${title} (${id})`);
	});
	console.log("\n🎉 Done!\n");
}

main().catch((error) => {
	console.error("\n❌ Failed to inspect YouTube identity:", error.message);
	process.exitCode = 1;
});
