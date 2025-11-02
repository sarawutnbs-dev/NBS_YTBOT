import { z } from "zod";

/**
 * Comment source schema
 */
export const CommentSourceSchema = z.object({
  commentId: z.string(),
  videoId: z.string(),
  authorName: z.string(),
  text: z.string(),
  publishedAt: z.string().datetime().optional(),
  likeCount: z.number().optional(),
  isReply: z.boolean().optional(),
  parentId: z.string().optional(),
});

export type CommentSource = z.infer<typeof CommentSourceSchema>;

/**
 * Comment metadata schema
 */
export const CommentMetaSchema = z.object({
  videoId: z.string(),
  authorName: z.string(),
  publishedAt: z.string().optional(),
  likeCount: z.number().optional(),
  isReply: z.boolean().optional(),
  parentId: z.string().optional(),
});

export type CommentMeta = z.infer<typeof CommentMetaSchema>;

/**
 * Transcript source schema
 */
export const TranscriptSourceSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  channelName: z.string(),
  publishedAt: z.string().datetime().optional(),
  transcript: z.string(),
  duration: z.number().optional(),
  viewCount: z.number().optional(),
});

export type TranscriptSource = z.infer<typeof TranscriptSourceSchema>;

/**
 * Transcript chunk metadata schema
 */
export const TranscriptMetaSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  channelName: z.string(),
  publishedAt: z.string().optional(),
  duration: z.number().optional(),
  viewCount: z.number().optional(),
  startTime: z.number().optional(), // Start time of chunk in seconds
  endTime: z.number().optional(), // End time of chunk in seconds
});

export type TranscriptMeta = z.infer<typeof TranscriptMetaSchema>;

/**
 * Product source schema
 */
export const ProductSourceSchema = z.object({
  productId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  price: z.number().optional(),
  url: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type ProductSource = z.infer<typeof ProductSourceSchema>;

/**
 * Product metadata schema
 */
export const ProductMetaSchema = z.object({
  name: z.string(),
  price: z.number().optional(),
  url: z.string().optional(),
  imageUrl: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  chunkType: z.enum(["summary", "detail"]), // summary chunk or detail chunk
});

export type ProductMeta = z.infer<typeof ProductMetaSchema>;

/**
 * RAG Document schema (for database)
 */
export const RagDocumentSchema = z.object({
  id: z.number(),
  sourceType: z.enum(["comment", "transcript", "product"]),
  sourceId: z.string(),
  meta: z.union([CommentMetaSchema, TranscriptMetaSchema, ProductMetaSchema]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RagDocument = z.infer<typeof RagDocumentSchema>;

/**
 * RAG Chunk schema (for database)
 */
export const RagChunkSchema = z.object({
  id: z.number(),
  docId: z.number(),
  chunkIndex: z.number(),
  text: z.string(),
  meta: z.union([CommentMetaSchema, TranscriptMetaSchema, ProductMetaSchema]),
  embedding: z.array(z.number()).optional(),
  createdAt: z.date(),
});

export type RagChunk = z.infer<typeof RagChunkSchema>;

/**
 * Search query schema
 */
export const SearchQuerySchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
  videoId: z.string().optional(), // Filter by video
  sourceType: z.enum(["comment", "transcript", "product"]).optional(), // Filter by source type
  topK: z.number().min(1).max(20).default(6), // Number of results
  minScore: z.number().min(0).max(1).optional(), // Minimum similarity score
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/**
 * Search result schema
 */
export const SearchResultSchema = z.object({
  id: z.number(),
  docId: z.number(),
  chunkIndex: z.number(),
  text: z.string(),
  meta: z.union([CommentMetaSchema, TranscriptMetaSchema, ProductMetaSchema]),
  score: z.number(), // Similarity score (0-1)
  sourceType: z.enum(["comment", "transcript", "product"]),
  sourceId: z.string(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

/**
 * Answer request schema
 */
export const AnswerRequestSchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
  videoId: z.string().optional(),
  includeProducts: z.boolean().default(true),
  includeTranscripts: z.boolean().default(true),
  includeComments: z.boolean().default(false),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(100).max(4000).optional(),
});

export type AnswerRequest = z.infer<typeof AnswerRequestSchema>;

/**
 * Answer response schema
 */
export const AnswerResponseSchema = z.object({
  answer: z.string(),
  contexts: z.array(SearchResultSchema),
  tokenUsage: z.object({
    queryTokens: z.number(),
    systemTokens: z.number(),
    contextTokens: z.number(),
    totalTokens: z.number(),
  }),
  model: z.string(),
});

export type AnswerResponse = z.infer<typeof AnswerResponseSchema>;

/**
 * Batch answer request schema (for multiple comments)
 */
export const BatchAnswerRequestSchema = z.object({
  videoId: z.string(),
  commentIds: z.array(z.string()).min(1).max(50), // Max 50 comments per batch
  includeProducts: z.boolean().default(true),
  includeTranscripts: z.boolean().default(true),
  temperature: z.number().min(0).max(2).default(0.7),
});

export type BatchAnswerRequest = z.infer<typeof BatchAnswerRequestSchema>;

/**
 * Batch answer response schema
 */
export const BatchAnswerResponseSchema = z.object({
  results: z.array(
    z.object({
      commentId: z.string(),
      answer: z.string(),
      contexts: z.array(SearchResultSchema),
    })
  ),
  totalTokensUsed: z.number(),
});

export type BatchAnswerResponse = z.infer<typeof BatchAnswerResponseSchema>;

/**
 * Ingest request schema
 */
export const IngestRequestSchema = z.object({
  sourceType: z.enum(["comment", "transcript", "product"]),
  data: z.union([
    CommentSourceSchema,
    TranscriptSourceSchema,
    ProductSourceSchema,
    z.array(CommentSourceSchema),
    z.array(TranscriptSourceSchema),
    z.array(ProductSourceSchema),
  ]),
  overwrite: z.boolean().default(false), // Replace existing document if exists
});

export type IngestRequest = z.infer<typeof IngestRequestSchema>;

/**
 * Ingest response schema
 */
export const IngestResponseSchema = z.object({
  success: z.boolean(),
  documentsCreated: z.number(),
  chunksCreated: z.number(),
  errors: z.array(z.string()).optional(),
});

export type IngestResponse = z.infer<typeof IngestResponseSchema>;
