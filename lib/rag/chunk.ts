import { countTokens } from "./tokenizer";
import { normalizeText } from "./normalize";

export interface TextChunk {
  text: string;
  index: number;
  tokens: number;
  startChar: number;
  endChar: number;
}

export interface ChunkOptions {
  maxTokens: number;
  overlap: number;
  preserveSentences?: boolean;
}

/**
 * Split text into chunks by token count with overlap
 */
export function chunkText(text: string, options: ChunkOptions): TextChunk[] {
  if (!text) return [];

  const normalized = normalizeText(text);
  const { maxTokens, overlap, preserveSentences = true } = options;

  // If text is small enough, return as single chunk
  const totalTokens = countTokens(normalized);
  if (totalTokens <= maxTokens) {
    return [
      {
        text: normalized,
        index: 0,
        tokens: totalTokens,
        startChar: 0,
        endChar: normalized.length,
      },
    ];
  }

  // Split by sentences if requested
  const segments = preserveSentences
    ? splitIntoSentences(normalized)
    : [normalized];

  const chunks: TextChunk[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let chunkStartChar = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentTokens = countTokens(segment);

    // If single segment exceeds max, split it forcefully
    if (segmentTokens > maxTokens) {
      // Save current chunk if any
      if (currentChunk.length > 0) {
        const chunkText = currentChunk.join(" ");
        chunks.push({
          text: chunkText,
          index: chunks.length,
          tokens: currentTokens,
          startChar: chunkStartChar,
          endChar: chunkStartChar + chunkText.length,
        });
        currentChunk = [];
        currentTokens = 0;
      }

      // Split large segment by characters
      const forcedChunks = splitByCharacters(segment, maxTokens);
      forcedChunks.forEach((forcedChunk) => {
        chunks.push({
          text: forcedChunk,
          index: chunks.length,
          tokens: countTokens(forcedChunk),
          startChar: chunkStartChar,
          endChar: chunkStartChar + forcedChunk.length,
        });
        chunkStartChar += forcedChunk.length;
      });

      continue;
    }

    // Check if adding this segment would exceed limit
    if (currentTokens + segmentTokens > maxTokens && currentChunk.length > 0) {
      // Save current chunk
      const chunkText = currentChunk.join(" ");
      chunks.push({
        text: chunkText,
        index: chunks.length,
        tokens: currentTokens,
        startChar: chunkStartChar,
        endChar: chunkStartChar + chunkText.length,
      });

      // Start new chunk with overlap
      const overlapSegments = getOverlapSegments(currentChunk, overlap);
      currentChunk = overlapSegments;
      currentTokens = countTokens(currentChunk.join(" "));
      chunkStartChar = chunkStartChar + chunkText.length - currentChunk.join(" ").length;
    }

    currentChunk.push(segment);
    currentTokens += segmentTokens;
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join(" ");
    chunks.push({
      text: chunkText,
      index: chunks.length,
      tokens: currentTokens,
      startChar: chunkStartChar,
      endChar: chunkStartChar + chunkText.length,
    });
  }

  return chunks;
}

/**
 * Split text into sentences (basic)
 */
function splitIntoSentences(text: string): string[] {
  // Split by sentence endings (., !, ?, Thai sentence ender ฯ)
  const sentences = text.split(/([.!?฿]\s+)/);

  const result: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i];
    const punctuation = sentences[i + 1] || "";
    if (sentence.trim()) {
      result.push((sentence + punctuation).trim());
    }
  }

  return result.filter((s) => s.length > 0);
}

/**
 * Split text by character count (fallback for very long segments)
 */
function splitByCharacters(text: string, maxTokens: number): string[] {
  const estimatedCharsPerToken = 4; // Rough estimate
  const maxChars = maxTokens * estimatedCharsPerToken;

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    // Try to find a space near the end
    if (end < text.length) {
      const spacePos = text.lastIndexOf(" ", end);
      if (spacePos > start + maxChars * 0.8) {
        end = spacePos;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end;
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Get last N segments for overlap
 */
function getOverlapSegments(segments: string[], overlapTokens: number): string[] {
  if (overlapTokens === 0 || segments.length === 0) return [];

  const overlap: string[] = [];
  let tokens = 0;

  // Add segments from the end until we reach overlap size
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    const segmentTokens = countTokens(segment);

    if (tokens + segmentTokens > overlapTokens) {
      break;
    }

    overlap.unshift(segment);
    tokens += segmentTokens;
  }

  return overlap;
}

/**
 * Chunk transcript with specific settings (300-500 tokens, 60 overlap)
 */
export function chunkTranscript(text: string): TextChunk[] {
  return chunkText(text, {
    maxTokens: 400,
    overlap: 60,
    preserveSentences: true,
  });
}

/**
 * Chunk product description (smaller chunks, 120 tokens)
 */
export function chunkProductDescription(text: string): TextChunk[] {
  return chunkText(text, {
    maxTokens: 120,
    overlap: 20,
    preserveSentences: true,
  });
}

/**
 * Chunk comment (single chunk, but normalize)
 */
export function chunkComment(text: string): TextChunk[] {
  const normalized = normalizeText(text);
  const tokens = countTokens(normalized);

  return [
    {
      text: normalized,
      index: 0,
      tokens,
      startChar: 0,
      endChar: normalized.length,
    },
  ];
}
