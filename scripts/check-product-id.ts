import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkProduct() {
  const productId = '15450334523';

  const product = await prisma.product.findFirst({
    where: { shopeeProductId: productId },
    select: {
      id: true,
      shopeeProductId: true,
      name: true,
      categoryName: true,
      price: true,
      shortURL: true
    }
  });

  console.log('Product ID:', productId);
  console.log('Product:', product);

  await prisma.$disconnect();
}

checkProduct();
