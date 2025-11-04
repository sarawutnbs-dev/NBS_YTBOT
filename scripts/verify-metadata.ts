import { prisma } from "@/lib/db";

async function verifyMetadata() {
  console.log("🔍 Verifying Product Metadata...\n");

  // Count products with metadata
  const total = await prisma.product.count({
    where: { shopeeProductId: { not: null } }
  });

  const withBrand = await prisma.product.count({
    where: {
      shopeeProductId: { not: null },
      brand: { not: null }
    }
  });

  const withPriceRange = await prisma.product.count({
    where: {
      shopeeProductId: { not: null },
      priceMin: { not: null },
      priceMax: { not: null }
    }
  });

  console.log(`📊 Metadata Statistics:`);
  console.log(`   Total products: ${total}`);
  console.log(`   With brand: ${withBrand} (${Math.round(withBrand/total*100)}%)`);
  console.log(`   With price range: ${withPriceRange} (${Math.round(withPriceRange/total*100)}%)`);

  // Sample products with brands
  console.log(`\n📦 Sample Products with Brands:`);
  const samples = await prisma.product.findMany({
    where: {
      shopeeProductId: { not: null },
      brand: { not: null }
    },
    select: {
      name: true,
      brand: true,
      categoryName: true,
      price: true,
      priceMin: true,
      priceMax: true,
      tags: true,
      inStock: true,
      hasAffiliate: true
    },
    take: 10
  });

  samples.forEach((p, i) => {
    console.log(`\n${i + 1}. ${p.name.substring(0, 60)}...`);
    console.log(`   Brand: ${p.brand}`);
    console.log(`   Category: ${p.categoryName}`);
    console.log(`   Price: ฿${p.price} (Range: ฿${p.priceMin?.toFixed(0)} - ฿${p.priceMax?.toFixed(0)})`);
    console.log(`   Tags: ${p.tags.join(', ')}`);
    console.log(`   Stock: ${p.inStock}, Affiliate: ${p.hasAffiliate}`);
  });

  // Brand distribution
  console.log(`\n📈 Brand Distribution (Top 10):`);
  const brandCounts = await prisma.$queryRaw<Array<{brand: string, count: bigint}>>`
    SELECT brand, COUNT(*) as count
    FROM "Product"
    WHERE "shopeeProductId" IS NOT NULL
      AND brand IS NOT NULL
    GROUP BY brand
    ORDER BY count DESC
    LIMIT 10
  `;

  brandCounts.forEach((b, i) => {
    console.log(`   ${i + 1}. ${b.brand}: ${b.count} products`);
  });

  // Category distribution
  console.log(`\n📂 Category Distribution:`);
  const categoryCounts = await prisma.$queryRaw<Array<{categoryName: string, count: bigint}>>`
    SELECT "categoryName", COUNT(*) as count
    FROM "Product"
    WHERE "shopeeProductId" IS NOT NULL
      AND "categoryName" IS NOT NULL
    GROUP BY "categoryName"
    ORDER BY count DESC
  `;

  categoryCounts.forEach((c, i) => {
    console.log(`   ${i + 1}. ${c.categoryName}: ${c.count} products`);
  });

  console.log(`\n✅ Metadata verification complete!`);
}

verifyMetadata()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
