import { config } from "dotenv";
import { resolve } from "path";
import { prisma } from "@/lib/db";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const email = "sarawut@notebookspec.com";

  const existing = await prisma.user.findUnique({
    where: { email }
  });

  if (existing) {
    console.log(`✅ User already exists: ${existing.email} (role=${existing.role}, allowed=${existing.allowed})`);
  } else {
    const created = await prisma.user.create({
      data: {
        email,
        role: "ADMIN",
        allowed: true
      }
    });

    console.log(`✨ Created user: ${created.email} (role=${created.role}, allowed=${created.allowed})`);
  }
}

main()
  .catch((error) => {
    console.error("❌ Failed to check/create user", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
