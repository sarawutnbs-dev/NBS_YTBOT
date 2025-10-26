import { prisma } from "@/lib/db";
import ProductsTable from "./ProductsTable.client";

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" }
  });

  return <ProductsTable initialProducts={products} />;
}
