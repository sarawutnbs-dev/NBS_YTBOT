import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { ingestProduct, ingestProducts } from "@/lib/rag/ingest";
import { ProductSourceSchema } from "@/lib/rag/schema";
import { z } from "zod";

const RequestSchema = z.object({
  products: z.union([
    ProductSourceSchema,
    z.array(ProductSourceSchema),
  ]),
  overwrite: z.boolean().optional().default(false),
});

/**
 * POST /api/ingest/products
 * Ingest product(s) into RAG system
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validated = RequestSchema.parse(body);

    const { products, overwrite } = validated;

    // Handle single product
    if (!Array.isArray(products)) {
      const result = await ingestProduct(products, overwrite);

      return NextResponse.json({
        success: true,
        documentsCreated: 1,
        chunksCreated: result.chunksCreated,
      });
    }

    // Handle multiple products
    const result = await ingestProducts(products, overwrite);

    // Count total chunks created
    let totalChunks = 0;
    if (result.successful > 0) {
      // Estimate: products typically create 2-4 chunks each (summary + detail chunks)
      totalChunks = result.successful * 2; // Rough estimate
    }

    return NextResponse.json({
      success: result.failed === 0,
      documentsCreated: result.successful,
      chunksCreated: totalChunks,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("[api] /ingest/products error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to ingest products",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ingest/products
 * Get ingestion status for product
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json(
        { error: "productId parameter is required" },
        { status: 400 }
      );
    }

    // Check if product is indexed
    const { getChunksBySource } = await import("@/lib/rag/retriever");
    const chunks = await getChunksBySource("product", productId);

    return NextResponse.json({
      indexed: chunks.length > 0,
      chunks: chunks.length,
      data: chunks.length > 0 ? chunks : undefined,
    });
  } catch (error) {
    console.error("[api] /ingest/products GET error:", error);

    return NextResponse.json(
      {
        error: "Failed to get product status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ingest/products
 * Delete product from RAG system
 */
export async function DELETE(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json(
        { error: "productId parameter is required" },
        { status: 400 }
      );
    }

    // Delete product
    const { deleteDocument } = await import("@/lib/rag/retriever");
    const deleted = await deleteDocument("product", productId);

    return NextResponse.json({
      success: deleted,
      message: deleted
        ? "Product deleted successfully"
        : "Product not found",
    });
  } catch (error) {
    console.error("[api] /ingest/products DELETE error:", error);

    return NextResponse.json(
      {
        error: "Failed to delete product",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
