/**
 * Reset all POSTED drafts back to PENDING
 * This allows them to be reprocessed by the reply system
 */

import { prisma } from "../lib/db";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env first, then override with .env.local
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ override: true });

async function resetPostedToPending() {
  console.log("\n🔄 Resetting POSTED drafts to PENDING...\n");

  try {
    const result = await prisma.draft.updateMany({
      where: {
        status: "POSTED"
      },
      data: {
        status: "PENDING",
        postedAt: null
      }
    });

    console.log(`✅ Successfully reset ${result.count} draft(s) from POSTED to PENDING\n`);

    // Show summary
    const pendingCount = await prisma.draft.count({ where: { status: "PENDING" } });
    const postedCount = await prisma.draft.count({ where: { status: "POSTED" } });
    const rejectedCount = await prisma.draft.count({ where: { status: "REJECTED" } });

    console.log("📊 Current draft status counts:");
    console.log(`   PENDING: ${pendingCount}`);
    console.log(`   POSTED: ${postedCount}`);
    console.log(`   REJECTED: ${rejectedCount}`);
    console.log("");

  } catch (error: any) {
    console.error("\n❌ Error resetting drafts:", error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetPostedToPending().catch((error) => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
