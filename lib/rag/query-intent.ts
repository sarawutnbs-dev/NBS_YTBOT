import { KNOWN_BRANDS, mentionsBrand, extractPriceRange } from "@/lib/brandUtils";

export interface QueryIntent {
  brands: string[];
  priceRange?: [number, number];
  usageCategory?: string; // Canonical use-case string (e.g., from knowledge pack)
  tags: string[]; // derived tags for coarse filtering
}

// naive mapping from usage to tags we expect in product.tags
const USAGE_TAGS: Record<string, string[]> = {
  Gaming: ["gaming", "rtx", "gtx", "144hz", "performance"],
  "Office & Study": ["office", "study", "student", "ultrabook", "lightweight"],
  "Video Editing & Graphic Design": ["creator", "oled", "srgb", "gpu", "pro"],
  "Entertainment & Casual": ["entertainment", "netflix", "youtube", "casual"],
  "Programming & Dev Work": ["developer", "dev", "programming", "docker", "vm"],
  "AI & Data Science": ["ai", "ml", "tensor", "cuda", "rtx"],
  "Business & Portability": ["business", "thin", "light", "battery"],
};

const USAGE_KEYWORDS: Array<{ key: string; words: string[] }> = [
  { key: "Gaming", words: ["เกม", "gaming", "fps", "valorant", "elden", "gta"] },
  { key: "Office & Study", words: ["เอกสาร", "เรียน", "เรียนออนไลน์", "office", "excel", "word"] },
  { key: "Video Editing & Graphic Design", words: ["ตัดต่อ", "premiere", "photoshop", "resolve", "กราฟิก", "graphic"] },
  { key: "Entertainment & Casual", words: ["ดูหนัง", "netflix", "youtube", "บันเทิง", "casual"] },
  { key: "Programming & Dev Work", words: ["เขียนโค้ด", "program", "developer", "docker", "vm", "virtual"] },
  { key: "AI & Data Science", words: ["ai", "machine learning", "data", "pytorch", "tensorflow"] },
  { key: "Business & Portability", words: ["พกพา", "ธุรกิจ", "business", "บางเบา", "เดินทาง"] },
];

export function detectQueryIntent(query: string): QueryIntent {
  const qLower = query.toLowerCase();

  // brands
  const brands = KNOWN_BRANDS.filter((b) => mentionsBrand(query, b));

  // price
  const priceRange = extractPriceRange(query) || undefined;

  // usage
  let usageCategory: string | undefined = undefined;
  for (const entry of USAGE_KEYWORDS) {
    if (entry.words.some((w) => qLower.includes(w))) {
      usageCategory = entry.key;
      break;
    }
  }

  // tags derived from usage
  const usageTags = usageCategory ? (USAGE_TAGS[usageCategory] || []) : [];

  return {
    brands,
    priceRange,
    usageCategory,
    tags: usageTags
  };
}
