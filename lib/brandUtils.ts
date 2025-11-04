/**
 * Brand extraction utilities for products and videos
 */

export const KNOWN_BRANDS = [
  // Laptop/Notebook Brands
  "ASUS", "Acer", "HP", "Lenovo", "Dell", "MSI", "Apple", "MacBook",
  "GIGABYTE", "Razer", "Alienware", "Huawei", "LG", "Samsung",
  "Microsoft", "Surface", "Xiaomi", "Avita",

  // CPU Brands
  "Intel", "AMD", "Ryzen", "Core i3", "Core i5", "Core i7", "Core i9",

  // GPU Brands
  "NVIDIA", "GeForce", "RTX", "GTX", "AMD Radeon", "Radeon",

  // Component Brands
  "Corsair", "Kingston", "G.Skill", "Crucial", "Western Digital", "WD",
  "Seagate", "SanDisk", "Samsung", "Thermaltake", "Cooler Master",
  "NZXT", "Fractal Design", "be quiet!", "Seasonic", "EVGA",
  "Antec", "Silverstone", "Deepcool", "Arctic", "Noctua",

  // Peripherals
  "Logitech", "Razer", "SteelSeries", "HyperX", "Corsair",
  "Asus ROG", "Cooler Master", "Redragon", "Keychron",
];

/**
 * Extract brand name from product tags or name
 */
export function extractBrand(tags: string[], productName?: string): string | null {
  const searchTexts = [...tags];
  if (productName) {
    searchTexts.push(productName);
  }

  // Combine all text for searching
  const combinedText = searchTexts.join(" ").toUpperCase();

  // Search for known brands (order by specificity)
  const sortedBrands = KNOWN_BRANDS.sort((a, b) => b.length - a.length);

  for (const brand of sortedBrands) {
    const brandUpper = brand.toUpperCase();
    if (combinedText.includes(brandUpper)) {
      return brand;
    }
  }

  return null;
}

/**
 * Extract multiple brands from text
 */
export function extractBrands(tags: string[], productName?: string): string[] {
  const searchTexts = [...tags];
  if (productName) {
    searchTexts.push(productName);
  }

  const combinedText = searchTexts.join(" ").toUpperCase();
  const foundBrands: string[] = [];

  for (const brand of KNOWN_BRANDS) {
    const brandUpper = brand.toUpperCase();
    if (combinedText.includes(brandUpper)) {
      foundBrands.push(brand);
    }
  }

  // Remove duplicates and return
  return Array.from(new Set(foundBrands));
}

/**
 * Extract categories from product tags
 */
export function extractCategories(tags: string[], categoryName?: string): string[] {
  const categories: string[] = [];

  if (categoryName) {
    categories.push(categoryName);
  }

  // Add categories from tags (if they match known categories)
  const knownCategories = [
    "Notebook", "Laptop", "CPU", "GPU", "RAM", "SSD", "HDD",
    "Mainboard", "Motherboard", "PSU", "Power Supply",
    "Case", "Cooling", "Fan", "Monitor", "Keyboard", "Mouse",
    "Headset", "Speaker", "Webcam", "Charger", "Adapter"
  ];

  for (const tag of tags) {
    for (const cat of knownCategories) {
      if (tag.toUpperCase().includes(cat.toUpperCase())) {
        categories.push(cat);
      }
    }
  }

  return Array.from(new Set(categories));
}

/**
 * Extract price range from text (Thai format)
 * Example: "งบ 20,000", "ราคา 15000-25000", "15k-20k"
 */
export function extractPriceRange(text: string): [number, number] | null {
  const cleanText = text.replace(/,/g, "");

  // Pattern: "15000-25000" or "15k-20k"
  const rangeMatch = cleanText.match(/(\d+)k?\s*-\s*(\d+)k?/i);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]) * (rangeMatch[1].includes("k") ? 1000 : 1);
    const max = parseFloat(rangeMatch[2]) * (rangeMatch[2].includes("k") ? 1000 : 1);
    return [min, max];
  }

  // Pattern: "งบ 20000" or "ราคา 15k"
  const singleMatch = cleanText.match(/(?:งบ|ราคา|budget|price)[\s:]*(\d+)k?/i);
  if (singleMatch) {
    const price = parseFloat(singleMatch[1]) * (singleMatch[1].includes("k") ? 1000 : 1);
    return [price * 0.8, price * 1.2]; // ±20%
  }

  return null;
}

/**
 * Check if text mentions specific brand
 */
export function mentionsBrand(text: string, brand: string): boolean {
  return text.toUpperCase().includes(brand.toUpperCase());
}

/**
 * Get brand priority for ranking
 * Returns higher number for more popular/relevant brands
 */
export function getBrandPriority(brand: string): number {
  const highPriority = ["ASUS", "Acer", "HP", "Lenovo", "Intel", "AMD", "NVIDIA"];
  const mediumPriority = ["Dell", "MSI", "Corsair", "Kingston", "Samsung"];

  if (highPriority.includes(brand)) return 3;
  if (mediumPriority.includes(brand)) return 2;
  return 1;
}
