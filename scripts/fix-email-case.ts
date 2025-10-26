import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
  // Update email to lowercase
  const updated = await prisma.user.update({
    where: { email: 'Sarawut@notebookspec.com' },
    data: { email: 'sarawut@notebookspec.com' }
  });

  console.log('✅ Updated user email to lowercase:', updated);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
