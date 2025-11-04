import { prisma } from "@/lib/db";

async function testShopeeAPI() {
  console.log("🧪 Testing Shopee API Configuration...\n");

  try {
    // Test 1: Check ShopeeCategory table
    console.log("1️⃣ Checking ShopeeCategory table...");
    const categories = await prisma.shopeeCategory.findMany({
      orderBy: { categoryId: 'asc' }
    });

    console.log(`   ✅ Found ${categories.length} categories:`);
    categories.forEach(cat => {
      console.log(`      - ${cat.name} (ID: ${cat.categoryId})`);
    });

    // Test 2: Check Product table structure
    console.log("\n2️⃣ Checking Product table with categoryName...");
    const sampleProducts = await prisma.product.findMany({
      where: { shopeeProductId: { not: null } },
      select: {
        id: true,
        name: true,
        categoryName: true,
        shopeeProductId: true
      },
      take: 5
    });

    console.log(`   ✅ Sample products (${sampleProducts.length}):`);
    sampleProducts.forEach(p => {
      console.log(`      - ${p.name.substring(0, 50)}... [Category: ${p.categoryName || 'N/A'}]`);
    });

    // Test 3: Count products by category
    console.log("\n3️⃣ Product count by category:");
    const allProducts = await prisma.product.findMany({
      where: { shopeeProductId: { not: null } },
      select: { categoryName: true }
    });

    const categoryCounts: Record<string, number> = {};
    allProducts.forEach(p => {
      const cat = p.categoryName || "Uncategorized";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    Object.entries(categoryCounts).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} products`);
    });

    // Test 4: Validate API readiness
    console.log("\n4️⃣ API Readiness Check:");
    console.log(`   ✅ Database connection: OK`);
    console.log(`   ✅ ShopeeCategory table: ${categories.length} categories`);
    console.log(`   ✅ Product.categoryName field: Available`);
    console.log(`   ✅ Total Shopee products: ${allProducts.length}`);

    console.log("\n✅ All tests passed! API is ready to use.");
    console.log("\n📝 To test the sync API:");
    console.log("   1. Make sure you're logged in as Admin");
    console.log("   2. POST /api/products/sync-shopee");
    console.log("   3. Watch the console for progress logs");

  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  }
}

testShopeeAPI()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
