import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const email = 'Sarawut@notebookspec.com';
  
  const user = await prisma.user.upsert({
    where: { email },
    update: { allowed: true, role: 'ADMIN' },
    create: {
      email,
      role: 'ADMIN',
      allowed: true,
    },
  });

  console.log('✅ User created/updated:', user);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
