import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";
import crypto from "node:crypto";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

function ensureTokenKey() {
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required");
  }
  return crypto.createHash("sha256").update(process.env.TOKEN_ENCRYPTION_KEY).digest();
}

function decryptRefreshToken(encrypted: string): string {
  const key = ensureTokenKey();
  const data = Buffer.from(encrypted, "base64");
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  
  const decipher = crypto.createDecipheriv("aes-256-gcm", key as any, iv as any);
  decipher.setAuthTag(authTag as any);
  
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

async function main() {
  console.log("\n🔍 Comparing refresh tokens (env vs DB)...\n");

  const tokens = await prisma.oAuthToken.findMany({
    where: { provider: "google" },
    include: { user: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!tokens.length) {
    console.log("⚠️  No Google OAuth tokens found in database.\n");
    return;
  }

  const dbToken = tokens[0];
  console.log(`📦 Database token (latest):`);
  console.log(`   User: ${dbToken.user.email}`);
  console.log(`   Updated: ${dbToken.updatedAt.toISOString()}\n`);

  let decryptedDbToken = "(unable to decrypt)";
  try {
    if (dbToken.refreshToken) {
      decryptedDbToken = decryptRefreshToken(dbToken.refreshToken);
    }
  } catch (error) {
    console.error(`   ❌ Decryption failed: ${(error as Error).message}\n`);
  }

  const envToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN || "(not set)";

  console.log(`🔐 Decrypted DB refresh token:`);
  console.log(`   ${decryptedDbToken.substring(0, 50)}...\n`);

  console.log(`📄 .env.local refresh token:`);
  console.log(`   ${envToken.substring(0, 50)}...\n`);

  if (decryptedDbToken === envToken) {
    console.log("✅ Tokens match! DB and .env.local are in sync.\n");
  } else {
    console.log("⚠️  Tokens DO NOT match. DB and .env.local are out of sync.\n");
    console.log("💡 Tip: Re-run get-youtube-refresh-token.js to ensure both are updated.\n");
  }
}

main()
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
