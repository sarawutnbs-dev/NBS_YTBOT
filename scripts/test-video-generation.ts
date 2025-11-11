/**
 * Test script for generateDraftsForVideoWithRAG
 */

import { generateDraftsForVideoWithRAG } from "@/lib/draftServiceWithRAG";
import { prisma } from "@/lib/db";

async function main() {
  console.log("🧪 Testing generateDraftsForVideoWithRAG...\n");

  try {
    // Find a video that has comments without drafts
    const videoWithComments = await prisma.comment.findFirst({
      where: {
        draft: null,
      },
      select: {
        videoId: true
      }
    });

    if (!videoWithComments) {
      console.log("⚠️  No comments without drafts found. Creating test scenario...");
      
      // Find any video with comments
      const anyComment = await prisma.comment.findFirst({
        select: {
          id: true,
          videoId: true,
        }
      });

      if (!anyComment) {
        console.error("❌ No comments found in database");
        process.exit(1);
      }

      console.log(`📝 Using video: ${anyComment.videoId}`);
      
      // Delete existing draft if any
      const existingDraft = await prisma.draft.findUnique({
        where: { commentId: anyComment.id }
      });
      
      if (existingDraft) {
        console.log(`🗑️  Deleting existing draft for comment ${anyComment.id}...`);
        await prisma.draft.delete({
          where: { commentId: anyComment.id }
        });
      }

      console.log(`\n🚀 Testing with video: ${anyComment.videoId}\n`);
      const result = await generateDraftsForVideoWithRAG(anyComment.videoId);
      
      console.log("\n✅ Test completed successfully!");
      console.log("Result:", JSON.stringify(result, null, 2));
      
      // Check if draft was created
      const createdDraft = await prisma.draft.findUnique({
        where: { commentId: anyComment.id }
      });

      if (createdDraft) {
        console.log("\n📋 Draft created:");
        console.log("- Reply length:", createdDraft.reply.length, "characters");
        console.log("- Has shortURL:", createdDraft.reply.includes("nbsi.me") ? "✅ YES" : "❌ NO");
        console.log("- Suggested products:", createdDraft.suggestedProducts || "none");
        
        if (createdDraft.reply.includes("nbsi.me")) {
          console.log("\n🎉 ShortURL insertion is working!");
        } else {
          console.log("\n⚠️  No shortURL found in reply");
        }
      } else {
        console.log("\n❌ No draft was created");
      }
      
    } else {
      console.log(`📝 Found video with comments: ${videoWithComments.videoId}`);
      console.log(`\n🚀 Testing generateDraftsForVideoWithRAG...\n`);
      
      const result = await generateDraftsForVideoWithRAG(videoWithComments.videoId);
      
      console.log("\n✅ Test completed successfully!");
      console.log("Result:", JSON.stringify(result, null, 2));
    }
    
  } catch (error) {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
