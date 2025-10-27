import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

// โหลด environment variables จาก .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

async function main() {
  console.log("🗑️  Deleting all data...");

  // ลบข้อมูลตามลำดับ (เพื่อไม่ให้ติด foreign key constraints)
  await prisma.videoIndex.deleteMany({});
  console.log("✅ Deleted all VideoIndex records");

  await prisma.comment.deleteMany({});
  console.log("✅ Deleted all Comment records");

  await prisma.product.deleteMany({});
  console.log("✅ Deleted all Product records");

  await prisma.user.deleteMany({});
  console.log("✅ Deleted all User records");

  console.log("🎉 Database reset complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
