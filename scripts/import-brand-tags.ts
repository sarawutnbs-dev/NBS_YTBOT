import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error('Usage: tsx scripts/import-brand-tags.ts <path-to-csv>');
    process.exitCode = 1;
    return;
  }

  const resolvedPath = path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(process.cwd(), inputPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exitCode = 1;
    return;
  }

  const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
  const lines = fileContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) {
    console.warn('CSV file does not contain any data rows.');
    return;
  }

  const header = lines[0];
  const expectedHeader = 'Category,Brand';
  if (header !== expectedHeader) {
    console.warn(
      `Unexpected CSV header: "${header}". Continuing import but please verify the file structure.`,
    );
  }

  const records = lines.slice(1);
  let imported = 0;

  for (const [index, rawLine] of records.entries()) {
    const [categoryRaw, brandRaw] = rawLine.split(',');

    if (!categoryRaw || !brandRaw) {
      console.warn(`Skipping row ${index + 2}: invalid format -> ${rawLine}`);
      continue;
    }

    const category = categoryRaw.trim();
    const brand = brandRaw.trim();

    if (!category || !brand) {
      console.warn(`Skipping row ${index + 2}: empty category or brand after trimming.`);
      continue;
    }

    await prisma.brandTag.upsert({
      where: {
        category_brand: {
          category,
          brand,
        },
      },
      update: {},
      create: {
        category,
        brand,
      },
    });

    imported += 1;
  }

  console.log(`Imported or updated ${imported} brand tags from ${records.length} rows.`);
}

main()
  .catch((error) => {
    console.error('Failed to import brand tags:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
