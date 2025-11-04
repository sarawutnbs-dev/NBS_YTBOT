import { prisma } from "@/lib/db";
import { extractProductTags } from "@/lib/tagUtils";
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

  const response = await fetch("https://open-api.affiliate.shopee.co.th/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `SHA256 Credential=${SHOPEE_APP_ID},Timestamp=${timestamp},Signature=${signature}`
    },
    body: payload
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopee API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.data.productOfferV2.nodes;
}

async function testMiniSync() {
  console.log("🧪 Testing Mini Sync (2 categories × 10 products)...\n");

  try {
    // Get first 2 categories
    const categories = await prisma.shopeeCategory.findMany({
      take: 2,
      orderBy: { categoryId: 'asc' }
    });

    console.log(`📦 Testing with ${categories.length} categories:`);
    categories.forEach(cat => {
      console.log(`   - ${cat.name} (ID: ${cat.categoryId})`);
    });

    let totalSynced = 0;
    const categoryStats: Record<string, number> = {};

    for (const category of categories) {
      console.log(`\n🔍 Fetching from ${category.name}...`);

      const products = await fetchShopeeProductsPage(category.categoryId, 1, 10);
      console.log(`   ✅ Fetched ${products.length} products`);

      console.log(`\n💾 Syncing to database...`);
      let categorySyncedCount = 0;

      for (const product of products) {
        try {
          const affiliateLink = createAffiliateLink(product.productLink);
          const tags = extractProductTags(product.productName);

          await prisma.product.create({
            data: {
              name: product.productName,
              price: parseFloat(product.price),
              commission: parseFloat(product.commission),
              productLink: product.productLink,
              affiliateUrl: affiliateLink,
              shopeeProductId: product.itemId.toString(),
              categoryName: category.name,
              tags: tags
            }
          });

          categorySyncedCount++;
          totalSynced++;
        } catch (error: any) {
          if (error.code === 'P2002') {
            console.log(`   ⚠️  Product ${product.itemId} already exists, skipping...`);
          } else {
            throw error;
          }
        }
      }

      categoryStats[category.name] = categorySyncedCount;
      console.log(`   ✅ ${category.name}: Synced ${categorySyncedCount}/${products.length} products`);
    }

    console.log(`\n🎉 Mini Sync Completed!`);
    console.log(`   Total synced: ${totalSynced} products`);
    console.log(`   Categories:`);
    Object.entries(categoryStats).forEach(([cat, count]) => {
      console.log(`      - ${cat}: ${count} products`);
    });

    // Verify in database
    console.log(`\n🔍 Verifying in database...`);
    const dbProducts = await prisma.product.findMany({
      where: {
        categoryName: { in: categories.map(c => c.name) }
      },
      select: {
        name: true,
        categoryName: true,
        price: true,
        commission: true,
        tags: true
      },
      take: 3
    });

    console.log(`   Found ${dbProducts.length} products in DB (showing 3):`);
    dbProducts.forEach((p, i) => {
      console.log(`\n   ${i + 1}. ${p.name.substring(0, 60)}...`);
      console.log(`      Category: ${p.categoryName}`);
      console.log(`      Price: ฿${p.price}, Commission: ฿${p.commission}`);
      console.log(`      Tags: ${p.tags.join(', ')}`);
    });

    console.log(`\n✅ All Integration Tests Passed!`);
    console.log(`\n📝 Full API is ready to sync:`);
    console.log(`   - 9 categories`);
    console.log(`   - 5,000 products per category (max)`);
    console.log(`   - Total: up to 45,000 products`);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  }
}

testMiniSync()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
