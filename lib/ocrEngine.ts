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

const QWEN_DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const GLM_DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";
const QWEN_PRIMARY_MODEL = "qwen3.8-flash";
const QWEN_ESCALATION_MODEL = "qwen3-vl-plus";
const GLM_FALLBACK_MODEL = "glm-5.3-flash";
const MOCK_MODEL = "mock-fallback";
const DEFAULT_TIMEOUT_MS = 28_000;

const UNIT_VALUES: ProductUnit[] = ["length", "kg", "pcs"];

interface EngineConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

interface OcrConfig {
  qwen: EngineConfig | null;
  qwenEscalation: string;
  glm: EngineConfig | null;
  timeoutMs: number;
}

export interface OcrAttempt {
  model: string;
  status: "success" | "failed" | "invalid" | "skipped";
  reason?: string;
}

export interface OcrPipelineResult {
  data: ScanExtraction;
  mock: boolean;
  warning?: string;
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
      "This is incoming stock, likely from a supplier or a stock register page. Read pipe specifications and quantities received. Treat manually written stock rows as purchase items.",
  },
  return: {
    label: "Customer return (Maal Wapsi / sale_return)",
    instruction:
      "This is returned material from a customer. Quantities are positive numbers but stock must increase and the customer ledger must be credited for any udhaar return.",
  },
};

function getConfig(): OcrConfig {
  const qwenKey = process.env.QWEN_API_KEY?.trim() || "";
  const glmKey = process.env.GLM_API_KEY?.trim() || "";
  const timeout = Number(process.env.OCR_TIMEOUT_MS);
  return {
    qwen: qwenKey
      ? {
          apiKey: qwenKey,
          baseURL: process.env.QWEN_BASE_URL || QWEN_DEFAULT_BASE_URL,
          model: process.env.QWEN_MODEL || QWEN_PRIMARY_MODEL,
        }
      : null,
    qwenEscalation: process.env.QWEN_ESCALATION_MODEL || QWEN_ESCALATION_MODEL,
    glm: glmKey
      ? {
          apiKey: glmKey,
          baseURL: process.env.GLM_BASE_URL || GLM_DEFAULT_BASE_URL,
          model: process.env.GLM_MODEL || GLM_FALLBACK_MODEL,
        }
      : null,
    timeoutMs:
      Number.isFinite(timeout) && timeout >= 5_000 && timeout <= 120_000
        ? timeout
        : DEFAULT_TIMEOUT_MS,
  };
}

export async function runOcrPipeline(input: OcrPipelineInput): Promise<OcrPipelineResult> {
  const config = getConfig();
  const attempts: OcrAttempt[] = [];

  if (!config.qwen && !config.glm) {
    return {
      data: buildMockExtraction(input.kind, input.products, input.parties),
      mock: true,
      warning:
        "Demo parse: QWEN_API_KEY / GLM_API_KEY not configured. Add an OCR key in .env.local for real handwritten parchis.",
      attempts: [{ model: MOCK_MODEL, status: "success", reason: "No OCR API keys configured" }],
    };
  }

  const systemPrompt = buildSystemPrompt(input.kind, input.products, input.parties);
  const userPrompt = buildUserPrompt(input.kind, input.imageDataUrl);

  let firstPass: ScanExtraction | null = null;
  let warning: string | undefined;

  if (config.qwen) {
    try {
      const raw = await callEngine({
        engine: config.qwen,
        systemPrompt,
        userPrompt,
        imageDataUrl: input.imageDataUrl,
        timeoutMs: config.timeoutMs,
      });
      const parsed = parseAndNormalize(raw, input.products, input.kind, config.qwen.model);
      if (!parsed) throw new Error("OCR response did not contain usable items.");
      firstPass = parsed;
      attempts.push({ model: config.qwen.model, status: "success" });
    } catch (error) {
      const reason = errorMessage(error);
      attempts.push({ model: config.qwen.model, status: "failed", reason });
      console.warn("[ocr] Primary Qwen pass failed:", reason);
    }
  } else {
    attempts.push({ model: QWEN_PRIMARY_MODEL, status: "skipped", reason: "QWEN_API_KEY missing" });
  }

  if (!firstPass && config.glm) {
    try {
      const raw = await callEngine({
        engine: config.glm,
        systemPrompt,
        userPrompt,
        imageDataUrl: input.imageDataUrl,
        timeoutMs: config.timeoutMs,
      });
      const parsed = parseAndNormalize(raw, input.products, input.kind, config.glm.model);
      if (!parsed) throw new Error("OCR response did not contain usable items.");
      firstPass = parsed;
      attempts.push({ model: config.glm.model, status: "success" });
      warning =
        "Qwen primary pass unavailable. GLM-5.3 Flash fallback parsed this parchi — review amber fields carefully.";
    } catch (error) {
      const reason = errorMessage(error);
      attempts.push({ model: config.glm.model, status: "failed", reason });
      console.warn("[ocr] GLM fallback failed:", reason);
    }
  } else if (!config.glm && !firstPass) {
    attempts.push({ model: GLM_FALLBACK_MODEL, status: "skipped", reason: "GLM_API_KEY missing" });
  }

  if (!firstPass) {
    return {
      data: buildMockExtraction(input.kind, input.products, input.parties),
      mock: true,
      warning:
        "OCR providers did not return a readable result. A realistic demo parse is shown so the review flow stays usable — check API keys and image quality.",
      attempts,
    };
  }

  // One escalation pass with the vision-optimised Qwen model when the first
  // valid extraction is uncertain. Keep the higher-confidence result.
  let final = firstPass;
  if (final.confidence_score < 0.75 && config.qwen) {
    try {
      const raw = await callEngine({
        engine: {
          ...config.qwen,
          model: config.qwenEscalation,
        },
        systemPrompt,
        userPrompt: `${userPrompt}\n\nFIRST PASS JSON (may contain uncertain fields):\n${JSON.stringify(
          firstPass,
        )}\n\nRe-examine the photo and correct only what you can justify. Return the complete JSON again.`,
        imageDataUrl: input.imageDataUrl,
        timeoutMs: config.timeoutMs,
      });
      const escalated = parseAndNormalize(
        raw,
        input.products,
        input.kind,
        config.qwenEscalation,
      );
      if (!escalated) throw new Error("Escalation response did not contain usable items.");
      attempts.push({ model: config.qwenEscalation, status: "success" });
      if (escalated.confidence_score > firstPass.confidence_score) {
        final = escalated;
        warning =
          "First pass confidence was low, so Qwen VL Plus re-checked the parchi. Review amber fields before saving.";
      } else {
        warning =
          "First pass confidence was low. The escalation pass did not improve it — verify amber fields carefully.";
      }
    } catch (error) {
      attempts.push({
        model: config.qwenEscalation,
        status: "failed",
        reason: errorMessage(error),
      });
      warning =
        "First pass confidence is low and the escalation pass failed. Please verify every amber field before saving.";
      console.warn("[ocr] Qwen escalation failed:", errorMessage(error));
    }
  }

  return { data: final, mock: false, warning, attempts };
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
        throw new Error("Empty OCR response.");
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
      // Some OpenAI-compatible providers reject response_format. The prompt
      // itself already demands strict JSON, so retry once without that flag.
      return request(false);
    }
    throw error;
  }
}

function supportsPlainJsonRetry(error: unknown) {
  const candidate = error as { status?: number; message?: string; error?: { message?: string } };
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
    throw new Error("Invalid JSON returned by OCR provider.");
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
    total_amount: Math.round((subtotal + extraCharges) * 100) / 100,
    scanned_total: modelTotal || Math.round((subtotal + extraCharges) * 100) / 100,
    confidence_score: confidence,
    model_used: modelUsed,
    notes: normalizeText(raw.notes) || undefined,
  };
}

function buildSystemPrompt(kind: ScanKind, products: Product[], parties: Party[]) {
  const productContext = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku_code,
    unit: product.unit,
    size: product.attributes?.size,
    gauge: product.attributes?.gauge,
    grade: product.attributes?.grade,
    shape: product.attributes?.shape,
    aliases: product.aliases,
    sale_rate: product.sale_rate,
    purchase_rate: product.purchase_rate,
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

SHOP CONTEXT
Existing catalogue: ${JSON.stringify(productContext)}
Known parties: ${JSON.stringify(partyContext)}

HANDWRITING AND DOMAIN RULES
1. Read mixed English, Roman Urdu and Pakistani hardware shorthand: "nali", "nalli", "pipe", "pcs", "length" mean quantity units. A standard pipe length is 20 ft.
2. Sizes: 1/2", 3/4", 1", 1.25" ("sawa"), 1.5" ("dedh"), 2" ("do"), 2.5" ("dhai"), 3" ("teen"), 4" ("chaar").
3. Grades are usually 201, 304 or 316. Gauges are 14G, 16G, 18G, 20G. Shape may be round/gol or square/chauras.
4. "mazdoori", "loading", "kiraya", "bhada", "freight", "labour" are EXTRA CHARGES, never product lines.
5. "udhaar", "baqi", "khata", "credit", "likh lo", "baad mein" mean detected_routing = "customer_khata" and payment_mode = "udhaar".
6. "cash", "naqad", "full payment", "paid" mean detected_routing = "cash_sale" and payment_mode = "cash".
7. Match each line to the existing catalogue using size + gauge + grade + shape or aliases. Copy the exact catalogue id into matched_product_id. NEVER invent an id. If no confident match exists, use null and still fill size/gauge/grade/shape.
8. Quantity and rate must be numbers. Rate is per nali/length unless the parchi explicitly shows kg. Compute amount = qty * rate.
9. If a party is written, use the closest known party name exactly. Account for area labels such as "Nadeem - Sialkot Rd". If no party is written, party_name must be null and routing must be cash_sale.
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

function buildUserPrompt(kind: ScanKind, imageDataUrl: string) {
  return `Parse the attached ${kindCopy[kind].label} photo. Today in Pakistan: ${new Intl.DateTimeFormat(
    "en-PK",
    { dateStyle: "medium", timeZone: "Asia/Karachi" },
  ).format(new Date())}. Image MIME prefix: ${imageDataUrl.slice(0, 32)}. Return the complete strict JSON object now.`;
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

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const total = Math.round((subtotal + extraCharges) * 100) / 100;

  if (!chosenParty) {
    route = "cash_sale";
    paymentMode = "cash";
  }

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
    notes: "Realistic demo parse. Configure QWEN_API_KEY or GLM_API_KEY for live OCR.",
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
      const aliasHit = (product.aliases || []).some((alias) =>
        rawName.includes(alias.toLowerCase()),
      );
      if (aliasHit) score += 3;
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
  if (error instanceof Error) return error.message.slice(0, 300);
  return "Unknown OCR error.";
}


