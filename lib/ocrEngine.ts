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
const GLM_PRIMARY_MODEL = "glm-4.6v";
const GLM_FAST_MODEL = "glm-4.6v-flash";
const QWEN_VISION_MODEL = "qwen-vl-plus";
const MOCK_MODEL = "mock-fallback";
const DEFAULT_TIMEOUT_MS = 30_000;

const UNIT_VALUES: ProductUnit[] = ["length", "kg", "pcs"];

interface EngineConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

interface OcrConfig {
  glmPrimary: EngineConfig | null;
  glmFast: EngineConfig | null;
  qwen: EngineConfig | null;
  qwenEscalationModel: string;
  timeoutMs: number;
}

export interface OcrAttempt {
  model: string;
  status: "success" | "failed" | "skipped";
  reason?: string;
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
  const primaryModel =
    process.env.GLM_PRIMARY_MODEL || process.env.GLM_MODEL || GLM_PRIMARY_MODEL;
  const fastModel = process.env.GLM_FALLBACK_MODEL || GLM_FAST_MODEL;

  return {
    glmPrimary: glmKey
      ? { apiKey: glmKey, baseURL: glmBase, model: primaryModel }
      : null,
    glmFast:
      glmKey && fastModel !== primaryModel
        ? { apiKey: glmKey, baseURL: glmBase, model: fastModel }
        : null,
    qwen: qwenKey
      ? {
          apiKey: qwenKey,
          baseURL: qwenBase,
          model: process.env.QWEN_MODEL || QWEN_VISION_MODEL,
        }
      : null,
    qwenEscalationModel: process.env.QWEN_ESCALATION_MODEL || QWEN_VISION_MODEL,
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
  const candidates = [config.glmPrimary, config.glmFast, config.qwen].filter(
    (candidate): candidate is EngineConfig => Boolean(candidate),
  );

  if (!candidates.length) {
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

  if (!config.glmPrimary) {
    attempts.push({
      model: GLM_PRIMARY_MODEL,
      status: "skipped",
      reason: "GLM_API_KEY missing",
    });
  }
  if (!config.glmFast) {
    attempts.push({
      model: GLM_FAST_MODEL,
      status: "skipped",
      reason: config.glmPrimary ? "Duplicate fast model configured" : "GLM_API_KEY missing",
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
  const userPrompt = buildUserPrompt(input.kind);
  let firstPass: ScanExtraction | null = null;
  let usedIndex = -1;
  let warning: string | undefined;
  const failures: string[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const engine = candidates[index];
    try {
      const raw = await callEngine({
        engine,
        systemPrompt,
        userPrompt,
        imageDataUrl: input.imageDataUrl,
        timeoutMs: config.timeoutMs,
      });
      const parsed = parseAndNormalize(raw, input.products, input.kind, engine.model);
      if (!parsed) throw new Error("Vision response did not contain usable line items.");
      firstPass = parsed;
      usedIndex = index;
      attempts.push({ model: engine.model, status: "success" });
      if (failures.length) {
        warning = `Primary vision model failed. ${engine.model} fallback parsed this parchi — review amber fields.`;
      }
      break;
    } catch (error) {
      const reason = errorMessage(error);
      failures.push(`${engine.model}: ${reason}`);
      attempts.push({ model: engine.model, status: "failed", reason });
      console.warn(`[ocr] ${engine.model} failed:`, reason);
    }
  }

  if (!firstPass) {
    return {
      data: buildMockExtraction(input.kind, input.products, input.parties),
      mock: true,
      warning:
        "All configured vision models failed. A demo parse is shown so the UI stays usable — check the diagnostic below before saving.",
      debugError: failures.join(" | ") || "All configured vision providers failed.",
      attempts,
    };
  }

  let final = firstPass;

  // One escalation pass. Qwen VL Plus is the designated vision reviewer.
  if (firstPass.confidence_score < 0.75 && config.qwen) {
    const escalationModel = config.qwenEscalationModel;
    try {
      const raw = await callEngine({
        engine: { ...config.qwen, model: escalationModel },
        systemPrompt,
        userPrompt: `${userPrompt}\n\nFIRST PASS JSON (uncertain fields):\n${JSON.stringify(
          firstPass,
        )}\n\nRe-read the entire parchi, top to bottom, and correct only what the image justifies. Return the complete JSON again.`,
        imageDataUrl: input.imageDataUrl,
        timeoutMs: config.timeoutMs,
      });
      const escalated = parseAndNormalize(
        raw,
        input.products,
        input.kind,
        escalationModel,
      );
      if (!escalated) throw new Error("Escalation returned no usable line items.");
      attempts.push({ model: escalationModel, status: "success" });
      if (escalated.confidence_score > firstPass.confidence_score) {
        final = escalated;
        warning = `Low confidence (${Math.round(
          firstPass.confidence_score * 100,
        )}%). ${escalationModel} re-checked the parchi and improved confidence to ${Math.round(
          escalated.confidence_score * 100,
        )}%.`;
      } else {
        warning = "Low confidence. The qwen-vl-plus escalation pass did not improve the result — verify every amber field.";
      }
    } catch (error) {
      const reason = errorMessage(error);
      failures.push(`${escalationModel}: ${reason}`);
      attempts.push({ model: escalationModel, status: "failed", reason });
      warning =
        "Vision confidence is low and the qwen-vl-plus escalation pass failed. Verify every amber field before saving.";
      console.warn(`[ocr] ${escalationModel} escalation failed:`, reason);
    }
  } else if (firstPass.confidence_score < 0.75) {
    warning =
      "Vision confidence is low. Qwen escalation is unavailable; verify every amber field before saving.";
  }

  if (usedIndex > 0) {
    warning =
      warning ||
      "A fallback vision model parsed this parchi. Review amber fields before saving.";
  }

  return {
    data: final,
    mock: false,
    warning,
    debugError: failures.length ? failures.join(" | ") : undefined,
    attempts,
  };
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
