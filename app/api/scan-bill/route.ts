import { NextResponse } from "next/server";
import { buildMockExtraction, runOcrPipeline } from "@/lib/ocrEngine";
import type { Party, Product, ScanKind } from "@/lib/types";

// Vision waterfall (implemented in runOcrPipeline):
// glm-4.6v-flashx → glm-4.6v-flash (2× 429 backoff) → qwen-vl-plus backup
// → glm-4.6v only when confidence < 0.75 and flashx proved paid balance.
export const runtime = "nodejs";
export const maxDuration = 180;

interface ScanRequest {
  imageDataUrl?: string;
  kind?: ScanKind | "sale_return";
  scanType?: ScanKind | "sale_return";
  products?: Product[];
  parties?: Party[];
  fileName?: string;
}

function normalizeKind(value: unknown): ScanKind {
  if (value === "purchase") return "purchase";
  if (value === "return" || value === "sale_return") return "return";
  return "sale";
}

export async function POST(request: Request) {
  let body: ScanRequest;
  try {
    body = (await request.json()) as ScanRequest;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const imageDataUrl = body.imageDataUrl || "";
  const kind = normalizeKind(body.kind ?? body.scanType);
  const products = Array.isArray(body.products) ? body.products : [];
  const parties = Array.isArray(body.parties) ? body.parties : [];

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl);
  if (!match) {
    return NextResponse.json(
      { success: false, error: "Please upload a valid JPG, PNG or WebP bill image." },
      { status: 400 },
    );
  }

  const base64 = match[2];
  if (base64.length > 8_000_000) {
    return NextResponse.json(
      { success: false, error: "Image is too large. Please retake the photo." },
      { status: 413 },
    );
  }

  try {
    const result = await runOcrPipeline({
      imageDataUrl,
      kind,
      products,
      parties,
    });

    return NextResponse.json({
      success: true,
      data: result.data,
      mock: result.mock,
      warning: result.warning,
      model_used: result.data.model_used,
      debug_error: result.debugError,
    });
  } catch (error) {
    console.error("[scan-bill] OCR pipeline error:", error);
    const debugError =
      error instanceof Error
        ? error.message.replace(/sk-[A-Za-z0-9._-]+/g, "[redacted]").slice(0, 500)
        : "Unknown pipeline error.";
    return NextResponse.json({
      success: true,
      data: buildMockExtraction(kind, products, parties),
      mock: true,
      warning:
        "OCR pipeline error. A realistic demo parse is shown so the scanner remains usable.",
      model_used: "mock-fallback",
      debug_error: debugError,
    });
  }
}
