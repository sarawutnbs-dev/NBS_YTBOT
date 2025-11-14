import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";
import crypto from "node:crypto";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config();

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
  console.log("\n🔍 Retrieving refresh token from database...\n");

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

  if (!dbToken.refreshToken) {
    console.log("⚠️  No refresh token stored in database.\n");
    return;
  }

  let decryptedDbToken = "";
  try {
    decryptedDbToken = decryptRefreshToken(dbToken.refreshToken);
  } catch (error) {
    console.error(`   ❌ Decryption failed: ${(error as Error).message}\n`);
    return;
  }

  console.log(`🔐 Decrypted refresh token from DB:\n`);
  console.log(decryptedDbToken);
  console.log("\n");
}

main()
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
