import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  
  console.log('\n📋 All users in database:');
  console.log('Total users:', users.length);
  console.log('\n');
  
  users.forEach((user, index) => {
    console.log(`${index + 1}. Email: "${user.email}"`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Allowed: ${user.allowed}`);
    console.log('');
  });

  // Check for specific email
  const targetEmail = 'Sarawut@notebookspec.com';
  const found = await prisma.user.findUnique({
    where: { email: targetEmail }
  });

  console.log(`\n🔍 Checking for "${targetEmail}":`);
  console.log(found ? '✅ FOUND' : '❌ NOT FOUND');
  
  if (found) {
    console.log('Details:', JSON.stringify(found, null, 2));
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
