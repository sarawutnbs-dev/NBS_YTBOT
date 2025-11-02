# RAG System Documentation

Complete Retrieval Augmented Generation (RAG) system for NBS_YTBOT YouTube comment reply assistant.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setup](#setup)
4. [Core Libraries](#core-libraries)
5. [API Endpoints](#api-endpoints)
6. [Job Scripts](#job-scripts)
7. [Usage Examples](#usage-examples)
8. [Configuration](#configuration)
9. [Monitoring](#monitoring)

---

## Overview

The RAG system enables intelligent, context-aware responses to YouTube comments by:

- **Indexing video transcripts** for video content context
- **Indexing product catalogs** for relevant product recommendations
- **Indexing comments** for finding similar discussions
- **Hybrid search** combining vector similarity (70%) and keyword matching (30%)
- **Smart chunking** with overlap for better context retention
- **Token management** to stay within API limits (max 2800 context tokens)
- **Thai language support** with specialized normalization

### Key Features

- ✅ **pgvector integration** for fast similarity search
- ✅ **HNSW indexing** for efficient high-dimensional vectors
- ✅ **OpenAI embeddings** (text-embedding-3-small, 1536 dimensions)
- ✅ **Batch processing** up to 64 embeddings per API call
- ✅ **Cost optimization** through intelligent chunking and caching
- ✅ **Full authentication** on all API endpoints
- ✅ **Comprehensive statistics** and health monitoring

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     RAG System Architecture                  │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Comments   │────▶│   Normalize   │────▶│    Chunk     │
│ Transcripts  │     │   & Clean     │     │  (overlap)   │
│   Products   │     └──────────────┘     └──────────────┘
└──────────────┘              │                     │
                              ▼                     ▼
                      ┌──────────────┐     ┌──────────────┐
                      │  OpenAI API  │     │   Metadata   │
                      │  Embeddings  │     │  Extraction  │
                      └──────────────┘     └──────────────┘
                              │                     │
                              └──────┬──────────────┘
                                     ▼
                            ┌──────────────┐
                            │  PostgreSQL  │
                            │  + pgvector  │
                            └──────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
┌──────────────┐           ┌──────────────┐           ┌──────────────┐
│   Vector     │           │   Keyword    │           │   Metadata   │
│   Search     │           │   Search     │           │   Filter     │
│  (Cosine)    │           │   (BM25)     │           │              │
└──────────────┘           └──────────────┘           └──────────────┘
        │                            │                            │
        └────────────────────────────┼────────────────────────────┘
                                     ▼
                            ┌──────────────┐
                            │   Hybrid     │
                            │   Re-rank    │
                            └──────────────┘
                                     │
                                     ▼
                            ┌──────────────┐
                            │   Context    │
                            │  Truncation  │
                            └──────────────┘
                                     │
                                     ▼
                            ┌──────────────┐
                            │   GPT-4o     │
                            │   Response   │
                            └──────────────┘
```

---

## Setup

### 1. Database Setup

Ensure PostgreSQL with pgvector is running:

```bash
docker run --name nbs-ytbot-postgres \
  -e POSTGRES_USER=nbsytbot \
  -e POSTGRES_PASSWORD=nbsytbot123 \
  -e POSTGRES_DB=nbsytbot \
  -p 5433:5432 \
  -d pgvector/pgvector:pg16
```

### 2. Run Migration

```bash
npx prisma migrate deploy
```

### 3. Environment Variables

Add to `.env`:

```env
# RAG Configuration
EMBED_MODEL="text-embedding-3-small"
EMBED_DIMENSIONS="1536"
CHAT_MODEL="gpt-4o-mini"
RAG_TOP_K="6"
RAG_MAX_CONTEXT_TOKENS="2800"
EMBED_BATCH="64"
OPENAI_API_KEY="your-openai-api-key"
```

### 4. Verify Setup

```bash
curl http://localhost:3000/api/rag/stats?type=health
```

---

## Core Libraries

### [lib/rag/openai.ts](lib/rag/openai.ts)
OpenAI API wrapper for embeddings and chat completions.

**Functions:**
- `createEmbedding(text: string): Promise<number[]>`
- `createEmbeddings(texts: string[]): Promise<number[][]>` (batch)
- `chatCompletion(messages, options): Promise<string>`

### [lib/rag/tokenizer.ts](lib/rag/tokenizer.ts)
Token counting using tiktoken (cl100k_base encoding).

**Functions:**
- `countTokens(text: string): number`
- `truncateToTokens(text: string, maxTokens: number): string`
- `estimateContextCost(contexts, query, systemPrompt)`
- `truncateContexts(contexts, maxTotalTokens, reservedTokens)`

### [lib/rag/normalize.ts](lib/rag/normalize.ts)
Text normalization with Thai language support.

**Functions:**
- `normalizeText(text: string): string`
- `normalizeForRAG(text, options)` - Full pipeline
- `normalizeThaiText(text: string): string`
- `cleanText(text: string): string` - Removes URLs, emails

### [lib/rag/chunk.ts](lib/rag/chunk.ts)
Smart text chunking with overlap.

**Functions:**
- `chunkTranscript(text)` - 400 tokens, 60 overlap
- `chunkProductDescription(text)` - 120 tokens, 20 overlap
- `chunkComment(text)` - Single chunk
- `chunkText(text, options)` - Custom chunking

### [lib/rag/schema.ts](lib/rag/schema.ts)
Zod validation schemas for all data types.

**Schemas:**
- `CommentSourceSchema`, `TranscriptSourceSchema`, `ProductSourceSchema`
- `SearchQuerySchema`, `SearchResultSchema`
- `AnswerRequestSchema`, `AnswerResponseSchema`
- `IngestRequestSchema`, `IngestResponseSchema`

### [lib/rag/retriever.ts](lib/rag/retriever.ts)
Vector similarity and hybrid search.

**Functions:**
- `vectorSearch(queryEmbedding, options)` - Cosine similarity
- `keywordSearch(query, options)` - BM25-like full-text
- `hybridSearch(query, options)` - Combined weighted search
- `getChunksBySource(sourceType, sourceId)`
- `deleteDocument(sourceType, sourceId)`
- `getIndexStats()` - Statistics

### [lib/rag/ingest.ts](lib/rag/ingest.ts)
Document ingestion pipeline.

**Functions:**
- `ingestComment(comment, overwrite)`
- `ingestTranscript(transcript, overwrite)`
- `ingestProduct(product, overwrite)`
- `ingestComments(comments[], overwrite)` - Batch
- `regenerateEmbeddings(sourceType?)` - Re-index

### [lib/rag/answer.ts](lib/rag/answer.ts)
Answer generation with RAG.

**Functions:**
- `generateAnswer(request): Promise<AnswerResponse>`
- `generateBatchAnswers(videoId, commentQueries, options)`
- `previewContexts(query, options)` - Debug helper
- `findRelevantProducts(query, topK)`

### [lib/rag/stats.ts](lib/rag/stats.ts)
Statistics and health monitoring.

**Functions:**
- `getRagStats()` - Comprehensive stats
- `getRagHealth()` - System health check
- `getDocumentDetails(docId)` - Document info

---

## API Endpoints

### Ingestion APIs

#### `POST /api/ingest/comments`
Ingest comment(s) into RAG system.

**Request:**
```json
{
  "comments": {
    "commentId": "comment123",
    "videoId": "video123",
    "authorName": "User Name",
    "text": "Comment text...",
    "publishedAt": "2024-01-01T00:00:00Z",
    "likeCount": 5
  },
  "overwrite": false
}
```

**Response:**
```json
{
  "success": true,
  "documentsCreated": 1,
  "chunksCreated": 1
}
```

#### `POST /api/ingest/transcripts`
Ingest video transcript(s).

**Request:**
```json
{
  "transcripts": {
    "videoId": "video123",
    "title": "Video Title",
    "channelName": "Channel Name",
    "transcript": "Full transcript text...",
    "duration": 600,
    "viewCount": 1000
  },
  "overwrite": false
}
```

#### `POST /api/ingest/products`
Ingest product(s).

**Request:**
```json
{
  "products": {
    "productId": "prod123",
    "name": "Product Name",
    "description": "Product description...",
    "price": 99.99,
    "url": "https://...",
    "category": "electronics",
    "tags": ["featured", "bestseller"]
  },
  "overwrite": false
}
```

### Answer APIs

#### `POST /api/answer`
Generate answer using RAG.

**Request:**
```json
{
  "query": "What is this video about?",
  "videoId": "video123",
  "includeProducts": true,
  "includeTranscripts": true,
  "includeComments": false,
  "temperature": 0.7
}
```

**Response:**
```json
{
  "answer": "Based on the video transcript...",
  "contexts": [
    {
      "id": 1,
      "text": "Context text...",
      "score": 0.85,
      "sourceType": "transcript",
      "sourceId": "video123"
    }
  ],
  "tokenUsage": {
    "queryTokens": 10,
    "systemTokens": 50,
    "contextTokens": 200,
    "totalTokens": 260
  },
  "model": "gpt-4o-mini"
}
```

#### `GET /api/answer?query=...&videoId=...`
Preview contexts without generating answer (debugging).

#### `POST /api/answer/batch`
Generate answers for multiple comments.

**Request:**
```json
{
  "videoId": "video123",
  "commentIds": ["c1", "c2", "c3"],
  "comments": [
    { "commentId": "c1", "text": "Question 1?" },
    { "commentId": "c2", "text": "Question 2?" }
  ],
  "includeProducts": true,
  "includeTranscripts": true,
  "temperature": 0.7
}
```

### Statistics API

#### `GET /api/rag/stats`
Get comprehensive RAG statistics.

#### `GET /api/rag/stats?type=health`
Get system health status.

#### `GET /api/rag/stats?type=document&docId=123`
Get document details.

---

## Job Scripts

### [jobs/ingest-comments.ts](jobs/ingest-comments.ts)
Auto-ingest comments from database.

**Usage:**
```bash
# Ingest all comments for a video
npx tsx jobs/ingest-comments.ts --video-id abc123

# Ingest top comments (min 5 likes, no replies)
npx tsx jobs/ingest-comments.ts --min-likes 5 --skip-replies --limit 100

# Preview without ingesting
npx tsx jobs/ingest-comments.ts --dry-run

# Overwrite existing
npx tsx jobs/ingest-comments.ts --overwrite
```

### [jobs/ingest-transcripts.ts](jobs/ingest-transcripts.ts)
Auto-ingest video transcripts.

**Usage:**
```bash
# Ingest specific video
npx tsx jobs/ingest-transcripts.ts --video-id abc123

# Ingest recent videos only
npx tsx jobs/ingest-transcripts.ts --only-recent --limit 10

# Ingest popular videos
npx tsx jobs/ingest-transcripts.ts --min-views 1000

# Preview
npx tsx jobs/ingest-transcripts.ts --dry-run
```

### [jobs/ingest-products.ts](jobs/ingest-products.ts)
Auto-ingest products.

**Usage:**
```bash
# Ingest all products
npx tsx jobs/ingest-products.ts

# Ingest by category
npx tsx jobs/ingest-products.ts --category electronics

# Ingest by tags
npx tsx jobs/ingest-products.ts --tags "featured,bestseller"

# Preview
npx tsx jobs/ingest-products.ts --dry-run
```

---

## Usage Examples

### Example 1: Ingest a Video Transcript

```typescript
import { ingestTranscript } from "@/lib/rag/ingest";

const transcript = {
  videoId: "abc123",
  title: "How to use RAG",
  channelName: "Tech Channel",
  transcript: "Welcome to this tutorial...",
  duration: 600,
  viewCount: 5000,
};

const result = await ingestTranscript(transcript, false);
console.log(`Created ${result.chunksCreated} chunks`);
```

### Example 2: Search for Relevant Contexts

```typescript
import { hybridSearch } from "@/lib/rag/retriever";

const results = await hybridSearch("How do I use this feature?", {
  topK: 6,
  videoId: "abc123",
  sourceType: "transcript",
  minScore: 0.3,
});

console.log(`Found ${results.length} relevant chunks`);
```

### Example 3: Generate an Answer

```typescript
import { generateAnswer } from "@/lib/rag/answer";

const response = await generateAnswer({
  query: "What products do you recommend?",
  videoId: "abc123",
  includeProducts: true,
  includeTranscripts: true,
  temperature: 0.7,
});

console.log(response.answer);
console.log(`Used ${response.tokenUsage.totalTokens} tokens`);
```

### Example 4: Check System Health

```typescript
import { getRagHealth, getRagStats } from "@/lib/rag/stats";

const health = await getRagHealth();
console.log(`Status: ${health.status}`);
console.log(`Issues: ${health.issues.join(", ")}`);

const stats = await getRagStats();
console.log(`Total documents: ${stats.overview.totalDocuments}`);
console.log(`Embedding coverage: ${stats.overview.embeddingCoverage}%`);
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBED_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `EMBED_DIMENSIONS` | `1536` | Embedding vector dimensions |
| `EMBED_BATCH` | `64` | Batch size for embeddings |
| `CHAT_MODEL` | `gpt-4o-mini` | Chat completion model |
| `RAG_TOP_K` | `6` | Number of contexts to retrieve |
| `RAG_MAX_CONTEXT_TOKENS` | `2800` | Max tokens for context |
| `OPENAI_API_KEY` | - | OpenAI API key (required) |

### Chunking Strategy

| Source Type | Max Tokens | Overlap | Strategy |
|-------------|------------|---------|----------|
| Transcript | 400 | 60 | Sentence-aware |
| Product | 120 | 20 | Summary + details |
| Comment | N/A | N/A | Single chunk |

### Search Weights

| Search Type | Weight | Description |
|-------------|--------|-------------|
| Vector | 70% | Semantic similarity |
| Keyword | 30% | BM25 full-text |

---

## Monitoring

### Health Check

```bash
curl http://localhost:3000/api/rag/stats?type=health
```

**Response:**
```json
{
  "status": "healthy",
  "issues": [],
  "checks": {
    "databaseConnected": true,
    "hasDocuments": true,
    "hasEmbeddings": true,
    "embeddingCoverageOk": true
  }
}
```

### Statistics

```bash
curl http://localhost:3000/api/rag/stats
```

**Response:**
```json
{
  "overview": {
    "totalDocuments": 150,
    "totalChunks": 1200,
    "chunksWithEmbeddings": 1200,
    "embeddingCoverage": 100,
    "estimatedStorageKB": 7372
  },
  "bySourceType": {
    "comments": { "documents": 50, "chunks": 50, "avgChunksPerDoc": 1 },
    "transcripts": { "documents": 10, "chunks": 100, "avgChunksPerDoc": 10 },
    "products": { "documents": 90, "chunks": 180, "avgChunksPerDoc": 2 }
  },
  "recentActivity": {
    "documentsLast24h": 5,
    "documentsLast7d": 25,
    "chunksLast24h": 50,
    "chunksLast7d": 250
  }
}
```

---

## Troubleshooting

### Common Issues

1. **"extension 'vector' is not available"**
   - Use pgvector Docker image: `pgvector/pgvector:pg16`
   - Run migration: `npx prisma migrate deploy`

2. **"column cannot have more than 2000 dimensions"**
   - Use `text-embedding-3-small` (1536d) instead of `text-embedding-3-large` (3072d)

3. **Low embedding coverage**
   - Run: `npx tsx jobs/ingest-transcripts.ts --overwrite`
   - Check OpenAI API key is valid

4. **Token limit exceeded**
   - Reduce `RAG_TOP_K` from 6 to 4-5
   - Reduce `RAG_MAX_CONTEXT_TOKENS` from 2800 to 2000

---

## Performance Tips

1. **Batch Processing**: Always use batch functions for multiple items
2. **Embedding Caching**: Don't re-ingest unchanged content
3. **Index Maintenance**: Periodically check `embeddingCoverage`
4. **Query Optimization**: Use `minScore` to filter low-relevance results
5. **Token Management**: Monitor `tokenUsage` in responses

---

## Future Enhancements

- [ ] Query result caching for common questions
- [ ] Async batch processing with job queue
- [ ] Query performance logging and analytics
- [ ] Admin UI for managing indexed content
- [ ] Multi-language support beyond Thai
- [ ] Fine-tuned embedding model for domain-specific content

---

## License

MIT License - Part of NBS_YTBOT project

---

For more information, see the individual file documentation in `lib/rag/`.
