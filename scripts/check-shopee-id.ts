import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const testId = "21002700724";

  const product = await prisma.product.findFirst({
    where: { shopeeProductId: testId },
    select: {
      id: true,
      shopeeProductId: true,
      name: true
    }
  });

  console.log(`Product with shopeeProductId="${testId}":`, product);

  // Also check how many products have null shopeeProductId
  const nullCount = await prisma.product.count({
    where: { shopeeProductId: null }
  });

  const notNullCount = await prisma.product.count({
    where: { shopeeProductId: { not: null } }
  });

  console.log(`\nProducts with shopeeProductId IS NULL: ${nullCount}`);
  console.log(`Products with shopeeProductId IS NOT NULL: ${notNullCount}`);

  // Sample products with shopeeProductId
  const samples = await prisma.product.findMany({
    where: { shopeeProductId: { not: null } },
    select: {
      id: true,
      shopeeProductId: true,
      name: true
    },
    take: 3
  });

  console.log(`\nSample products with shopeeProductId:`);
  samples.forEach((p, i) => {
    console.log(`${i + 1}. ID: ${p.id}, shopeeProductId: ${p.shopeeProductId}`);
    console.log(`   Name: ${p.name.substring(0, 50)}...`);
  });

  await prisma.$disconnect();
}

check();
