/**
 * Debug script to check Product table vs RAG system mismatch
 */

import { PrismaClient } from "@prisma/client";
import { hybridSearch } from "../lib/rag/retriever";
import { createEmbedding } from "../lib/rag/openai";

const prisma = new PrismaClient();

async function debugProductMismatch() {
  console.log("=" .repeat(60));
  console.log("Debugging Product Table vs RAG System Mismatch");
  console.log("=".repeat(60));

  try {
    // 1. Check Product table
    const totalProducts = await prisma.product.count();
    const inStockProducts = await prisma.product.count({
      where: { inStock: true }
    });
    const hasAffiliateProducts = await prisma.product.count({
      where: { hasAffiliate: true }
    });
    const hasShortURLProducts = await prisma.product.count({
      where: { shortURL: { not: null } }
    });
    const readyProducts = await prisma.product.count({
      where: {
        inStock: true,
        hasAffiliate: true,
        shortURL: { not: null }
      }
    });

    console.log(`\n[Product Table Stats]`);
    console.log(`  Total products: ${totalProducts}`);
    console.log(`  In stock: ${inStockProducts}`);
    console.log(`  Has affiliate: ${hasAffiliateProducts}`);
    console.log(`  Has shortURL: ${hasShortURLProducts}`);
    console.log(`  Ready (all 3): ${readyProducts}`);

    // 2. Search for gaming notebooks
    console.log(`\n[RAG Search Test]`);
    const query = "อยากได้ notebook gaming งบ 40000 บาท";
    console.log(`  Query: "${query}"`);

    const queryEmbedding = await createEmbedding(query);
    const searchResults = await hybridSearch(query, {
      topK: 20,
      sourceType: "product",
      minScore: 0.3,
      queryEmbedding
    });

    console.log(`  Found ${searchResults.length} products from RAG`);

    if (searchResults.length > 0) {
      // 3. Get sourceIds from search results
      const sourceIds = searchResults.map(r => r.sourceId);
      console.log(`\n[Source IDs from RAG]`);
      console.log(`  Sample (first 5):`, sourceIds.slice(0, 5));

      // 4. Check if these sourceIds exist in Product table
      const matchingProducts = await prisma.product.findMany({
        where: {
          shopeeProductId: { in: sourceIds }
        },
        select: {
          id: true,
          shopeeProductId: true,
          name: true,
          inStock: true,
          hasAffiliate: true,
          shortURL: true,
        }
      });

      console.log(`\n[Product Table Lookup]`);
      console.log(`  Searched for ${sourceIds.length} shopeeProductIds`);
      console.log(`  Found ${matchingProducts.length} matches`);

      if (matchingProducts.length > 0) {
        console.log(`\n[Sample Matched Products]`);
        matchingProducts.slice(0, 3).forEach(p => {
          console.log(`  - ${p.shopeeProductId}`);
          console.log(`    Name: ${p.name?.substring(0, 50)}`);
          console.log(`    inStock: ${p.inStock}, hasAffiliate: ${p.hasAffiliate}, hasShortURL: ${!!p.shortURL}`);
        });
      } else {
        console.log(`\n⚠️  No matches found! Checking why...`);

        // Sample some actual shopeeProductIds from Product table
        const sampleProducts = await prisma.product.findMany({
          where: { inStock: true },
          select: { shopeeProductId: true, name: true },
          take: 5
        });

        console.log(`\n[Sample shopeeProductIds from Product table]`);
        sampleProducts.forEach(p => {
          console.log(`  - ${p.shopeeProductId} (${typeof p.shopeeProductId})`);
          console.log(`    ${p.name?.substring(0, 50)}`);
        });

        console.log(`\n[Comparing formats]`);
        console.log(`  RAG sourceId type: ${typeof sourceIds[0]}`);
        console.log(`  RAG sourceId example: "${sourceIds[0]}"`);
        console.log(`  Product shopeeProductId type: ${typeof sampleProducts[0]?.shopeeProductId}`);
        console.log(`  Product shopeeProductId example: "${sampleProducts[0]?.shopeeProductId}"`);
      }
    }

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

debugProductMismatch();
