import { KNOWN_BRANDS, mentionsBrand, extractPriceRange } from "@/lib/brandUtils";

type ComponentCategory =
  | "CPU"
  | "Mainboard"
  | "Memory (RAM)"
  | "Graphics Card (VGA)"
  | "Storage"
  | "Power Supply (PSU)"
  | "Cooling System"
  | "Monitor"
  | "PC Case";

export interface QueryIntent {
  brands: string[];
  priceRange?: [number, number];
  usageCategory?: string; // Canonical use-case string (e.g., from knowledge pack)
  tags: string[]; // derived tags for coarse filtering
  components?: ComponentCategory[]; // detected PC component categories mentioned in the query
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

  // Detect PC components mentioned
  const COMPONENT_KEYWORDS: Array<{ key: ComponentCategory; words: string[] }> = [
    { key: "CPU", words: ["cpu", "ซีพียู", "intel", "ryzen", "i3", "i5", "i7", "i9", "threadripper", "xeon"] },
    { key: "Mainboard", words: ["mainboard", "motherboard", "เมนบอร์ด", "บอร์ด", "b760", "b650", "z790", "x670", "am5", "lga1700"] },
    { key: "Memory (RAM)", words: ["ram", "แรม", "ddr4", "ddr5", "เมมโมรี่", "memory"] },
    { key: "Graphics Card (VGA)", words: ["gpu", "การ์ดจอ", "vga", "rtx", "gtx", "rx", "4070", "4090", "7800 xt"] },
    { key: "Storage", words: ["ssd", "hdd", "nvme", "m.2", "sata", "ฮาร์ดดิสก์", "storage"] },
    { key: "Power Supply (PSU)", words: ["psu", "power supply", "เพาเวอร์ซัพพลาย", "พาวเวอร์ซัพพลาย", "12vhpwr", "วัตต์"] },
    { key: "Cooling System", words: ["cooler", "ซิ้ง", "ฮีตซิงค์", "aio", "น้ำปิด", "ระบายความร้อน", "พัดลม cpu"] },
    { key: "Monitor", words: ["monitor", "จอ", "หน้าจอ", "display", "144hz", "240hz", "ips", "va", "oled"] },
    { key: "PC Case", words: ["case", "เคส", "chassis", "tower", "mid tower", "mini tower", "full tower"] },
  ];

  const components = COMPONENT_KEYWORDS
    .filter((entry) => entry.words.some((w) => qLower.includes(w)))
    .map((e) => e.key);

  return {
    brands,
    priceRange,
    usageCategory,
    tags: usageTags,
    components: components.length > 0 ? components : undefined,
  };
}
