import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { extractProductTags } from "@/lib/tagUtils";
import { extractBrand } from "@/lib/brandUtils";
import crypto from "crypto";
import { syncShortLinks } from "@/jobs/sync-shortlinks";

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

interface ShopeeApiResponse {
  data: {
    productOfferV2: {
      nodes: ShopeeProduct[];
      pageInfo: {
        page: number;
        limit: number;
      };
    };
  };
}

function generateSignature(timestamp: number, payload: string): string {
  const factor = `${SHOPEE_APP_ID}${timestamp}${payload}${SHOPEE_SECRET}`;
  return crypto.createHash("sha256").update(factor).digest("hex");
}

function createAffiliateLink(productLink: string): string {
  return `https://s.shopee.co.th/an_redir?origin_link=${encodeURIComponent(productLink)}&affiliate_id=${SHOPEE_AFFILIATE_ID}`;
}

async function fetchShopeeProductsPage(
  categoryId: number,
  page: number,
  limit: number = 50
): Promise<ShopeeProduct[]> {
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

  const data: ShopeeApiResponse = await response.json();
  return data.data.productOfferV2.nodes;
}

interface CategoryProducts {
  categoryId: number;
  categoryName: string;
  products: ShopeeProduct[];
}

async function fetchAllShopeeProducts(maxProductsPerCategory: number = 5000): Promise<CategoryProducts[]> {
  // Fetch all categories from database
  const categories = await (prisma as any).shopeeCategory.findMany({
    orderBy: { categoryId: 'asc' }
  });

  const allCategoryProducts: CategoryProducts[] = [];
  const limit = 50; // Shopee API limit per page (maximum allowed by Shopee)

  console.log(`📦 Fetching products from ${categories.length} categories...`);

  for (const category of categories) {
    console.log(`\n🔍 Category: ${category.name} (ID: ${category.categoryId})`);

    const categoryProducts: ShopeeProduct[] = [];
    const totalPages = Math.ceil(maxProductsPerCategory / limit);

    for (let page = 1; page <= totalPages; page++) {
      try {
        console.log(`   Fetching page ${page}/${totalPages}...`);
        const products = await fetchShopeeProductsPage(category.categoryId, page, limit);

        if (!products || products.length === 0) {
          console.log(`   No more products at page ${page}. Moving to next category.`);
          break;
        }

        categoryProducts.push(...products);
        console.log(`   Page ${page}: Got ${products.length} products (Category Total: ${categoryProducts.length})`);

        // Stop if we've reached the desired number for this category
        if (categoryProducts.length >= maxProductsPerCategory) {
          console.log(`   ✅ Reached target of ${maxProductsPerCategory} products for ${category.name}`);
          break;
        }

        // Add a small delay between requests to avoid rate limiting
        if (page < totalPages) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`   ❌ Error fetching page ${page}:`, error);
        // Continue with what we have if a page fails
        break;
      }
    }

    allCategoryProducts.push({
      categoryId: category.categoryId,
      categoryName: category.name,
      products: categoryProducts.slice(0, maxProductsPerCategory)
    });

    console.log(`✅ ${category.name}: Fetched ${categoryProducts.length} products`);

    // Delay between categories
    if (categories.indexOf(category) < categories.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return allCategoryProducts;
}

export async function POST() {
  try {
    const session = await getServerAuthSession() as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    // Delete all existing products with shopeeProductId (products from Shopee)
    const deleteResult = await prisma.product.deleteMany({
      where: {
        shopeeProductId: {
          not: null
        }
      }
    });

    console.log(`🗑️  Deleted ${deleteResult.count} existing Shopee products`);

    // Fetch products from Shopee (5000 products per category, max 50,000 total)
    const categoryProductsList = await fetchAllShopeeProducts(5000);

    if (!categoryProductsList || categoryProductsList.length === 0) {
      return NextResponse.json(
        { message: "No products found from Shopee", synced: 0, deleted: deleteResult.count },
        { status: 200 }
      );
    }

    // Sync products to database
    let syncedCount = 0;
    let totalProducts = 0;
    const results = [];
    const categoryStats: Record<string, number> = {};

    for (const categoryData of categoryProductsList) {
      const { categoryId, categoryName, products } = categoryData;

      console.log(`\n💾 Syncing ${products.length} products for category: ${categoryName}`);
      let categorySyncedCount = 0;

      for (const product of products) {
        totalProducts++;
        try {
          const affiliateLink = createAffiliateLink(product.productLink);

          // Extract tags from product name
          const tags = extractProductTags(product.productName);

          // Extract brand from tags and product name
          const brand = extractBrand(tags, product.productName);

          // Calculate price range (±10%)
          const price = parseFloat(product.price);
          const priceMin = price * 0.9;
          const priceMax = price * 1.1;

          // Create product with category name and metadata
          await prisma.product.create({
            data: {
              name: product.productName,
              price: price,
              commission: parseFloat(product.commission),
              productLink: product.productLink,
              affiliateUrl: affiliateLink,
              shopeeProductId: product.itemId.toString(),
              categoryName: categoryName,
              // Link to ShopeeCategory via unique categoryId
              shopeeCategoryId: categoryId,
              tags: tags,
              brand: brand,
              inStock: true,
              hasAffiliate: true,
              priceMin: priceMin,
              priceMax: priceMax,
            } as any
          });

          syncedCount++;
          categorySyncedCount++;
          results.push({
            productId: product.itemId,
            name: product.productName,
            category: categoryName,
            tags: tags,
            status: "synced"
          });
        } catch (error) {
          console.error(`   ❌ Failed to sync product ${product.itemId}:`, error);
          results.push({
            productId: product.itemId,
            name: product.productName,
            category: categoryName,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      categoryStats[categoryName] = categorySyncedCount;
      console.log(`   ✅ ${categoryName}: Synced ${categorySyncedCount}/${products.length} products`);
    }

    console.log(`\n🎉 Total: Synced ${syncedCount}/${totalProducts} products across ${categoryProductsList.length} categories`);

    // Trigger shortLink full sync in background (non-blocking)
    // Uses config from environment (.env.local / .env)
    ;(async () => {
      try {
        console.log("🚀 Kicking off shortLink full sync after Shopee import...");
        await syncShortLinks();
        console.log("✅ shortLink full sync finished");
      } catch (e) {
        console.error("❌ shortLink full sync failed:", e);
      }
    })();

    return NextResponse.json({
      message: `Deleted ${deleteResult.count} old products and synced ${syncedCount} new products from ${categoryProductsList.length} categories`,
      deleted: deleteResult.count,
      synced: syncedCount,
      total: totalProducts,
      categories: categoryStats,
      results,
      shortlinkSync: "started"
    }, { status: 200 });

  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      {
        error: "Failed to sync products",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
