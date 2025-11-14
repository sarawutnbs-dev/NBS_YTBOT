import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("\n🔍 Checking OAuth tokens in database...\n");

  const tokens = await prisma.oAuthToken.findMany({
    include: { user: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!tokens.length) {
    console.log("⚠️  No OAuth tokens found in database.\n");
    return;
  }

  console.log(`✅ Found ${tokens.length} token(s):\n`);

  tokens.forEach((token, index) => {
    console.log(`${index + 1}. Provider: ${token.provider}`);
    console.log(`   User: ${token.user.email} (${token.userId})`);
    console.log(`   Access Token: ${token.accessToken.substring(0, 20)}...`);
    console.log(`   Refresh Token: ${token.refreshToken ? token.refreshToken.substring(0, 20) + "..." : "(none)"}`);
    console.log(`   Scope: ${token.scope || "(none)"}`);
    console.log(`   Expires: ${token.expiresAt ? token.expiresAt.toISOString() : "(none)"}`);
    console.log(`   Updated: ${token.updatedAt.toISOString()}\n`);
  });

  const envRefreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
  console.log("📋 Refresh token in .env.local:");
  console.log(`   ${envRefreshToken ? envRefreshToken.substring(0, 40) + "..." : "(not set)"}\n`);
}

main()
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
