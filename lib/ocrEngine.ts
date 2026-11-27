import OpenAI from "openai";
import type {
  Party,
  PaymentMode,
  Product,
  ProductUnit,
  RoutingMode,
  ScanExtraction,
  ScanItem,
  ScanKind,
} from "./types";

const GLM_DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";
const QWEN_DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const GLM_FLASHX_MODEL = "glm-4.6v-flashx";
const GLM_FLASH_MODEL = "glm-4.6v-flash";
const GLM_DEEP_MODEL = "glm-4.6v";
const QWEN_VISION_MODEL = "qwen-vl-plus";
const MOCK_MODEL = "mock-fallback";
const DEFAULT_TIMEOUT_MS = 30_000;
const FLASH_429_RETRIES = 2;
const FLASH_429_BACKOFF_MS = 1_500;

const UNIT_VALUES: ProductUnit[] = ["length", "kg", "pcs"];

interface EngineConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

interface OcrConfig {
  glmFlashX: EngineConfig | null;
  glmFlash: EngineConfig | null;
  glmDeep: EngineConfig | null;
  qwen: EngineConfig | null;
  timeoutMs: number;
}

export interface OcrAttempt {
  model: string;
  status: "success" | "failed" | "skipped";
  reason?: string;
  retries?: number;
}

export interface OcrPipelineResult {
  data: ScanExtraction;
  mock: boolean;
  warning?: string;
  debugError?: string;
  attempts: OcrAttempt[];
}

export interface OcrPipelineInput {
  imageDataUrl: string;
  kind: ScanKind;
  products: Product[];
  parties: Party[];
}

const kindCopy: Record<ScanKind, { label: string; instruction: string }> = {
  sale: {
    label: "Sales bill (Becha Hua Maal)",
    instruction:
      "This is an outgoing sale. Read quantities sold, rates, any mazdoori/loading charge, and whether the customer paid cash or took udhaar.",
  },
  purchase: {
    label: "Purchase / stock list (Aaya Hua Maal)",
    instruction:
      "This is incoming stock, likely from a supplier or a stock register page. Read pipe specifications and quantities received. Treat every written stock row as a separate purchase item.",
  },
  return: {
    label: "Customer return (Maal Wapsi / sale_return)",
    instruction:
      "This is returned material from a customer. Quantities are positive numbers but stock must increase and the customer ledger must be credited for any udhaar return.",
  },
};

function getConfig(): OcrConfig {
  const glmKey = process.env.GLM_API_KEY?.trim() || "";
  const qwenKey = process.env.QWEN_API_KEY?.trim() || "";
  const timeout = Number(process.env.OCR_TIMEOUT_MS);
  const glmBase = process.env.GLM_BASE_URL || GLM_DEFAULT_BASE_URL;
  const qwenBase = process.env.QWEN_BASE_URL || QWEN_DEFAULT_BASE_URL;
  const flashxModel =
    process.env.GLM_FLASHX_MODEL?.trim() || GLM_FLASHX_MODEL;
  const flashModel = process.env.GLM_FALLBACK_MODEL?.trim() || GLM_FLASH_MODEL;
  const deepModel =
    process.env.GLM_ESCALATION_MODEL?.trim() ||
    process.env.GLM_PRIMARY_MODEL?.trim() ||
    process.env.GLM_MODEL?.trim() ||
    GLM_DEEP_MODEL;

  return {
    glmFlashX: glmKey
      ? { apiKey: glmKey, baseURL: glmBase, model: flashxModel }
      : null,
    glmFlash: glmKey
      ? { apiKey: glmKey, baseURL: glmBase, model: flashModel }
      : null,
    glmDeep: glmKey
      ? { apiKey: glmKey, baseURL: glmBase, model: deepModel }
      : null,
    qwen: qwenKey
      ? {
          apiKey: qwenKey,
          baseURL: qwenBase,
          model: process.env.QWEN_MODEL?.trim() || QWEN_VISION_MODEL,
        }
      : null,
    timeoutMs:
      Number.isFinite(timeout) && timeout >= 5_000 && timeout <= 120_000
        ? timeout
        : DEFAULT_TIMEOUT_MS,
  };
}

export async function runOcrPipeline(
  input: OcrPipelineInput,
): Promise<OcrPipelineResult> {
  const config = getConfig();
  const attempts: OcrAttempt[] = [];

  if (!config.glmFlashX && !config.qwen) {
    return {
      data: buildMockExtraction(input.kind, input.products, input.parties),
      mock: true,
      warning:
        "Mock fallback in use: no real vision model is configured. Add GLM_API_KEY or QWEN_API_KEY in .env.local and reload.",
      debugError: "No OCR API key configured (GLM_API_KEY / QWEN_API_KEY missing).",
      attempts: [
        {
          model: MOCK_MODEL,
          status: "success",
          reason: "No vision provider keys configured",
        },
      ],
    };
  }

  if (!config.glmFlashX) {
    attempts.push({
      model: GLM_FLASHX_MODEL,
      status: "skipped",
      reason: "GLM_API_KEY missing",
    });
  }
  if (!config.glmFlash) {
    attempts.push({
      model: GLM_FLASH_MODEL,
      status: "skipped",
      reason: "GLM_API_KEY missing",
    });
  }
  if (!config.qwen) {
    attempts.push({
      model: QWEN_VISION_MODEL,
      status: "skipped",
      reason: "QWEN_API_KEY missing",
    });
  }

  const systemPrompt = buildSystemPrompt(input.kind, input.products, input.parties);
  const baseUserPrompt = buildUserPrompt(input.kind);
  const failures: string[] = [];
  const warnings: string[] = [];

  let best: ScanExtraction | null = null;
  let bestSource: "flashx" | "flash" | "qwen" | "glm-deep" | null = null;
  let flashxSucceeded = false;

  // Stage 1 — dedicated low-cost vision model. This is the only call that can
  // prove the Z.ai account has usable balance for the paid 4.6v escalation.
  if (config.glmFlashX) {
    try {
      const raw = await callEngine({
        engine: config.glmFlashX,
        systemPrompt,
        userPrompt: baseUserPrompt,
        imageDataUrl: input.imageDataUrl,
        timeoutMs: config.timeoutMs,
      });
      const parsed = parseAndNormalize(
        raw,
        input.products,
        input.kind,
        config.glmFlashX.model,
      );
      if (!parsed) throw new Error("Vision response did not contain usable line items.");
      best = parsed;
      bestSource = "flashx";
      flashxSucceeded = true;
      attempts.push({ model: config.glmFlashX.model, status: "success" });
    } catch (error) {
      const reason = errorMessage(error);
      failures.push(`${config.glmFlashX.model}: ${reason}`);
      attempts.push({
        model: config.glmFlashX.model,
        status: "failed",
        reason,
      });
      console.warn(`[ocr] ${config.glmFlashX.model} failed:`, reason);
    }
  }

  // Stage 2 — free-tier flash fallback. Retry overloaded 429 responses up to
  // twice; an insufficient-balance 429 is terminal because retrying cannot help.
  if (!best && config.glmFlash) {
    try {
      const result = await callEngineWithRetry({
        engine: config.glmFlash,
        systemPrompt,
        userPrompt: baseUserPrompt,
        imageDataUrl: input.imageDataUrl,
        timeoutMs: config.timeoutMs,
        maxRetries: FLASH_429_RETRIES,
      });
      const parsed = parseAndNormalize(
        result.raw,
        input.products,
        input.kind,
        config.glmFlash.model,
      );
      if (!parsed) throw new Error("Vision response did not contain usable line items.");
      best = parsed;
      bestSource = "flash";
      attempts.push({
        model: config.glmFlash.model,
        status: "success",
        retries: result.retries,
      });
    } catch (error) {
      const reason = errorMessage(error);
      failures.push(`${config.glmFlash.model}: ${reason}`);
      attempts.push({
        model: config.glmFlash.model,
        status: "failed",
        reason,
        retries: retryCount(error),
      });
      console.warn(`[ocr] ${config.glmFlash.model} failed:`, reason);
    }
  }

  // Stage 3 — cross-provider Qwen backup whenever Z.ai produced no usable
  // result, or the Z.ai result is below the review threshold.
  if (config.qwen && (!best || best.confidence_score < 0.75)) {
    try {
      const raw = await callEngine({
        engine: config.qwen,
        systemPrompt,
        userPrompt: best
          ? buildReviewPrompt(baseUserPrompt, best, config.qwen.model)
          : baseUserPrompt,
        imageDataUrl: input.imageDataUrl,
        timeoutMs: config.timeoutMs,
      });
      const parsed = parseAndNormalize(
        raw,
        input.products,
        input.kind,
        config.qwen.model,
      );
      if (!parsed) throw new Error("Vision response did not contain usable line items.");
      attempts.push({ model: config.qwen.model, status: "success" });
      if (!best || parsed.confidence_score > best.confidence_score) {
        best = parsed;
        bestSource = "qwen";
      }
    } catch (error) {
      const reason = errorMessage(error);
      failures.push(`${config.qwen.model}: ${reason}`);
      attempts.push({
        model: config.qwen.model,
        status: "failed",
        reason,
      });
      warnings.push(
        "qwen-vl-plus backup failed. Verify every amber field before saving.",
      );
      console.warn(`[ocr] ${config.qwen.model} backup failed:`, reason);
    }
  }

  if (!best) {
    return {
      data: buildMockExtraction(input.kind, input.products, input.parties),
      mock: true,
      warning:
        "All configured vision models failed. A demo parse is shown so the UI stays usable — check the diagnostic below before saving.",
      debugError: failures.join(" | ") || "All configured vision providers failed.",
      attempts,
    };
  }

  // Stage 4 — paid 4.6v escalation is allowed only when flashx already proved
  // that the account has balance, and only while the best result is still low.
  if (
    flashxSucceeded &&
    config.glmDeep &&
    best.confidence_score < 0.75
  ) {
    try {
      const raw = await callEngine({
        engine: config.glmDeep,
        systemPrompt,
        userPrompt: buildReviewPrompt(baseUserPrompt, best, config.glmDeep.model),
        imageDataUrl: input.imageDataUrl,
        timeoutMs: config.timeoutMs,
      });
      const parsed = parseAndNormalize(
        raw,
        input.products,
        input.kind,
        config.glmDeep.model,
      );
      if (!parsed) throw new Error("Vision response did not contain usable line items.");
      attempts.push({ model: config.glmDeep.model, status: "success" });
      if (parsed.confidence_score > best.confidence_score) {
        const before = Math.round(best.confidence_score * 100);
        best = parsed;
        bestSource = "glm-deep";
        warnings.push(
          `Low confidence (${before}%). glm-4.6v escalation improved it to ${Math.round(
            parsed.confidence_score * 100,
          )}%.`,
        );
      } else {
        warnings.push(
          "glm-4.6v escalation did not improve the low-confidence result. Verify every amber field.",
        );
      }
    } catch (error) {
      const reason = errorMessage(error);
      failures.push(`${config.glmDeep.model}: ${reason}`);
      attempts.push({
        model: config.glmDeep.model,
        status: "failed",
        reason,
      });
      warnings.push(
        "glm-4.6v escalation failed. Verify every amber field before saving.",
      );
      console.warn(`[ocr] ${config.glmDeep.model} escalation failed:`, reason);
    }
  }

  if (bestSource === "flash") {
    warnings.push(
      "glm-4.6v-flashx failed, so the free glm-4.6v-flash model parsed this parchi. Review every amber field before saving.",
    );
  }
  if (bestSource === "qwen" && !flashxSucceeded) {
    warnings.push(
      "Z.ai did not produce a confident result; qwen-vl-plus cross-provider backup parsed this parchi.",
    );
  }
  if (bestSource === "qwen" && flashxSucceeded) {
    warnings.push(
      "Low confidence on glm-4.6v-flashx; qwen-vl-plus re-checked the parchi. Review every amber field.",
    );
  }
  if (best.confidence_score < 0.75) {
    warnings.push(
      "Vision confidence remains below 75%. Verify every amber field before saving.",
    );
  }

  return {
    data: best,
    mock: false,
    warning: warnings.length ? [...new Set(warnings)].join(" ") : undefined,
    debugError: failures.length ? failures.join(" | ") : undefined,
    attempts,
  };
}

function buildReviewPrompt(
  baseUserPrompt: string,
  firstPass: ScanExtraction,
  model: string,
) {
  return `${baseUserPrompt}

FIRST PASS JSON (uncertain fields):
${JSON.stringify(firstPass)}

Re-read the entire parchi from top to bottom as ${model}. Correct only what the image justifies. Return the complete JSON again.`;
}

async function callEngineWithRetry({
  maxRetries,
  ...args
}: {
  engine: EngineConfig;
  systemPrompt: string;
  userPrompt: string;
  imageDataUrl: string;
  timeoutMs: number;
  maxRetries: number;
}): Promise<{ raw: Record<string, unknown>; retries: number }> {
  let retries = 0;
  while (true) {
    try {
      const raw = await callEngine(args);
      return { raw, retries };
    } catch (error) {
      if (retries >= maxRetries || !isRetryableOverload(error)) {
        throw withRetryCount(error, retries);
      }
      retries += 1;
      console.warn(
        `[ocr] ${args.engine.model} overloaded (attempt ${retries}/${maxRetries + 1}); retrying in ${FLASH_429_BACKOFF_MS}ms`,
      );
      await sleep(FLASH_429_BACKOFF_MS);
    }
  }
}

function isRetryableOverload(error: unknown) {
  const status = errorStatus(error);
  const message = errorText(error).toLowerCase();
  if (status !== 429 && !/\b429\b/.test(message)) return false;
  return !/insufficient balance|no resource package|quota|billing|recharge|credit/.test(
    message,
  );
}

function errorStatus(error: unknown) {
  const candidate = error as { status?: number; response?: { status?: number } };
  return candidate?.status ?? candidate?.response?.status;
}

function errorText(error: unknown) {
  const candidate = error as {
    message?: string;
    error?: { message?: string };
  };
  return `${candidate?.message || ""} ${candidate?.error?.message || ""}`;
}

function retryCount(error: unknown) {
  const candidate = error as { ocrRetries?: number };
  return candidate?.ocrRetries || 0;
}

function withRetryCount(error: unknown, retries: number) {
  if (error && typeof error === "object") {
    (error as { ocrRetries?: number }).ocrRetries = retries;
  }
  return error;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callEngine({
  engine,
  systemPrompt,
  userPrompt,
  imageDataUrl,
  timeoutMs,
}: {
  engine: EngineConfig;
  systemPrompt: string;
  userPrompt: string;
  imageDataUrl: string;
  timeoutMs: number;
}): Promise<Record<string, unknown>> {
  const client = new OpenAI({
    apiKey: engine.apiKey,
    baseURL: engine.baseURL,
    timeout: timeoutMs,
    maxRetries: 0,
  });

  const request = async (useJsonMode: boolean) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const completion = await client.chat.completions.create(
        {
          model: engine.model,
          temperature: 0.1,
          max_tokens: 4_800,
          ...(useJsonMode ? { response_format: { type: "json_object" as const } } : {}),
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                {
                  type: "image_url",
                  image_url: { url: imageDataUrl, detail: "high" },
                },
              ],
            },
          ],
        },
        { signal: controller.signal },
      );

      const content = completion.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("Empty vision response.");
      }
      return cleanJson(content);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await request(true);
  } catch (error) {
    if (supportsPlainJsonRetry(error)) {
      return request(false);
    }
    throw error;
  }
}

function supportsPlainJsonRetry(error: unknown) {
  const candidate = error as {
    status?: number;
    message?: string;
    error?: { message?: string };
  };
  const message = `${candidate?.message || ""} ${candidate?.error?.message || ""}`.toLowerCase();
  return (
    (candidate?.status === 400 || candidate?.status === 422) &&
    /response_format|json_object|json mode/.test(message)
  );
}

function cleanJson(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object returned.");
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON root is not an object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.includes("JSON root")) throw error;
    throw new Error("Invalid JSON returned by vision provider.");
  }
}

function parseAndNormalize(
  raw: Record<string, unknown>,
  products: Product[],
  kind: ScanKind,
  modelUsed: string,
): ScanExtraction | null {
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  if (!rawItems.length) return null;

  const items: ScanItem[] = rawItems
    .map((entry, index) => {
      const item = entry as Record<string, unknown>;
      const product = findProduct(item, products);
      const qty = Math.max(0, safeNumber(item.qty));
      const rate = Math.max(0, safeNumber(item.rate));
      const unitRaw = normalizeText(item.unit).toLowerCase();
      const unit: ProductUnit = UNIT_VALUES.includes(unitRaw as ProductUnit)
        ? (unitRaw as ProductUnit)
        : product?.unit || "length";
      const confidence = clamp01(safeNumber(item.confidence, 0.7));
      return {
        id: `scan_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 6)}`,
        raw_scanned_name:
          normalizeText(item.raw_scanned_name) ||
          normalizeText(item.raw_name) ||
          product?.name ||
          `Scanned item ${index + 1}`,
        matched_product_id: product?.id || null,
        matched: Boolean(product),
        size: normalizeText(item.size) || String(product?.attributes?.size || ""),
        gauge: normalizeText(item.gauge) || String(product?.attributes?.gauge || ""),
        grade: normalizeText(item.grade) || String(product?.attributes?.grade || ""),
        shape: normalizeText(item.shape) || String(product?.attributes?.shape || ""),
        qty,
        unit,
        rate,
        amount: Math.round(qty * rate * 100) / 100,
        confidence,
      };
    })
    .filter((item) => item.qty > 0 || item.rate > 0);

  if (!items.some((item) => item.qty > 0)) return null;

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const extraCharges = Math.max(0, safeNumber(raw.extra_charges));
  const modelTotal = Math.max(0, safeNumber(raw.total_amount));
  const routingRaw = normalizeText(raw.detected_routing);
  let routing: RoutingMode =
    routingRaw === "customer_khata" || routingRaw === "cash_sale"
      ? routingRaw
      : kind === "purchase"
        ? "cash_sale"
        : "customer_khata";
  const partyName = normalizeNullableText(raw.party_name);
  if (!partyName && routing === "customer_khata") routing = "cash_sale";

  const paymentRaw = normalizeText(raw.payment_mode) as PaymentMode;
  const paymentMode: PaymentMode = ["cash", "udhaar", "bank"].includes(paymentRaw)
    ? paymentRaw
    : routing === "customer_khata"
      ? "udhaar"
      : "cash";

  const averageItemConfidence =
    items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
  const confidence = clamp01(safeNumber(raw.confidence_score, averageItemConfidence));
  const computedTotal = Math.round((subtotal + extraCharges) * 100) / 100;

  return {
    parchi_number: normalizeNullableText(raw.parchi_number),
    party_name: partyName,
    detected_routing: routing,
    payment_mode: paymentMode,
    items,
    extra_charges: extraCharges,
    extra_charges_label:
      normalizeText(raw.extra_charges_label) ||
      (kind === "purchase" ? "Freight / loading" : "Mazdoori / loading"),
    total_amount: computedTotal,
    scanned_total: modelTotal || computedTotal,
    confidence_score: confidence,
    model_used: modelUsed,
    notes: normalizeText(raw.notes) || undefined,
  };
}

function buildSystemPrompt(kind: ScanKind, products: Product[], parties: Party[]) {
  const productContext = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku_code: product.sku_code,
    size: product.attributes?.size,
    gauge: product.attributes?.gauge,
    grade: product.attributes?.grade,
    shape: product.attributes?.shape,
    unit: product.unit,
    sale_rate: product.sale_rate,
    aliases: product.aliases,
  }));
  const partyContext = parties
    .filter((party) => party.type !== "walk_in_cash")
    .map((party) => ({
      name: party.name,
      area_or_shop: party.area_or_shop,
      type: party.type,
    }));

  return `You are SteelKhata AI, a meticulous Pakistani steel pipe and hardware store accountant. Read the attached photo of a handwritten bill, stock register or katchi parchi and turn it into accurate accounting JSON.

DOCUMENT TYPE
${kindCopy[kind].label}
${kindCopy[kind].instruction}

READING RULE — NON-NEGOTIABLE
Read EVERY SINGLE handwritten line item from top to bottom on the parchi. Do NOT skip lines, do NOT merge different sizes/gauges, and do NOT invent items not written on the paper. If a line is crossed out, omit it. If a line is unclear, include your best reading with lower confidence.

SHOP CONTEXT
Full product catalogue: ${JSON.stringify(productContext)}
Known parties: ${JSON.stringify(partyContext)}

HANDWRITING AND DOMAIN RULES
1. Read mixed English, Roman Urdu and Pakistani hardware shorthand: "nali", "nalli", "pipe", "pcs", "length" mean quantity units. A standard pipe length is 20 ft.
2. Sizes: 1/2", 3/4", 1", 1.25" ("sawa"), 1.5" ("dedh"), 2" ("do"), 2.5" ("dhai"), 3" ("teen"), 4" ("chaar").
3. Grades are usually 201, 304 or 316. Gauges are 14G, 16G, 18G, 20G. Shape may be round/gol or square/chauras. "1x2 chauras" means rectangular/square stock, not two separate lines.
4. "mazdoori", "loading", "kiraya", "bhada", "freight", "labour" are EXTRA CHARGES, never product lines.
5. "udhaar", "baqi", "khata", "credit", "likh lo", "baad mein" mean detected_routing = "customer_khata" and payment_mode = "udhaar".
6. "cash", "naqad", "full payment", "paid" mean detected_routing = "cash_sale" and payment_mode = "cash".
7. Match each line to the catalogue using size + gauge + grade + shape, the product name, SKU or its aliases. Copy the exact catalogue id into matched_product_id. NEVER invent an id. If no confident match exists, use null, set matched=false, and still fill size/gauge/grade/shape.
8. Quantities and rates must be numbers. Rate is per nali/length unless the parchi explicitly shows kg. Compute amount = qty * rate.
9. If a party is written, use the closest known party name exactly, accounting for area labels such as "Nadeem - Sialkot Rd". If no party is written, party_name must be null and routing must be cash_sale.
10. parchi_number must be a string exactly as written, or null when absent.
11. confidence_score and each item's confidence must be between 0 and 1. Be honest: lower confidence for ambiguous handwriting, missing rates or unclear grades.
12. Do not include markdown, commentary or code fences.

RETURN STRICT JSON WITH THIS SHAPE
{
  "parchi_number": string | null,
  "party_name": string | null,
  "detected_routing": "cash_sale" | "customer_khata",
  "payment_mode": "cash" | "udhaar" | "bank",
  "items": [
    {
      "matched_product_id": string | null,
      "matched": boolean,
      "raw_scanned_name": string,
      "size": string,
      "gauge": string,
      "grade": string,
      "shape": string,
      "qty": number,
      "unit": "length" | "kg" | "pcs",
      "rate": number,
      "amount": number,
      "confidence": number
    }
  ],
  "extra_charges": number,
  "extra_charges_label": string,
  "total_amount": number,
  "confidence_score": number
}`;
}

function buildUserPrompt(kind: ScanKind) {
  return `Parse the attached ${kindCopy[kind].label} photo. Today in Pakistan: ${new Intl.DateTimeFormat(
    "en-PK",
    { dateStyle: "medium", timeZone: "Asia/Karachi" },
  ).format(new Date())}. Count every handwritten line first, then return that many item objects in the same order. Return the complete strict JSON object now.`;
}

export function buildMockExtraction(
  kind: ScanKind,
  products: Product[],
  parties: Party[],
): ScanExtraction {
  const oneAndHalf =
    products.find(
      (product) =>
        product.attributes?.size === '1.5"' &&
        product.attributes?.grade === "304" &&
        product.attributes?.shape === "round",
    ) || products[0];
  const oneInch =
    products.find(
      (product) =>
        product.attributes?.size === '1"' &&
        product.attributes?.grade === "304" &&
        product.attributes?.shape === "round",
    ) ||
    products[1] ||
    products[0];
  const twoInch =
    products.find(
      (product) =>
        product.attributes?.size === '2"' &&
        product.attributes?.grade === "304" &&
        product.attributes?.shape === "round",
    ) ||
    products[2] ||
    products[0];
  const purchaseA =
    products.find(
      (product) =>
        product.attributes?.size === '2"' && product.attributes?.grade === "304",
    ) || products[0];
  const purchaseB =
    products.find(
      (product) =>
        product.attributes?.size === '3/4"' && product.attributes?.grade === "304",
    ) ||
    products[1] ||
    products[0];

  const customers = parties.filter((party) => party.type === "customer");
  const suppliers = parties.filter((party) => party.type === "supplier");
  const nadeem =
    parties.find((party) => party.name.toLowerCase().includes("nadeem")) || customers[0];
  const chosenParty =
    kind === "purchase" ? suppliers[0]?.name || null : nadeem?.name || null;

  let items: ScanItem[] = [];
  let extraCharges = 0;
  let parchi: string | null = null;
  let paymentMode: PaymentMode = "udhaar";
  let route: RoutingMode = "customer_khata";

  if (kind === "purchase") {
    items = [
      makeMockItem(purchaseA, 20, purchaseA?.purchase_rate || 4600, 0.95),
      makeMockItem(purchaseB, 10, purchaseB?.purchase_rate || 1380, 0.89),
    ];
    extraCharges = 1500;
    parchi = "AP-220";
    paymentMode = "cash";
    route = "cash_sale";
  } else if (kind === "return") {
    items = [makeMockItem(oneInch, 2, 2350, 0.9)];
    parchi = "R-1046";
    route = "customer_khata";
    paymentMode = "udhaar";
  } else {
    items = [
      makeMockItem(oneAndHalf, 10, 3200, 0.94),
      makeMockItem(oneInch, 4, 2350, 0.62),
      makeMockItem(twoInch, 2, 7900, 0.86),
    ];
    extraCharges = 800;
    parchi = "1042";
    route = "customer_khata";
    paymentMode = "udhaar";
  }

  if (!chosenParty) {
    route = "cash_sale";
    paymentMode = "cash";
  }

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const total = Math.round((subtotal + extraCharges) * 100) / 100;

  return {
    parchi_number: parchi,
    party_name: chosenParty,
    detected_routing: route,
    payment_mode: paymentMode,
    items,
    extra_charges: extraCharges,
    extra_charges_label: kind === "purchase" ? "Freight / loading" : "Mazdoori / loading",
    total_amount: total,
    scanned_total: total,
    confidence_score: kind === "sale" ? 0.9 : 0.88,
    model_used: MOCK_MODEL,
    notes: "Mock fallback. Configure GLM_API_KEY or QWEN_API_KEY for real vision OCR.",
  };
}

function makeMockItem(
  product: Product | undefined,
  qty: number,
  rate: number,
  confidence: number,
): ScanItem {
  return {
    id: `scan_${Math.random().toString(36).slice(2, 10)}`,
    raw_scanned_name: product?.name || "Pipe item",
    matched_product_id: product?.id || null,
    matched: Boolean(product),
    size: String(product?.attributes?.size || ""),
    gauge: String(product?.attributes?.gauge || ""),
    grade: String(product?.attributes?.grade || ""),
    shape: String(product?.attributes?.shape || ""),
    qty,
    unit: product?.unit || "length",
    rate,
    amount: Math.round(qty * rate * 100) / 100,
    confidence,
  };
}

function findProduct(raw: Record<string, unknown>, products: Product[]) {
  const rawId =
    normalizeText(raw.matched_product_id) || normalizeText(raw.product_id);
  const byId = products.find((product) => product.id === rawId);
  if (byId) return byId;

  const size = normalizeText(raw.size).toLowerCase().replace(/["']/g, "");
  const gauge = normalizeText(raw.gauge).toLowerCase().replace(/[^0-9a-z]/g, "");
  const grade = normalizeText(raw.grade).toLowerCase().replace(/[^0-9a-z]/g, "");
  const shape = normalizeText(raw.shape).toLowerCase();
  const rawName = (
    normalizeText(raw.raw_scanned_name) || normalizeText(raw.raw_name)
  ).toLowerCase();
  const normalizedRawName = rawName.replace(/[^a-z0-9]+/g, " ").trim();

  const scored = products
    .map((product) => {
      let score = 0;
      const pSize = String(product.attributes?.size || "")
        .toLowerCase()
        .replace(/["']/g, "");
      const pGauge = String(product.attributes?.gauge || "")
        .toLowerCase()
        .replace(/[^0-9a-z]/g, "");
      const pGrade = String(product.attributes?.grade || "")
        .toLowerCase()
        .replace(/[^0-9a-z]/g, "");
      const pShape = String(product.attributes?.shape || "").toLowerCase();
      if (size && pSize === size) score += 4;
      if (gauge && pGauge === gauge) score += 3;
      if (grade && pGrade === grade) score += 3;
      if (shape && (pShape === shape || pShape.includes(shape))) score += 1;
      const aliasHit = (product.aliases || []).some((alias) => {
        const normalizedAlias = alias.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        return (
          normalizedAlias.length > 2 &&
          (normalizedRawName === normalizedAlias ||
            normalizedRawName.includes(normalizedAlias))
        );
      });
      if (aliasHit) score += 8;
      const baseName = product.name.toLowerCase().split("—")[0].trim();
      if (baseName && rawName.includes(baseName)) score += 2;
      return { product, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score >= 5 ? scored[0].product : null;
}

function safeNumber(value: unknown, fallback = 0) {
  const number =
    typeof value === "string" ? Number(value.replace(/[^0-9.-]/g, "")) : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableText(value: unknown): string | null {
  const clean = normalizeText(value);
  if (!clean || /^(null|undefined|n\/a|none|-)$/i.test(clean)) return null;
  return clean;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function errorMessage(error: unknown) {
  let message = error instanceof Error ? error.message : "Unknown vision API error.";
  message = message
    .replace(/sk-[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
  for (const secret of [
    process.env.GLM_API_KEY,
    process.env.QWEN_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]) {
    if (secret && secret.length >= 8) {
      message = message.split(secret).join("[redacted]");
    }
  }
  return message.replace(/\s+/g, " ").trim().slice(0, 500) || "Unknown vision API error.";
}
