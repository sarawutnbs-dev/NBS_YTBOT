import { prisma } from "@/lib/db";

async function checkIndexes() {
  console.log("🔍 Checking current indexes on RagChunk table...\n");

  const indexes = await prisma.$queryRaw<any[]>`
    SELECT
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename = 'RagChunk'
    ORDER BY indexname
  `;

  console.log("Current indexes:");
  indexes.forEach(idx => {
    console.log(`\n  ${idx.indexname}:`);
    console.log(`    ${idx.indexdef}`);
  });

  // Check if HNSW index exists
  const hnswExists = indexes.some(idx =>
    idx.indexdef.includes('hnsw') || idx.indexdef.includes('HNSW')
  );

  console.log(`\n\n🎯 HNSW Index Status: ${hnswExists ? '✅ EXISTS' : '❌ NOT FOUND'}`);

  if (!hnswExists) {
    console.log("\n💡 To add HNSW index, run: npx prisma migrate dev --name add_hnsw_index");
  }

  await prisma.$disconnect();
}

checkIndexes();
