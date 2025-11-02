/**
 * RAG System - Main Export File
 *
 * This file exports all RAG functionality for easy importing
 */

// Core OpenAI functions
export {
  openai,
  createEmbedding,
  createEmbeddings,
  chatCompletion,
  getEmbeddingModelInfo,
  getChatModelInfo,
} from "./openai";

// Tokenizer functions
export {
  countTokens,
  countTokensBatch,
  truncateToTokens,
  estimateContextCost,
  truncateContexts,
  freeEncoder,
} from "./tokenizer";

// Normalization functions
export {
  normalizeText,
  cleanText,
  stripHtml,
  truncateText,
  collapseWhitespace,
  normalizeThaiText,
  removeEmojis,
  normalizeForRAG,
} from "./normalize";

// Chunking functions
export {
  chunkText,
  chunkTranscript,
  chunkProductDescription,
  chunkComment,
  type TextChunk,
  type ChunkOptions,
} from "./chunk";

// Schemas and types
export * from "./schema";

// Retriever functions
export {
  vectorSearch,
  keywordSearch,
  hybridSearch,
  search,
  getChunksByDocId,
  getChunksBySource,
  deleteDocument,
  countDocuments,
  countChunks,
  getIndexStats,
} from "./retriever";

// Ingest functions
export {
  ingestComment,
  ingestTranscript,
  ingestProduct,
  ingestComments,
  ingestTranscripts,
  ingestProducts,
  regenerateEmbeddings,
  deleteAllDocuments,
} from "./ingest";

// Answer generation functions
export {
  generateAnswer,
  generateBatchAnswers,
  generateAnswerWithPrompt,
  previewContexts,
  findSimilarComments,
  findRelevantProducts,
} from "./answer";
