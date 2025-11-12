/**
 * Test ensure-missing functionality
 */

import "dotenv/config";
import { ensureMissing } from "@/lib/videoIndexService";

async function main() {
  console.log("=== Testing Ensure Missing ===\n");

  try {
    const result = await ensureMissing();

    console.log("\n=== Result ===");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n✅ Test completed successfully");
  } catch (error) {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
