import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://nbsytbot:nbsytbot123@45.91.134.109:5434/nbsytbot?schema=public"
    }
  }
});

async function main() {
  console.log('🔍 Searching for testshopee user in PRODUCTION database...\n');

  try {
    // Get all users
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        allowed: true,
        password: true
      }
    });

    console.log(`Found ${allUsers.length} total users in database:\n`);
    allUsers.forEach(user => {
      console.log({
        username: user.username,
        email: user.email,
        role: user.role,
        allowed: user.allowed,
        hasPassword: !!user.password
      });
    });

    console.log('\n---\n');

    // Search specifically for testshopee
    const testShopeeUser = allUsers.find(u =>
      u.username?.toLowerCase() === 'testshopee' ||
      u.email === 'testshopee@notebookspec.com'
    );

    if (testShopeeUser) {
      console.log('✅ TestShopee user found:');
      console.log(testShopeeUser);
    } else {
      console.log('❌ TestShopee user NOT found in production database!');
      console.log('\nThis user needs to be added to production database.');
    }

  } catch (error) {
    console.error('Error connecting to database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
