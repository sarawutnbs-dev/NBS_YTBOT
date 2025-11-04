import { prisma } from "@/lib/db";

const SHOPEE_CATEGORIES = [
  { categoryId: 101942, name: "Notebook" },
  { categoryId: 101994, name: "Notebook Chargers & Adaptors" },
  { categoryId: 101949, name: "Fans & Heatsinks" },
  { categoryId: 101950, name: "CPU" },
  { categoryId: 101951, name: "Mainboard" },
  { categoryId: 101952, name: "Graphics Cards / VGA" },
  { categoryId: 101954, name: "PSU" },
  { categoryId: 101955, name: "RAM" },
  { categoryId: 101957, name: "PC Cases" },
];

async function main() {
  console.log("🌱 Seeding Shopee categories...");

  // Seed categories
  for (const category of SHOPEE_CATEGORIES) {
    await prisma.shopeeCategory.upsert({
      where: { categoryId: category.categoryId },
      update: { name: category.name },
      create: {
        categoryId: category.categoryId,
        name: category.name,
      },
    });
    console.log(`✅ Category: ${category.name} (${category.categoryId})`);
  }

  // Update existing products to have "Notebook" as category
  const updateResult = await prisma.product.updateMany({
    where: {
      shopeeProductId: { not: null },
      categoryName: null,
    },
    data: {
      categoryName: "Notebook",
    },
  });

  console.log(`\n✅ Updated ${updateResult.count} existing products with category "Notebook"`);
  console.log("🎉 Seeding completed!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding categories:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
