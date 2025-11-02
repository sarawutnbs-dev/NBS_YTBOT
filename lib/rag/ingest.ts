import { PrismaClient } from "@prisma/client";
import { normalizeForRAG } from "./normalize";
import { chunkText, chunkTranscript, chunkProductDescription, chunkComment, TextChunk } from "./chunk";
import { createEmbeddings } from "./openai";
import {
  CommentSource,
  TranscriptSource,
  ProductSource,
  CommentMeta,
  TranscriptMeta,
  ProductMeta,
} from "./schema";
import { deleteDocument } from "./retriever";

const prisma = new PrismaClient();

/**
 * Ingest a comment into RAG
 */
export async function ingestComment(
  comment: CommentSource,
  overwrite: boolean = false
): Promise<{ docId: number; chunksCreated: number }> {
  const sourceId = comment.commentId;

  // Delete existing if overwrite
  if (overwrite) {
    await deleteDocument("comment", sourceId);
  }

  // Normalize text
  const normalizedText = normalizeForRAG(comment.text, {
    removeEmojis: false, // Keep emojis in comments for context
    cleanUrls: false, // Keep URLs for reference
  });

  if (!normalizedText.trim()) {
    throw new Error("Comment text is empty after normalization");
  }

  // Create metadata
  const meta: CommentMeta = {
    videoId: comment.videoId,
    authorName: comment.authorName,
    publishedAt: comment.publishedAt,
    likeCount: comment.likeCount,
    isReply: comment.isReply,
    parentId: comment.parentId,
  };

  // Create document
  const doc = await prisma.ragDocument.create({
    data: {
      sourceType: "comment",
      sourceId,
      meta: meta as any,
    },
  });

  // Chunk text (comments are typically single chunk)
  const chunks = chunkComment(normalizedText);

  // Generate embeddings for all chunks
  const embeddings = await createEmbeddings(chunks.map((c) => c.text));

  // Store chunks with embeddings
  const chunkRecords = await Promise.all(
    chunks.map((chunk, idx) =>
      prisma.$executeRaw`
        INSERT INTO "RagChunk" ("docId", "chunkIndex", "text", "meta", "embedding", "createdAt")
        VALUES (
          ${doc.id},
          ${chunk.index},
          ${chunk.text},
          ${JSON.stringify(meta)}::jsonb,
          ${JSON.stringify(embeddings[idx])}::vector,
          NOW()
        )
      `
    )
  );

  console.log(`[ingest] Comment ${sourceId}: created ${chunks.length} chunks`);

  return {
    docId: doc.id,
    chunksCreated: chunks.length,
  };
}

/**
 * Ingest a transcript into RAG
 */
export async function ingestTranscript(
  transcript: TranscriptSource,
  overwrite: boolean = false
): Promise<{ docId: number; chunksCreated: number }> {
  const sourceId = transcript.videoId;

  // Delete existing if overwrite
  if (overwrite) {
    await deleteDocument("transcript", sourceId);
  }

  // Normalize text
  const normalizedText = normalizeForRAG(transcript.transcript, {
    removeEmojis: true,
    cleanUrls: true,
  });

  if (!normalizedText.trim()) {
    throw new Error("Transcript text is empty after normalization");
  }

  // Create base metadata
  const baseMeta: Omit<TranscriptMeta, "startTime" | "endTime"> = {
    videoId: transcript.videoId,
    title: transcript.title,
    channelName: transcript.channelName,
    publishedAt: transcript.publishedAt,
    duration: transcript.duration,
    viewCount: transcript.viewCount,
  };

  // Create document
  const doc = await prisma.ragDocument.create({
    data: {
      sourceType: "transcript",
      sourceId,
      meta: baseMeta as any,
    },
  });

  // Chunk text (300-500 tokens with 60 token overlap)
  const chunks = chunkTranscript(normalizedText);

  // Generate embeddings for all chunks
  const embeddings = await createEmbeddings(chunks.map((c) => c.text));

  // Estimate timestamps for each chunk (if duration is available)
  const chunkWithTimestamps = chunks.map((chunk, idx) => {
    let meta: TranscriptMeta = { ...baseMeta };

    if (transcript.duration) {
      // Rough estimate: distribute chunks evenly across video duration
      const totalChars = normalizedText.length;
      const startRatio = chunk.startChar / totalChars;
      const endRatio = chunk.endChar / totalChars;

      meta.startTime = Math.floor(startRatio * transcript.duration);
      meta.endTime = Math.floor(endRatio * transcript.duration);
    }

    return { chunk, meta };
  });

  // Store chunks with embeddings
  await Promise.all(
    chunkWithTimestamps.map(({ chunk, meta }, idx) =>
      prisma.$executeRaw`
        INSERT INTO "RagChunk" ("docId", "chunkIndex", "text", "meta", "embedding", "createdAt")
        VALUES (
          ${doc.id},
          ${chunk.index},
          ${chunk.text},
          ${JSON.stringify(meta)}::jsonb,
          ${JSON.stringify(embeddings[idx])}::vector,
          NOW()
        )
      `
    )
  );

  console.log(`[ingest] Transcript ${sourceId}: created ${chunks.length} chunks`);

  return {
    docId: doc.id,
    chunksCreated: chunks.length,
  };
}

/**
 * Ingest a product into RAG
 */
export async function ingestProduct(
  product: ProductSource,
  overwrite: boolean = false
): Promise<{ docId: number; chunksCreated: number }> {
  const sourceId = product.productId;

  // Delete existing if overwrite
  if (overwrite) {
    await deleteDocument("product", sourceId);
  }

  // Create base metadata
  const baseMeta: Omit<ProductMeta, "chunkType"> = {
    name: product.name,
    price: product.price,
    url: product.url,
    imageUrl: product.imageUrl,
    category: product.category,
    tags: product.tags,
  };

  // Create document
  const doc = await prisma.ragDocument.create({
    data: {
      sourceType: "product",
      sourceId,
      meta: baseMeta as any,
    },
  });

  const allChunks: Array<{ text: string; meta: ProductMeta }> = [];

  // Create summary chunk (name + short description)
  const summaryText = normalizeForRAG(
    `${product.name}. ${product.description || ""}`.trim(),
    {
      removeEmojis: true,
      cleanUrls: false,
      maxLength: 500, // Keep summary short
    }
  );

  if (summaryText.trim()) {
    allChunks.push({
      text: summaryText,
      meta: { ...baseMeta, chunkType: "summary" },
    });
  }

  // Create detail chunks (full description)
  if (product.description && product.description.trim()) {
    const normalizedDesc = normalizeForRAG(product.description, {
      removeEmojis: true,
      cleanUrls: false,
    });

    const descChunks = chunkProductDescription(normalizedDesc);

    descChunks.forEach((chunk) => {
      allChunks.push({
        text: chunk.text,
        meta: { ...baseMeta, chunkType: "detail" },
      });
    });
  }

  if (allChunks.length === 0) {
    throw new Error("Product has no text content after normalization");
  }

  // Generate embeddings for all chunks
  const embeddings = await createEmbeddings(allChunks.map((c) => c.text));

  // Store chunks with embeddings
  await Promise.all(
    allChunks.map((chunk, idx) =>
      prisma.$executeRaw`
        INSERT INTO "RagChunk" ("docId", "chunkIndex", "text", "meta", "embedding", "createdAt")
        VALUES (
          ${doc.id},
          ${idx},
          ${chunk.text},
          ${JSON.stringify(chunk.meta)}::jsonb,
          ${JSON.stringify(embeddings[idx])}::vector,
          NOW()
        )
      `
    )
  );

  console.log(`[ingest] Product ${sourceId}: created ${allChunks.length} chunks`);

  return {
    docId: doc.id,
    chunksCreated: allChunks.length,
  };
}

/**
 * Batch ingest comments
 */
export async function ingestComments(
  comments: CommentSource[],
  overwrite: boolean = false
): Promise<{
  successful: number;
  failed: number;
  errors: Array<{ commentId: string; error: string }>;
}> {
  const results = {
    successful: 0,
    failed: 0,
    errors: [] as Array<{ commentId: string; error: string }>,
  };

  for (const comment of comments) {
    try {
      await ingestComment(comment, overwrite);
      results.successful++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        commentId: comment.commentId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.error(`[ingest] Failed to ingest comment ${comment.commentId}:`, error);
    }
  }

  console.log(
    `[ingest] Batch comments: ${results.successful} successful, ${results.failed} failed`
  );

  return results;
}

/**
 * Batch ingest transcripts
 */
export async function ingestTranscripts(
  transcripts: TranscriptSource[],
  overwrite: boolean = false
): Promise<{
  successful: number;
  failed: number;
  errors: Array<{ videoId: string; error: string }>;
}> {
  const results = {
    successful: 0,
    failed: 0,
    errors: [] as Array<{ videoId: string; error: string }>,
  };

  for (const transcript of transcripts) {
    try {
      await ingestTranscript(transcript, overwrite);
      results.successful++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        videoId: transcript.videoId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.error(`[ingest] Failed to ingest transcript ${transcript.videoId}:`, error);
    }
  }

  console.log(
    `[ingest] Batch transcripts: ${results.successful} successful, ${results.failed} failed`
  );

  return results;
}

/**
 * Batch ingest products
 */
export async function ingestProducts(
  products: ProductSource[],
  overwrite: boolean = false
): Promise<{
  successful: number;
  failed: number;
  errors: Array<{ productId: string; error: string }>;
}> {
  const results = {
    successful: 0,
    failed: 0,
    errors: [] as Array<{ productId: string; error: string }>,
  };

  for (const product of products) {
    try {
      await ingestProduct(product, overwrite);
      results.successful++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        productId: product.productId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.error(`[ingest] Failed to ingest product ${product.productId}:`, error);
    }
  }

  console.log(
    `[ingest] Batch products: ${results.successful} successful, ${results.failed} failed`
  );

  return results;
}

/**
 * Re-generate embeddings for existing chunks (useful if switching models)
 */
export async function regenerateEmbeddings(
  sourceType?: "comment" | "transcript" | "product"
): Promise<{ chunksUpdated: number }> {
  try {
    // Fetch chunks without embeddings or all chunks if regenerating
    const whereClause = sourceType
      ? `WHERE d."sourceType" = '${sourceType}'`
      : "";

    const chunks = await prisma.$queryRawUnsafe<
      Array<{ id: number; text: string }>
    >(`
      SELECT c.id, c.text
      FROM "RagChunk" c
      JOIN "RagDocument" d ON c."docId" = d.id
      ${whereClause}
      ORDER BY c.id
    `);

    if (chunks.length === 0) {
      console.log("[ingest] No chunks to regenerate");
      return { chunksUpdated: 0 };
    }

    console.log(`[ingest] Regenerating embeddings for ${chunks.length} chunks...`);

    // Generate embeddings in batches
    const batchSize = parseInt(process.env.EMBED_BATCH || "64");
    let updated = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await createEmbeddings(batch.map((c) => c.text));

      // Update chunks with new embeddings
      await Promise.all(
        batch.map((chunk, idx) =>
          prisma.$executeRaw`
            UPDATE "RagChunk"
            SET "embedding" = ${JSON.stringify(embeddings[idx])}::vector
            WHERE id = ${chunk.id}
          `
        )
      );

      updated += batch.length;
      console.log(`[ingest] Regenerated ${updated}/${chunks.length} embeddings`);
    }

    console.log(`[ingest] Successfully regenerated ${updated} embeddings`);

    return { chunksUpdated: updated };
  } catch (error) {
    console.error("[ingest] Failed to regenerate embeddings:", error);
    throw new Error(
      `Failed to regenerate embeddings: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Delete all documents of a specific type
 */
export async function deleteAllDocuments(
  sourceType: "comment" | "transcript" | "product"
): Promise<{ documentsDeleted: number }> {
  try {
    const result = await prisma.ragDocument.deleteMany({
      where: { sourceType },
    });

    console.log(`[ingest] Deleted ${result.count} ${sourceType} documents`);

    return { documentsDeleted: result.count };
  } catch (error) {
    console.error(`[ingest] Failed to delete ${sourceType} documents:`, error);
    throw new Error(
      `Failed to delete documents: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
