/**
 * Test script for generateDraftsForCommentsWithRAG
 */

import { generateDraftsForCommentsWithRAG } from "@/lib/draftServiceWithRAG";

async function main() {
  console.log("🧪 Testing generateDraftsForCommentsWithRAG...\n");

  try {
    const result = await generateDraftsForCommentsWithRAG();
    
    console.log("\n✅ Test completed successfully!");
    console.log("Result:", JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  }
}

main();
