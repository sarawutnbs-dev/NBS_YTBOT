/**
 * Reset all POSTED drafts back to PENDING status
 */

import { prisma } from "./lib/db";

async function resetPostedToPending() {
  console.log("\n🔄 Resetting POSTED drafts to PENDING...\n");
  console.log("=".repeat(80));

  try {
    // Find all POSTED drafts
    const postedDrafts = await prisma.draft.findMany({
      where: {
        status: "POSTED"
      },
      include: {
        comment: {
          select: {
            id: true,
            authorDisplayName: true,
            textOriginal: true
          }
        }
      }
    });

    console.log(`\n📊 Found ${postedDrafts.length} POSTED draft(s)\n`);

    if (postedDrafts.length === 0) {
      console.log("✅ No POSTED drafts found. Nothing to update.\n");
      await prisma.$disconnect();
      return;
    }

    // Show details of what will be changed
    console.log("📋 Drafts that will be changed from POSTED to PENDING:\n");
    postedDrafts.forEach((draft, index) => {
      console.log(`   ${index + 1}. Draft ID: ${draft.id}`);
      console.log(`      Comment: ${draft.comment?.textOriginal?.substring(0, 50)}...`);
      console.log(`      Author: ${draft.comment?.authorDisplayName}`);
      console.log(`      Reply: ${draft.reply?.substring(0, 50)}...`);
      console.log("");
    });

    console.log("=".repeat(80));
    console.log("\n⚠️  Are you sure you want to change these drafts to PENDING?");
    console.log("   This will allow them to be posted again.\n");

    // Update all POSTED drafts to PENDING
    const result = await prisma.draft.updateMany({
      where: {
        status: "POSTED"
      },
      data: {
        status: "PENDING",
        postedAt: null // Also clear the posted timestamp
      }
    });

    console.log("=".repeat(80));
    console.log("\n✅ SUCCESS!\n");
    console.log(`📝 Updated ${result.count} draft(s) from POSTED to PENDING\n`);

    // Verify the changes
    const pendingCount = await prisma.draft.count({
      where: {
        status: "PENDING"
      }
    });

    const postedCount = await prisma.draft.count({
      where: {
        status: "POSTED"
      }
    });

    console.log("📊 Current status counts:");
    console.log(`   PENDING: ${pendingCount}`);
    console.log(`   POSTED: ${postedCount}`);
    console.log("");

    console.log("=".repeat(80));
    console.log("\n💡 Next steps:");
    console.log("   1. Refresh the moderation page to see the changes");
    console.log("   2. The drafts are now PENDING and can be posted again");
    console.log("   3. Use the Post button in the UI to post them to YouTube\n");

  } catch (error) {
    console.error("\n❌ Error resetting drafts:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetPostedToPending().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
