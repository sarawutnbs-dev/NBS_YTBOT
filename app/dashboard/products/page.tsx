import { prisma } from "@/lib/db";
import ProductsTable from "./ProductsTable.client";

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" }
  });

  const normalized = products.map((product: (typeof products)[number]) => ({
    ...product,
    tags: product.tagsJson ? JSON.parse(product.tagsJson) : []
  }));

  return <ProductsTable initialProducts={normalized} />;
}
