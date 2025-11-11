import { prisma } from "@/lib/db";

async function testShortURLMatch() {
  console.log("Testing shortURL matching...\n");

  // Test text from user
  const testText = `สินค้าแนะนำ:
- [แนะนำ]เอซุส วีโว่บุ๊ค ASUS VIVOBOOK S16 S3607VA-RP575WA/CORE 5-210H/SSD 512GB/16GBRAM/Office 2024 ราคา 21,350 บาท
- [สินค้าแนะนำ]เอซุส วีโวบุ๊ค ASUS VIVOBOOK 15 X1502VA-SILVER579WA/i5-13420H/RAM 16GB/SSD512GB/OFFICE ราคา 18,990 บาท`;

  console.log("Original text:");
  console.log(testText);
  console.log("\n" + "=".repeat(80) + "\n");

  // Find products that might match
  const searchTerms = [
    "ASUS VIVOBOOK S16 S3607VA",
    "ASUS VIVOBOOK 15 X1502VA",
    "S3607VA-RP575WA",
    "X1502VA-SILVER579WA"
  ];

  console.log("Searching for products with these terms:");
  searchTerms.forEach(term => console.log(`  - ${term}`));
  console.log();

  for (const term of searchTerms) {
    const products = await prisma.product.findMany({
      where: {
        name: {
          contains: term,
          mode: 'insensitive'
        },
        shortURL: {
          not: null
        }
      },
      select: {
        id: true,
        name: true,
        shortURL: true,
        price: true
      },
      take: 5
    });

    if (products.length > 0) {
      console.log(`\nFound ${products.length} product(s) matching "${term}":`);
      products.forEach(p => {
        console.log(`  ID: ${p.id}`);
        console.log(`  Name: ${p.name}`);
        console.log(`  Price: ${p.price}`);
        console.log(`  ShortURL: ${p.shortURL}`);
        console.log();

        // Test regex matching
        const nameForMatching = p.name.replace(/^\[[^\]]+\]/g, '').trim();
        const modelMatch = nameForMatching.match(/[A-Z0-9]+[A-Z0-9\-]+/);
        
        if (modelMatch) {
          const model = modelMatch[0];
          console.log(`  Extracted model: ${model}`);
          
          const pattern = new RegExp(`(-[^\\n]*${model}[^\\n]*?บาท)(?![^\\n]*https?://)`, 'gi');
          const matches = testText.match(pattern);
          
          if (matches) {
            console.log(`  ✅ MATCHED with pattern!`);
            console.log(`  Matches:`, matches);
            
            // Show what the replacement would look like
            const replaced = testText.replace(pattern, (match) => {
              return `${match} ${p.shortURL}`;
            });
            console.log(`\n  After replacement:`);
            console.log(replaced);
          } else {
            console.log(`  ❌ NO MATCH with pattern`);
          }
        } else {
          console.log(`  ⚠️  Could not extract model number`);
        }
        console.log();
      });
    }
  }

  // Also search by model numbers directly
  console.log("\n" + "=".repeat(80));
  console.log("\nSearching by exact model numbers:");
  
  const modelNumbers = ["S3607VA-RP575WA", "X1502VA-SILVER579WA"];
  
  for (const model of modelNumbers) {
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: model, mode: 'insensitive' } },
          { shopeeProductId: { contains: model } }
        ],
        shortURL: { not: null }
      },
      select: {
        id: true,
        name: true,
        shortURL: true
      },
      take: 2
    });

    console.log(`\nModel: ${model}`);
    console.log(`Found: ${products.length} product(s)`);
    products.forEach(p => {
      console.log(`  - ${p.name}`);
      console.log(`    ${p.shortURL}`);
    });
  }

  await prisma.$disconnect();
}

testShortURLMatch().catch(console.error);
