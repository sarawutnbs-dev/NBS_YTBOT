/**
 * Check if user exists in database
 */

import { prisma } from "./lib/db";

async function checkUser() {
  const email = "sarawut@notebookspec.com";

  console.log(`\n🔍 Checking user: ${email}\n`);
  console.log("=".repeat(80));

  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (user) {
    console.log("\n✅ User FOUND:");
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Allowed: ${user.allowed ? '✅ YES' : '❌ NO'}`);
    console.log(`   Created: ${user.createdAt}`);
    console.log(`   Updated: ${user.updatedAt}`);
  } else {
    console.log("\n❌ User NOT FOUND");
    console.log("\n💡 Creating user now...");

    // Create the user
    const newUser = await prisma.user.create({
      data: {
        email,
        role: "ADMIN",
        allowed: true,
      }
    });

    console.log("\n✅ User CREATED:");
    console.log(`   ID: ${newUser.id}`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Role: ${newUser.role}`);
    console.log(`   Allowed: ${newUser.allowed ? '✅ YES' : '❌ NO'}`);
  }

  console.log("\n" + "=".repeat(80));

  // Show all allowed users
  const allowedUsers = await prisma.user.findMany({
    where: { allowed: true },
    select: {
      email: true,
      role: true,
    }
  });

  console.log(`\n📋 All allowed users (${allowedUsers.length}):`);
  allowedUsers.forEach((u, i) => {
    console.log(`   ${i + 1}. ${u.email} (${u.role})`);
  });

  console.log("");

  await prisma.$disconnect();
}

checkUser();
