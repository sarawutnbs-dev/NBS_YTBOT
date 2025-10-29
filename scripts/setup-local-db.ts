import { config } from "dotenv";
import { prisma } from "../lib/db";

// Load .env.local
config({ path: ".env.local" });

async function main() {
  console.log("Setting up local database...\n");

  // Create admin user
  const user = await prisma.user.upsert({
    where: { email: "sarawut@notebookspec.com" },
    update: {},
    create: {
      email: "sarawut@notebookspec.com",
      role: "ADMIN",
      allowed: true,
    },
  });
  console.log("✅ Admin user created:", user.email);

  // Create app settings
  const settings = await prisma.appSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      channelId: "UCpAQ8Up9IO7qG867etjxuZA",
      syncDays: 14,
      maxSyncDays: 30,
      aiTranscriptFallback: false,
    } as any,
  });
  console.log("✅ App settings created:", settings.channelId);

  // Add some sample products
  const product1 = await prisma.product.upsert({
    where: { id: "sample-1" },
    update: {},
    create: {
      id: "sample-1",
      name: "Notebook Gaming ASUS ROG",
      affiliateUrl: "https://example.com/asus-rog",
      tags: ["gaming", "laptop", "asus"],
    },
  });

  const product2 = await prisma.product.upsert({
    where: { id: "sample-2" },
    update: {},
    create: {
      id: "sample-2",
      name: "MacBook Pro M3",
      affiliateUrl: "https://example.com/macbook-pro",
      tags: ["macbook", "apple", "laptop"],
    },
  });

  console.log("✅ Sample products created");
  console.log("   -", product1.name);
  console.log("   -", product2.name);

  console.log("\n✨ Local database setup complete!");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
