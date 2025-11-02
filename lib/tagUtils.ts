/**
 * Brand tags for auto-tagging videos and products
 */
export const BRAND_TAGS = [
  "ASUS",
  "Acer",
  "Lenovo",
  "HP",
  "Dell",
  "MSI",
  "Apple"
] as const;

export type BrandTag = typeof BRAND_TAGS[number];

/**
 * Extract brand tags from text (case-insensitive)
 * @param text - Text to search for brand names
 * @returns Array of matching brand tags, or ["No brand"] if no brands found
 */
export function extractTagsFromText(text: string): string[] {
  if (!text) return ["No brand"];

  const foundTags = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const brand of BRAND_TAGS) {
    // Check if brand name appears in text (case-insensitive, whole word match)
    const brandLower = brand.toLowerCase();
    const regex = new RegExp(`\\b${brandLower}\\b`, 'i');

    if (regex.test(lowerText)) {
      foundTags.add(brand);
    }
  }

  // If no brand tags found, return "No brand"
  if (foundTags.size === 0) {
    return ["No brand"];
  }

  return Array.from(foundTags);
}

/**
 * Extract tags from video title
 * @param videoTitle - Video title
 * @returns Array of brand tags found in title
 */
export function extractVideoTags(videoTitle: string): string[] {
  return extractTagsFromText(videoTitle);
}

/**
 * Extract tags from product name
 * @param productName - Product name
 * @returns Array of brand tags found in name
 */
export function extractProductTags(productName: string): string[] {
  return extractTagsFromText(productName);
}
