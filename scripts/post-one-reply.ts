import dotenv from 'dotenv';
// Load .env.local first to ensure getEnv() sees the latest values
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ override: false });

import { prisma } from '@/lib/db';
import { replyToComment } from '@/lib/youtubeWrite';

async function main() {
  console.log('\n🧪 Posting a single YouTube reply');
  console.log('='.repeat(80));

  const targetEmail = process.argv[2] || process.env.TARGET_EMAIL;
  if (!targetEmail) {
    throw new Error('Please provide the target user email as an argument, e.g. `npx tsx scripts/post-one-reply.ts sarawut@notebookspec.com`');
  }

  // Ensure target user exists
  const user = await prisma.user.findUnique({ where: { email: targetEmail } });
  if (!user) {
    throw new Error(`User not found: ${targetEmail}. Tip: run the token upsert script first to create/allow the user and store credentials.`);
  }
  if (!user.allowed) {
    console.warn(`⚠️  User exists but is not allowed. Proceeding anyway, but API routes would block this user. email=${user.email}`);
  }

  // Find a draft ready to post
  const draft = await prisma.draft.findFirst({
    where: {
      status: 'PENDING'
    },
    orderBy: { createdAt: 'asc' },
    include: { comment: true }
  });

  if (!draft || !(draft as any).comment) {
    console.log('⚠️  No PENDING drafts found — falling back to replying to the most recent comment in DB');
    const anyComment = await prisma.comment.findFirst({
      where: { canReply: true },
      orderBy: { createdAt: 'desc' }
    });
    if (!anyComment) {
      console.log('❌ No comments available to reply to. Aborting.');
      process.exit(1);
    }

    const fallbackText = 'ขอบคุณสำหรับคอมเมนต์ครับ 🙏 (ทดสอบโพสต์จากระบบ NBS)';
    console.log('✅ Selected latest comment to reply:');
    console.log(`   Comment DB ID: ${anyComment.id}`);
    console.log(`   YouTube parentId: ${anyComment.commentId}`);
    console.log(`   Reply: ${fallbackText}`);
    console.log('');

    console.log('📤 Posting reply via YouTube API...');
    const result = await replyToComment({
      userId: user.id,
      parentId: anyComment.commentId,
      text: fallbackText
    });

    console.log('✅ Reply posted successfully!');
    console.log(`   YouTube Reply ID: ${result.id}`);
    console.log(`   Published at: ${result.snippet?.publishedAt}`);
    return;
  }

  const parentId = (draft as any).comment?.commentId as string | undefined;
  if (!parentId) {
    throw new Error(`Selected draft's comment has no YouTube parentId (commentId). Draft ID=${draft.id}`);
  }

  console.log('✅ Selected draft to post:');
  console.log(`   Draft ID: ${draft.id}`);
  console.log(`   Comment DB ID: ${(draft as any).comment.id}`);
  console.log(`   YouTube parentId: ${parentId}`);
  console.log(`   Reply (first 120 chars): ${draft.reply?.slice(0, 120)}${(draft.reply && draft.reply.length > 120) ? '...' : ''}`);
  console.log('');

  console.log('📤 Posting reply via YouTube API...');
  const result = await replyToComment({
    userId: user.id,
    parentId,
    text: draft.reply as string
  });

  console.log('✅ Reply posted successfully!');
  console.log(`   YouTube Reply ID: ${result.id}`);
  console.log(`   Published at: ${result.snippet?.publishedAt}`);

  await prisma.draft.update({
    where: { id: draft.id },
    data: {
      status: 'POSTED',
      postedAt: new Date()
    }
  });

  console.log('💾 Draft status updated to POSTED in database');
}

main()
  .catch((err) => {
    console.error('\n❌ Failed to post reply:', err?.message || err);
    if ((err as any)?.response?.data) {
      console.error('API error:', (err as any).response.data);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
