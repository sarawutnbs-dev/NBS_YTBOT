import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import crypto from "crypto";

const SHOPEE_APP_ID = "15175090000";
const SHOPEE_SECRET = "535F3JN5SXEIGCKH6M5VZLECUCKJN64K";
const SHOPEE_AFFILIATE_ID = "15175090000";
const PRODUCT_CAT_ID = 101942;

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

async function fetchShopeeProducts(): Promise<ShopeeProduct[]> {
  const timestamp = Math.floor(Date.now() / 1000);

  const query = `
    query {
      productOfferV2(
        productCatId: ${PRODUCT_CAT_ID}
        listType: 1
        sortType: 5
        page: 20
        limit: 50
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

    console.log(`Deleted ${deleteResult.count} existing Shopee products`);

    // Fetch products from Shopee
    const shopeeProducts = await fetchShopeeProducts();

    if (!shopeeProducts || shopeeProducts.length === 0) {
      return NextResponse.json(
        { message: "No products found from Shopee", synced: 0, deleted: deleteResult.count },
        { status: 200 }
      );
    }

    // Sync products to database
    let syncedCount = 0;
    const results = [];

    for (const product of shopeeProducts) {
      try {
        const affiliateLink = createAffiliateLink(product.productLink);

        // Create product
        const createdProduct = await prisma.product.create({
          data: {
            name: product.productName,
            price: parseFloat(product.price),
            commission: parseFloat(product.commission),
            productLink: product.productLink,
            affiliateUrl: affiliateLink,
            shopeeProductId: product.itemId.toString(),
            tags: []
          }
        });

        syncedCount++;
        results.push({
          productId: product.itemId,
          name: product.productName,
          status: "synced"
        });
      } catch (error) {
        console.error(`Failed to sync product ${product.itemId}:`, error);
        results.push({
          productId: product.itemId,
          name: product.productName,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return NextResponse.json({
      message: `Deleted ${deleteResult.count} old products and synced ${syncedCount} new products`,
      deleted: deleteResult.count,
      synced: syncedCount,
      total: shopeeProducts.length,
      results
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
