import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkProducts() {
  const productIds = [
    '15450334523',
    '25645993089',
    '8176978653',
    '22535058086',
    '22787920639'
  ];

  console.log("Checking top 5 products from search:\n");

  for (const id of productIds) {
    const product = await prisma.product.findFirst({
      where: { shopeeProductId: id },
      select: {
        shopeeProductId: true,
        name: true,
        categoryName: true,
        price: true
      }
    });

    if (product) {
      console.log(`ID: ${id}`);
      console.log(`  Name: ${product.name?.substring(0, 60)}`);
      console.log(`  Category: ${product.categoryName}`);
      console.log(`  Price: ${product.price?.toLocaleString()} ฿`);
      console.log();
    } else {
      console.log(`ID: ${id} - NOT FOUND\n`);
    }
  }

  await prisma.$disconnect();
}

checkProducts();
