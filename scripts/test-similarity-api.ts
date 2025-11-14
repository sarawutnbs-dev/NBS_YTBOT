/**
 * Test the similarity search API endpoint
 */

import axios from "axios";

async function testSimilarityAPI() {
  console.log("=".repeat(60));
  console.log("Testing Similarity Search API");
  console.log("=".repeat(60));

  try {
    const testQuery = "ต้องการ Notebook gaming 40K";
    const videoId = "dWL68XA91qo";

    console.log(`\nQuery: "${testQuery}"`);
    console.log(`Video ID: ${videoId}`);
    console.log("\nCalling API...\n");

    const startTime = Date.now();

    const response = await axios.post("http://localhost:3000/api/similarity/search", {
      query: testQuery,
      videoId: videoId,
      topK: 20
    }, {
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 60000 // 60 second timeout
    });

    const duration = Date.now() - startTime;

    console.log(`✅ API Response received in ${duration}ms\n`);
    console.log("=".repeat(60));
    console.log("Response Data:");
    console.log("=".repeat(60));

    const data = response.data;

    console.log(`\n📊 Metrics:`);
    console.log(`   Total Time: ${data.metrics.totalTime}ms`);
    console.log(`   Embedding Time: ${data.metrics.embeddingTime}ms`);
    console.log(`   Transcript Time: ${data.metrics.transcriptTime}ms`);
    console.log(`   Product Time: ${data.metrics.productTime}ms`);
    console.log(`   Transcript Count: ${data.metrics.transcriptCount}`);
    console.log(`   Product Count: ${data.metrics.productCount}`);

    console.log(`\n📝 Transcripts (${data.transcripts.length}):`);
    data.transcripts.slice(0, 3).forEach((t: any, i: number) => {
      console.log(`   ${i + 1}. Score: ${(t.score * 100).toFixed(1)}% - ${t.text.substring(0, 60)}...`);
    });

    console.log(`\n🛍️  Products (Top 10):`);
    data.products.slice(0, 10).forEach((p: any, i: number) => {
      console.log(`   ${i + 1}. Score: ${(p.score * 100).toFixed(1)}% - ${p.name.substring(0, 50)}...`);
      console.log(`      Price: ${p.price ? p.price.toLocaleString() + " ฿" : "N/A"}`);
      console.log(`      URL: ${p.shortUrl || "N/A"}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("✅ Test completed successfully!");
    console.log("=".repeat(60));

  } catch (error: any) {
    console.error("\n❌ Error:");

    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.data?.error || error.response.data?.message || "Unknown error"}`);
      console.error(`   Details:`, error.response.data);
    } else if (error.request) {
      console.error("   No response received from server");
      console.error("   Make sure the server is running on http://localhost:3000");
    } else {
      console.error(`   ${error.message}`);
    }

    process.exit(1);
  }
}

testSimilarityAPI();
