import { config } from "dotenv";
import { resolve } from "path";
import { google } from "googleapis";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { getEnv } = await import("../lib/config");
  const env = getEnv();
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const refreshToken = env.YOUTUBE_OAUTH_REFRESH_TOKEN;

  if (!refreshToken) {
    console.error("YOUTUBE_OAUTH_REFRESH_TOKEN is missing. Run the OAuth consent flow first.");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  try {
    const accessTokenResponse = await oauth2Client.getAccessToken();
    const accessToken = typeof accessTokenResponse === "string" ? accessTokenResponse : accessTokenResponse?.token;

    if (!accessToken) {
      console.error("Unable to obtain access token using the provided refresh token.");
      process.exit(1);
    }

    const tokenInfo = await oauth2Client.getTokenInfo(accessToken);
    const inferredScopes = tokenInfo.scopes ?? ((tokenInfo as unknown as { scope?: string }).scope?.split(/[\s,]+/) ?? []);

    console.log("Access token scopes:", inferredScopes);

    const hasForceSsl = inferredScopes.includes("https://www.googleapis.com/auth/youtube.force-ssl");

    if (hasForceSsl) {
      console.log("✅ Refresh token already includes youtube.force-ssl scope");
    } else {
      console.log("❌ youtube.force-ssl scope missing. Re-run OAuth consent with this scope included.");
      console.log("Suggested scope to add: https://www.googleapis.com/auth/youtube.force-ssl");
    }
  } catch (error) {
    console.error("Failed to verify token scope:", error);
    process.exit(1);
  }
}

main();
