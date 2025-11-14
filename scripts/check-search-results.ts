/**
 * Check what products were returned from search
 */

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ override: false });

const prisma = new PrismaClient();

async function checkSearchResults() {
  const productIds = ['28261761837', '27809491433', '27510133539'];

  console.log("Checking search results:\n");

  for (const id of productIds) {
    const product = await prisma.product.findFirst({
      where: { shopeeProductId: id },
      select: {
        shopeeProductId: true,
        name: true,
        categoryName: true,
        price: true,
        shortURL: true
      }
    });

    if (product) {
      console.log(`ID: ${id}`);
      console.log(`  Name: ${product.name}`);
      console.log(`  Category: ${product.categoryName}`);
      console.log(`  Price: ${product.price?.toLocaleString()} ฿`);
      console.log(`  URL: ${product.shortURL}\n`);
    } else {
      console.log(`ID: ${id} - NOT FOUND\n`);
    }
  }

  await prisma.$disconnect();
}

checkSearchResults();
