/**
 * Check drafts in database
 */

import { prisma } from "./lib/db";

async function checkDrafts() {
  console.log("\n🔍 Checking drafts...\n");

  const drafts = await prisma.draft.findMany({
    where: {
      status: "PENDING"
    },
    include: {
      comment: {
        select: {
          id: true,
          textOriginal: true,
          authorDisplayName: true,
        }
      }
    },
    take: 5,
  });

  console.log(`Found ${drafts.length} PENDING drafts:\n`);

  for (const draft of drafts) {
    console.log(`Draft ID: ${draft.id}`);
    console.log(`Comment: ${draft.comment.textOriginal.substring(0, 50)}...`);
    console.log(`Author: ${draft.comment.authorDisplayName}`);
    console.log(`Has reply: ${!!draft.reply}`);
    console.log(`Reply length: ${draft.reply?.length || 0}`);
    if (draft.reply) {
      console.log(`Reply preview: ${draft.reply.substring(0, 100)}...`);
    }
    console.log("---\n");
  }

  await prisma.$disconnect();
}

checkDrafts();
