/**
 * Check PENDING comments and their drafts
 */

import { prisma } from "./lib/db";

async function checkPendingComments() {
  console.log("\n🔍 Checking PENDING comments...\n");
  console.log("=".repeat(80));

  // Get comments with PENDING drafts
  const comments = await prisma.comment.findMany({
    where: {
      draft: {
        status: "PENDING"
      }
    },
    include: {
      draft: true
    },
    orderBy: {
      publishedAt: "desc"
    }
  });

  console.log(`\nFound ${comments.length} comments with PENDING drafts:\n`);

  for (const comment of comments) {
    console.log("─".repeat(80));
    console.log(`\n📝 Comment ID: ${comment.id}`);
    console.log(`   Comment Text: ${comment.textOriginal.substring(0, 60)}...`);
    console.log(`   Author: ${comment.authorDisplayName}`);
    console.log(`   Published: ${comment.publishedAt?.toISOString() || 'N/A'}`);

    if (comment.draft) {
      console.log(`\n   ✅ Draft ID: ${comment.draft.id}`);
      console.log(`   📊 Status: ${comment.draft.status}`);
      console.log(`   💬 Has Reply: ${!!comment.draft.reply ? 'YES' : 'NO'}`);

      if (comment.draft.reply) {
        console.log(`   📏 Reply Length: ${comment.draft.reply.length} chars`);
        console.log(`\n   📄 Reply Preview:`);
        console.log(`   ${comment.draft.reply.substring(0, 150)}...`);
      } else {
        console.log(`   ⚠️  NO REPLY - This is the problem!`);
      }

      console.log(`\n   📈 Scores:`);
      console.log(`      Engagement: ${comment.draft.engagementScore || 'N/A'}`);
      console.log(`      Relevance: ${comment.draft.relevanceScore || 'N/A'}`);

      // Check suggested products
      if (comment.draft.suggestedProducts) {
        try {
          const products = JSON.parse(comment.draft.suggestedProducts as string);
          console.log(`   🛍️  Suggested Products: ${products.length} items`);
        } catch (error) {
          console.log(`   ⚠️  Suggested Products: Invalid JSON`);
        }
      } else {
        console.log(`   🛍️  Suggested Products: None`);
      }
    } else {
      console.log(`\n   ❌ NO DRAFT FOUND (This shouldn't happen!)`);
    }

    console.log("");
  }

  console.log("=".repeat(80));
  console.log("\n📊 Summary:");
  console.log(`   Total PENDING comments: ${comments.length}`);
  const withReply = comments.filter(c => c.draft?.reply).length;
  const withoutReply = comments.filter(c => !c.draft?.reply).length;
  console.log(`   ✅ With reply: ${withReply}`);
  console.log(`   ❌ Without reply: ${withoutReply}`);
  console.log("");

  await prisma.$disconnect();
}

checkPendingComments();
