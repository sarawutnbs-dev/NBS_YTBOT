import { prisma } from "@/lib/db";
import { extractProductTags } from "@/lib/tagUtils";
import { extractBrand } from "@/lib/brandUtils";
import crypto from "crypto";

const SHOPEE_APP_ID = "15175090000";
const SHOPEE_SECRET = "535F3JN5SXEIGCKH6M5VZLECUCKJN64K";
const SHOPEE_AFFILIATE_ID = "15175090000";

interface ShopeeProduct {
  itemId: string;
  productName: string;
  price: string;
  commission: string;
  commissionRate: string;
  productLink: string;
  offerLink: string;
  shopName: string;
  imageUrl: string;
  sales: number;
}

function generateSignature(timestamp: number, payload: string): string {
  const factor = `${SHOPEE_APP_ID}${timestamp}${payload}${SHOPEE_SECRET}`;
  return crypto.createHash("sha256").update(factor).digest("hex");
}

function createAffiliateLink(productLink: string): string {
  return `https://s.shopee.co.th/an_redir?origin_link=${encodeURIComponent(productLink)}&affiliate_id=${SHOPEE_AFFILIATE_ID}`;
}

async function fetchShopeeProductsPage(categoryId: number, page: number, limit: number): Promise<ShopeeProduct[]> {
  const timestamp = Math.floor(Date.now() / 1000);

  const query = `
    query {
      productOfferV2(
        productCatId: ${categoryId}
        listType: 1
        sortType: 1
        page: ${page}
        limit: ${limit}
        isAMSOffer: true
        isKeySeller: true
      ) {
        nodes {
          itemId
          productName
          price
          commission
          commissionRate
          productLink
          offerLink
          shopName
          imageUrl
          sales
        }
        pageInfo {
          page
          limit
        }
      }
    }
  `;

  const payload = JSON.stringify({ query });
  const signature = generateSignature(timestamp, payload);

  console.log(`   📡 Calling Shopee API...`);
  console.log(`      Category: ${categoryId}, Page: ${page}, Limit: ${limit}`);
  console.log(`      Timestamp: ${timestamp}`);

  const response = await fetch("https://open-api.affiliate.shopee.co.th/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `SHA256 Credential=${SHOPEE_APP_ID},Timestamp=${timestamp},Signature=${signature}`
    },
    body: payload
  });

  console.log(`      Response Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`      ❌ API Error: ${errorText}`);
    throw new Error(`Shopee API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (!data.data?.productOfferV2?.nodes) {
    console.error(`      ❌ Unexpected response structure:`, JSON.stringify(data, null, 2));
    throw new Error("Invalid response structure from Shopee API");
  }

  return data.data.productOfferV2.nodes;
}

async function testSync100() {
  console.log("🧪 Testing Sync 100 Products from Notebook Category\n");

  try {
    // Delete existing Shopee products
    console.log("1️⃣ Cleaning up existing products...");
    const deleteResult = await prisma.product.deleteMany({
      where: { shopeeProductId: { not: null } }
    });
    console.log(`   🗑️  Deleted ${deleteResult.count} existing products\n`);

    // Get Notebook category
    console.log("2️⃣ Fetching Notebook category...");
    const category = await prisma.shopeeCategory.findUnique({
      where: { categoryId: 101942 }
    });

    if (!category) {
      throw new Error("Notebook category not found! Run seed script first.");
    }
    console.log(`   ✅ Found category: ${category.name} (ID: ${category.categoryId})\n`);

    // Fetch 100 products (2 pages × 50)
    console.log("3️⃣ Fetching 100 products from Shopee API (2 pages)...");
    const page1 = await fetchShopeeProductsPage(category.categoryId, 1, 50);
    console.log(`   ✅ Page 1: ${page1.length} products`);

    await new Promise(resolve => setTimeout(resolve, 500)); // Delay between requests

    const page2 = await fetchShopeeProductsPage(category.categoryId, 2, 50);
    console.log(`   ✅ Page 2: ${page2.length} products`);

    const products = [...page1, ...page2];
    console.log(`   ✅ Total fetched: ${products.length} products\n`);

    if (products.length === 0) {
      console.log("   ⚠️  No products returned from API!");
      return;
    }

    // Show sample products
    console.log("   📦 Sample products:");
    products.slice(0, 3).forEach((p, i) => {
      console.log(`      ${i + 1}. ${p.productName.substring(0, 60)}...`);
      console.log(`         Price: ฿${p.price}, Commission: ฿${p.commission}`);
    });
    console.log("");

    // Sync to database
    console.log("4️⃣ Syncing to database...");
    let syncedCount = 0;
    const errors: any[] = [];

    for (const product of products) {
      try {
        const affiliateLink = createAffiliateLink(product.productLink);
        const tags = extractProductTags(product.productName);
        const brand = extractBrand(tags, product.productName);

        const price = parseFloat(product.price);
        const priceMin = price * 0.9;
        const priceMax = price * 1.1;

        await prisma.product.create({
          data: {
            name: product.productName,
            price: price,
            commission: parseFloat(product.commission),
            productLink: product.productLink,
            affiliateUrl: affiliateLink,
            shopeeProductId: product.itemId.toString(),
            categoryName: category.name,
            tags: tags,
            brand: brand,
            inStock: true,
            hasAffiliate: true,
            priceMin: priceMin,
            priceMax: priceMax,
          }
        });

        syncedCount++;

        if (syncedCount % 20 === 0) {
          console.log(`   💾 Synced ${syncedCount}/${products.length} products...`);
        }
      } catch (error: any) {
        console.error(`   ❌ Failed to sync product ${product.itemId}:`, error.message);
        errors.push({
          productId: product.itemId,
          name: product.productName,
          error: error.message
        });
      }
    }

    console.log(`\n✅ Sync Complete!`);
    console.log(`   Total products fetched: ${products.length}`);
    console.log(`   Successfully synced: ${syncedCount}`);
    console.log(`   Failed: ${errors.length}`);

    if (errors.length > 0) {
      console.log(`\n   ❌ Errors:`);
      errors.slice(0, 5).forEach(e => {
        console.log(`      - Product ${e.productId}: ${e.error}`);
      });
    }

    // Verify in database
    console.log(`\n5️⃣ Verifying in database...`);
    const dbCount = await prisma.product.count({
      where: { shopeeProductId: { not: null } }
    });
    console.log(`   ✅ Found ${dbCount} products in database`);

    const sampleDb = await prisma.product.findMany({
      where: { categoryName: category.name },
      take: 3,
      select: {
        name: true,
        price: true,
        commission: true,
        categoryName: true,
        tags: true
      }
    });

    console.log(`\n   📦 Sample from database:`);
    sampleDb.forEach((p, i) => {
      console.log(`      ${i + 1}. ${p.name.substring(0, 60)}...`);
      console.log(`         Category: ${p.categoryName}`);
      console.log(`         Price: ฿${p.price}, Commission: ฿${p.commission}`);
      console.log(`         Tags: ${p.tags.join(', ')}`);
    });

    console.log(`\n🎉 Test completed successfully!`);
    console.log(`\n📝 Next steps:`);
    console.log(`   - Check Prisma Studio at http://localhost:5555`);
    console.log(`   - If everything looks good, run full sync via API`);

  } catch (error: any) {
    console.error("\n❌ Test failed:", error);
    console.error("Stack trace:", error.stack);
    throw error;
  }
}

testSync100()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
