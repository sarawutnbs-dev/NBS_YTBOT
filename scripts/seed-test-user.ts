/**
 * Seed script to create TestShopee user
 * Run: npx tsx scripts/seed-test-user.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding TestShopee user...");

  const username = "TestShopee";
  const password = "shopeeTest@!NBS2018";
  const email = "testshopee@notebookspec.com"; // Email for the test user

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);
  console.log(`Hashed password: ${hashedPassword.substring(0, 20)}...`);

  // Create or update user
  const user = await prisma.user.upsert({
    where: { username },
    update: {
      password: hashedPassword,
      email,
      role: "USER",
      allowed: true,
    },
    create: {
      username,
      password: hashedPassword,
      email,
      role: "USER",
      allowed: true,
    },
  });

  console.log("✅ TestShopee user created/updated:");
  console.log(`   ID: ${user.id}`);
  console.log(`   Username: ${user.username}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Role: ${user.role}`);
  console.log(`   Allowed: ${user.allowed}`);
  console.log("\n📝 Login credentials:");
  console.log(`   Username: ${username}`);
  console.log(`   Password: ${password}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("❌ Error seeding user:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
