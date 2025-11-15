import { PrismaClient, type UserRole } from "@prisma/client";
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();

const prisma = new PrismaClient();

function parseBool(value?: string) {
  if (!value) return true;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

async function main() {
  const [, , rawEmail, rawRole, rawAllowed, rawUsername, rawPassword] = process.argv;

  if (!rawEmail) {
    console.error("Usage: tsx scripts/add-user.ts <email> [role=ADMIN] [allowed=true] [username] [password]");
    process.exit(1);
  }

  const email = rawEmail.trim();
  const upperRole = rawRole?.toUpperCase() as UserRole | undefined;
  const role: UserRole = upperRole && ["ADMIN", "USER"].includes(upperRole) ? upperRole : "ADMIN";
  const allowed = parseBool(rawAllowed);
  const username = rawUsername?.trim() || undefined;
  const passwordHash = rawPassword ? await bcrypt.hash(rawPassword, 10) : undefined;

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      allowed,
      role,
      username,
      password: passwordHash ?? undefined
    },
    create: {
      email,
      role,
      allowed,
      username,
      password: passwordHash
    }
  });

  console.log("✅ User created/updated:", user);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
