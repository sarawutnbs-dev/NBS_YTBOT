/**
 * Test searching for Notebook products
 */

import { hybridSearch } from "@/lib/rag/retriever";

async function testNotebookSearch() {
  console.log("=".repeat(80));
  console.log("Testing Notebook product search");
  console.log("=".repeat(80));

  const queries = [
    "โน้ตบุ๊กเล่นเกม",
    "ใช้เรียนกับเล่นเกมแนะนำตัวไหนคะ โน้ตบุ๊ก notebook",
    "notebook gaming",
  ];

  for (const query of queries) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`Query: "${query}"`);
    console.log(`${"=".repeat(80)}`);

    // Search WITH category filter
    console.log("\n🔍 Search WITH category='Notebook' filter:");
    const resultsWithCategory = await hybridSearch(query, {
      topK: 5,
      sourceType: "product",
      minScore: 0.2,
      category: "Notebook",
    });
    console.log(`Found: ${resultsWithCategory.length} results`);
    if (resultsWithCategory.length > 0) {
      resultsWithCategory.forEach((r, idx) => {
        const meta = r.meta as { name?: string; category?: string } | undefined;
        const nameSnippet = meta?.name ? meta.name.substring(0, 60) : r.sourceId;
        console.log(`  ${idx + 1}. Score: ${r.score.toFixed(3)} | ${nameSnippet}`);
        console.log(`     Category: ${meta?.category || "N/A"}`);
      });
    }

    // Search WITHOUT category filter
    console.log("\n🔍 Search WITHOUT category filter:");
    const resultsNoCategory = await hybridSearch(query, {
      topK: 5,
      sourceType: "product",
      minScore: 0.2,
    });
    console.log(`Found: ${resultsNoCategory.length} results`);
    if (resultsNoCategory.length > 0) {
      resultsNoCategory.forEach((r, idx) => {
        const meta = r.meta as { name?: string; category?: string } | undefined;
        const nameSnippet = meta?.name ? meta.name.substring(0, 60) : r.sourceId;
        console.log(`  ${idx + 1}. Score: ${r.score.toFixed(3)} | ${nameSnippet}`);
        console.log(`     Category: ${meta?.category || "N/A"}`);
      });
    }
  }
}

testNotebookSearch();
