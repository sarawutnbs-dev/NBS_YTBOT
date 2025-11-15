#!/usr/bin/env node
/**
 * Add TestShopee user to database
 * Run this script to create the test user
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Creating TestShopee user...\n');

  const username = 'TestShopee';
  const email = 'testshopee@notebookspec.com';
  const password = 'shopeeTest@!NBS2018';

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      console.log('⚠️  User already exists:', {
        id: existingUser.id,
        username: existingUser.username,
        email: existingUser.email,
        role: existingUser.role,
        allowed: existingUser.allowed
      });

      // Update password if needed
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          password: hashedPassword,
          allowed: true,
          role: 'USER'
        }
      });

      console.log('✅ Password updated successfully!');
      return;
    }

    // Create new user
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role: 'USER',
        allowed: true
      }
    });

    console.log('✅ User created successfully:');
    console.log({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      allowed: user.allowed
    });

    console.log('\n📝 Login credentials:');
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
