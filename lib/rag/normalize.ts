/**
 * Normalize text for embedding and storage
 */
export function normalizeText(text: string): string {
  if (!text) return "";

  let normalized = text;

  // Remove excessive whitespace
  normalized = normalized.replace(/\s+/g, " ");

  // Remove leading/trailing whitespace
  normalized = normalized.trim();

  // Normalize quotes
  normalized = normalized.replace(/[""]/g, '"');
  normalized = normalized.replace(/['']/g, "'");

  // Normalize dashes
  normalized = normalized.replace(/[–—]/g, "-");

  // Remove zero-width characters
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, "");

  return normalized;
}

/**
 * Clean text for display (more aggressive)
 */
export function cleanText(text: string): string {
  if (!text) return "";

  let cleaned = normalizeText(text);

  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, "[URL]");

  // Remove email addresses
  cleaned = cleaned.replace(/\S+@\S+\.\S+/g, "[EMAIL]");

  // Remove excessive punctuation
  cleaned = cleaned.replace(/([!?.]){3,}/g, "$1$1");

  // Remove excessive newlines (keep at most 2)
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

/**
 * Extract text from HTML (basic)
 */
export function stripHtml(html: string): string {
  if (!html) return "";

  // Remove script and style tags
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  return normalizeText(text);
}

/**
 * Truncate text to character limit (preserving words)
 */
export function truncateText(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;

  // Try to cut at word boundary
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > maxChars * 0.8) {
    // Cut at word boundary if not too far back
    return truncated.slice(0, lastSpace) + "...";
  }

  // Cut at character limit
  return truncated + "...";
}

/**
 * Remove duplicate consecutive spaces
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Normalize Thai text (if needed)
 */
export function normalizeThaiText(text: string): string {
  if (!text) return "";

  let normalized = text;

  // Normalize Thai vowels and tone marks
  // Remove duplicate tone marks
  normalized = normalized.replace(/([่-๋])\1+/g, "$1");

  // Remove excessive Thai repetition characters (ๆ)
  normalized = normalized.replace(/ๆ{2,}/g, "ๆ");

  return normalizeText(normalized);
}

/**
 * Remove emojis (optional, for cleaner embeddings)
 */
export function removeEmojis(text: string): string {
  if (!text) return "";

  // Remove emoji characters
  return text.replace(
    /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    ""
  );
}

/**
 * Full normalize pipeline for RAG
 */
export function normalizeForRAG(text: string, options?: {
  removeEmojis?: boolean;
  cleanUrls?: boolean;
  maxLength?: number;
}): string {
  if (!text) return "";

  let result = normalizeText(text);

  // Optionally clean URLs
  if (options?.cleanUrls) {
    result = cleanText(result);
  }

  // Optionally remove emojis
  if (options?.removeEmojis) {
    result = removeEmojis(result);
  }

  // Handle Thai text
  if (/[\u0E00-\u0E7F]/.test(result)) {
    result = normalizeThaiText(result);
  }

  // Truncate if needed
  if (options?.maxLength && result.length > options.maxLength) {
    result = truncateText(result, options.maxLength);
  }

  return collapseWhitespace(result);
}
