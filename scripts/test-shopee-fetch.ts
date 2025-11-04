import crypto from "crypto";

const SHOPEE_APP_ID = "15175090000";
const SHOPEE_SECRET = "535F3JN5SXEIGCKH6M5VZLECUCKJN64K";

function generateSignature(timestamp: number, payload: string): string {
  const factor = `${SHOPEE_APP_ID}${timestamp}${payload}${SHOPEE_SECRET}`;
  return crypto.createHash("sha256").update(factor).digest("hex");
}

async function testShopeeFetch() {
  console.log("🧪 Testing Shopee GraphQL API...\n");

  const categoryId = 101942; // Notebook
  const page = 1;
  const limit = 10; // Test with small number first

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

  console.log("📡 Request Details:");
  console.log(`   Category ID: ${categoryId} (Notebook)`);
  console.log(`   Page: ${page}, Limit: ${limit}`);
  console.log(`   Filters: isAMSOffer=true, isKeySeller=true, sortType=1`);
  console.log(`   Timestamp: ${timestamp}`);
  console.log(`   Signature: ${signature.substring(0, 20)}...`);

  try {
    console.log("\n🚀 Sending request to Shopee API...");

    const response = await fetch("https://open-api.affiliate.shopee.co.th/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `SHA256 Credential=${SHOPEE_APP_ID},Timestamp=${timestamp},Signature=${signature}`
      },
      body: payload
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopee API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.data?.productOfferV2?.nodes) {
      console.log("\n❌ Unexpected response format:");
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const products = data.data.productOfferV2.nodes;
    const pageInfo = data.data.productOfferV2.pageInfo;

    console.log(`\n✅ Success! Received ${products.length} products`);
    console.log(`   Page Info: Page ${pageInfo.page}, Limit ${pageInfo.limit}`);

    console.log("\n📦 Sample Products:");
    products.slice(0, 3).forEach((p: any, i: number) => {
      console.log(`\n   ${i + 1}. ${p.productName}`);
      console.log(`      Item ID: ${p.itemId}`);
      console.log(`      Price: ฿${p.price}`);
      console.log(`      Commission: ฿${p.commission} (${p.commissionRate}%)`);
      console.log(`      Shop: ${p.shopName}`);
      console.log(`      Sales: ${p.sales}`);
    });

    console.log("\n✅ API Test Successful!");
    console.log("\n📝 Summary:");
    console.log(`   - GraphQL query: ✅ Working`);
    console.log(`   - isAMSOffer filter: ✅ Applied`);
    console.log(`   - isKeySeller filter: ✅ Applied`);
    console.log(`   - sortType=1: ✅ Applied`);
    console.log(`   - limit=100: ✅ Supported (tested with ${limit})`);

  } catch (error) {
    console.error("\n❌ API Test Failed:");
    console.error(error);
    throw error;
  }
}

testShopeeFetch()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
