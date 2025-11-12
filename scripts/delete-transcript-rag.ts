/**
 * Delete all transcript RAG chunks and documents
 *
 * เนื่องจาก RAG V2 ไม่ใช้ transcript chunks อีกต่อไป (ใช้ full transcript แทน)
 * Script นี้จะลบ transcript chunks ออกจาก RagChunk และ RagDocument
 *
 * Run: npx tsx scripts/delete-transcript-rag.ts
 * Options:
 *   --dry-run    - Show what would be deleted without actually deleting
 *   --confirm    - Skip confirmation prompt
 */

import { PrismaClient } from "@prisma/client";
import readline from "readline";

const prisma = new PrismaClient();

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipConfirm = args.includes("--confirm");

  console.log("=== Delete Transcript RAG Chunks ===\n");
  console.log("⚠️  WARNING: This will delete all transcript data from RAG system");
  console.log("   - RagDocument (sourceType = 'transcript')");
  console.log("   - RagChunk (all chunks belonging to transcript documents)");
  console.log("\n💡 Note: RAG V2 doesn't need transcript chunks anymore (uses full transcript instead)\n");

  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No data will be deleted\n");
  }

  try {
    // 1. Count existing data
    console.log("📊 Checking current data...\n");

    const transcriptDocs = await prisma.ragDocument.count({
      where: { sourceType: "transcript" },
    });

    const transcriptChunks = await prisma.ragChunk.count({
      where: {
        document: {
          sourceType: "transcript",
        },
      },
    });

    console.log(`Found:`);
    console.log(`  - Transcript Documents: ${transcriptDocs}`);
    console.log(`  - Transcript Chunks: ${transcriptChunks}`);

    if (transcriptDocs === 0) {
      console.log("\n✅ No transcript documents found. Nothing to delete.");
      return;
    }

    // 2. Show sample data
    const sampleDocs = await prisma.ragDocument.findMany({
      where: { sourceType: "transcript" },
      select: {
        id: true,
        sourceId: true,
        meta: true,
        _count: {
          select: { chunks: true },
        },
      },
      take: 5,
    });

    console.log(`\n📋 Sample documents (showing first 5):`);
    sampleDocs.forEach((doc) => {
      const meta = doc.meta as any;
      console.log(`  - Doc #${doc.id}: Video ${doc.sourceId} "${meta?.title || "Unknown"}" (${doc._count.chunks} chunks)`);
    });

    // 3. Confirmation
    if (!dryRun && !skipConfirm) {
      console.log("\n❓ Are you sure you want to delete ALL transcript RAG data?");
      console.log("   This action CANNOT be undone!");
      const confirmed = await askConfirmation("\nType 'yes' or 'y' to confirm: ");

      if (!confirmed) {
        console.log("\n❌ Deletion cancelled by user");
        return;
      }
    }

    if (dryRun) {
      console.log("\n🔍 DRY RUN: Would delete:");
      console.log(`   - ${transcriptDocs} documents`);
      console.log(`   - ${transcriptChunks} chunks`);
      console.log("\nRun without --dry-run to actually delete");
      return;
    }

    // 4. Delete data
    console.log("\n🗑️  Deleting transcript RAG data...\n");

    // Delete RagDocuments (chunks will be cascade deleted via foreign key)
    console.log("Deleting RagDocuments (sourceType = 'transcript')...");
    const deleteResult = await prisma.ragDocument.deleteMany({
      where: { sourceType: "transcript" },
    });

    console.log(`✅ Deleted ${deleteResult.count} documents`);

    // Verify deletion
    const remainingDocs = await prisma.ragDocument.count({
      where: { sourceType: "transcript" },
    });

    const remainingChunks = await prisma.ragChunk.count({
      where: {
        document: {
          sourceType: "transcript",
        },
      },
    });

    if (remainingDocs === 0 && remainingChunks === 0) {
      console.log("\n✅ All transcript RAG data deleted successfully!");
    } else {
      console.warn("\n⚠️  Warning: Some data may remain:");
      console.warn(`   - Documents: ${remainingDocs}`);
      console.warn(`   - Chunks: ${remainingChunks}`);
    }

    // 5. Show remaining data stats
    console.log("\n📊 Remaining RAG data:");

    const productDocs = await prisma.ragDocument.count({
      where: { sourceType: "product" },
    });

    const productChunks = await prisma.ragChunk.count({
      where: {
        document: {
          sourceType: "product",
        },
      },
    });

    const commentDocs = await prisma.ragDocument.count({
      where: { sourceType: "comment" },
    });

    const commentChunks = await prisma.ragChunk.count({
      where: {
        document: {
          sourceType: "comment",
        },
      },
    });

    console.log(`  - Product Documents: ${productDocs} (${productChunks} chunks)`);
    console.log(`  - Comment Documents: ${commentDocs} (${commentChunks} chunks)`);
    console.log(`  - Total: ${productDocs + commentDocs} documents, ${productChunks + commentChunks} chunks`);

  } catch (error) {
    console.error("\n❌ Error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log("\n✅ Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
