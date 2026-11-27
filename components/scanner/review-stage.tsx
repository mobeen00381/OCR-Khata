"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  FileWarning,
  Hash,
  ImageOff,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import type {
  ScanDraft,
  ScanExtraction,
  ScanItem,
  ScanKind,
} from "@/lib/types";
import { useStore, type NewTransactionInput } from "@/lib/store";
import { findPartyByName } from "@/lib/analytics";
import { formatKB } from "@/lib/compressImage";
import {
  clamp,
  cn,
  formatDateTime,
  formatPKR,
  formatQty,
  roundMoney,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { PartyAvatar } from "@/components/shared/party-avatar";
import { CreateItemModal } from "./create-item-modal";

const MODEL_LABELS: Record<string, string> = {
  "glm-4.6v": "GLM 4.6V",
  "glm-4.6v-flash": "GLM 4.6V Flash",
  "qwen-vl-plus": "Qwen VL Plus",
  "mock-fallback": "Mock fallback",
};

function modelLabel(modelUsed: string) {
  return MODEL_LABELS[modelUsed] || modelUsed;
}

export function ReviewStage({
  draft,
  kinds,
  locked,
  onBack,
  onRetry,
  onUpdate,
  onMeta,
  onConfirm,
}: {
  draft: ScanDraft;
  kinds: ScanKind;
  locked: boolean;
  onBack: () => void;
  onRetry: () => void;
  onUpdate: (extraction: ScanExtraction) => void;
  onMeta: (patch: Partial<Pick<ScanDraft, "party_id" | "paid_now">>) => void;
  onConfirm: (input: NewTransactionInput) => Promise<void>;
}) {
  if (draft.status === "error" || !draft.extraction) {
    return (
      <Card className="p-6">
        <div className="mx-auto max-w-md py-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-crimson">
            <ImageOff className="h-5 w-5" />
          </span>
          <h2 className="mt-4 font-display text-lg font-extrabold text-ink">Parchi read nahi ho saki</h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-mute">
            {draft.error || "AI ne is photo se items parse nahi kiye. Saaf photo dobara try karein."}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button onClick={onRetry}>
              <RefreshCw className="h-4 w-4" />
              Retry scan
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <ReviewContent
      key={draft.id}
      draft={draft}
      kinds={kinds}
      locked={locked}
      extraction={draft.extraction}
      onBack={onBack}
      onUpdate={onUpdate}
      onMeta={onMeta}
      onConfirm={onConfirm}
    />
  );
}

function ReviewContent({
  draft,
  kinds,
  locked,
  extraction,
  onBack,
  onUpdate,
  onMeta,
  onConfirm,
}: {
  draft: ScanDraft;
  kinds: ScanKind;
  locked: boolean;
  extraction: ScanExtraction;
  onBack: () => void;
  onUpdate: (extraction: ScanExtraction) => void;
  onMeta: (patch: Partial<Pick<ScanDraft, "party_id" | "paid_now">>) => void;
  onConfirm: (input: NewTransactionInput) => Promise<void>;
}) {
  const { state } = useStore();
  const [duplicateAck, setDuplicateAck] = useState(false);
  const [createItem, setCreateItem] = useState<ScanItem | null>(null);
  const [saving, setSaving] = useState(false);

  const isPurchase = kinds === "purchase";
  const isReturn = kinds === "return";
  const customers = state.parties.filter((party) => party.type === "customer");
  const suppliers = state.parties.filter((party) => party.type === "supplier");
  const scopedParties = isPurchase ? suppliers : customers;
  const walkIn = state.parties.find((party) => party.type === "walk_in_cash");
  const matchedParty = findPartyByName(scopedParties, extraction.party_name || "");
  const selectedPartyId =
    draft.party_id !== undefined ? draft.party_id : matchedParty?.id || "";
  const selectedParty = state.parties.find((party) => party.id === selectedPartyId);
  const isCash = extraction.detected_routing === "cash_sale";

  const subtotal = roundMoney(
    extraction.items.reduce((sum, item) => sum + item.qty * item.rate, 0),
  );
  const total = roundMoney(subtotal + extraction.extra_charges);
  const scannedTotal = extraction.scanned_total ?? extraction.total_amount;
  const totalDifference = Math.abs(total - scannedTotal);
  const paidNow = isCash ? total : clamp(draft.paid_now || 0, 0, total);
  const outstanding = Math.max(0, total - paidNow);
  const lowConfidenceItems = extraction.items.filter((item) => item.confidence < 0.75);
  const confidence = Math.round(extraction.confidence_score * 100);
  const confidenceTone =
    confidence >= 85 ? "emerald" : confidence >= 70 ? "amber" : "crimson";

  const duplicate = useMemo(() => {
    const normalized = (extraction.parchi_number || "").trim().toLowerCase().replace(/\s+/g, "");
    if (!normalized) return null;
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    return (
      state.transactions.find(
        (transaction) =>
          transaction.parchi_number &&
          transaction.parchi_number.toLowerCase().replace(/\s+/g, "") === normalized &&
          +new Date(transaction.created_at) >= sevenDaysAgo,
      ) || null
    );
  }, [extraction.parchi_number, state.transactions]);

  useEffect(() => {
    setDuplicateAck(false);
  }, [extraction.parchi_number]);

  function patch(partial: Partial<ScanExtraction>) {
    onUpdate({ ...extraction, ...partial });
  }

  function updateItem(id: string, patchItem: Partial<ScanItem>) {
    patch({
      items: extraction.items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patchItem };
        return { ...next, amount: roundMoney(next.qty * next.rate) };
      }),
    });
  }

  function setRouting(routing: "cash_sale" | "customer_khata") {
    patch({
      detected_routing: routing,
      payment_mode: routing === "cash_sale" ? "cash" : "udhaar",
    });
    if (routing === "cash_sale") {
      onMeta({ paid_now: total });
    }
  }

  function selectProduct(itemId: string, productId: string) {
    const product = state.products.find((entry) => entry.id === productId);
    if (!product) {
      updateItem(itemId, { matched_product_id: null, matched: false });
      return;
    }
    const defaultRate = isPurchase ? product.purchase_rate : product.sale_rate;
    updateItem(itemId, {
      matched_product_id: product.id,
      matched: true,
      size: String(product.attributes?.size || ""),
      gauge: String(product.attributes?.gauge || ""),
      grade: String(product.attributes?.grade || ""),
      shape: String(product.attributes?.shape || ""),
      unit: product.unit,
      rate: defaultRate,
    });
  }

  function addItem() {
    const product = state.products[0];
    if (!product) return;
    const rate = isPurchase ? product.purchase_rate : product.sale_rate;
    const newItem: ScanItem = {
      id: `manual_${Date.now()}`,
      raw_scanned_name: product.name,
      matched_product_id: product.id,
      matched: true,
      size: String(product.attributes?.size || ""),
      gauge: String(product.attributes?.gauge || ""),
      grade: String(product.attributes?.grade || ""),
      shape: String(product.attributes?.shape || ""),
      qty: 1,
      unit: product.unit,
      rate,
      amount: rate,
      confidence: 1,
    };
    patch({ items: [...extraction.items, newItem] });
  }

  function removeItem(id: string) {
    patch({ items: extraction.items.filter((item) => item.id !== id) });
  }

  function handleNewProduct(product: (typeof state.products)[number]) {
    if (!createItem) return;
    updateItem(createItem.id, {
      matched_product_id: product.id,
      matched: true,
      raw_scanned_name: createItem.raw_scanned_name,
      size: String(product.attributes?.size || createItem.size),
      gauge: String(product.attributes?.gauge || createItem.gauge),
      grade: String(product.attributes?.grade || createItem.grade),
      shape: String(product.attributes?.shape || createItem.shape),
      unit: product.unit,
      rate: isPurchase ? product.purchase_rate : product.sale_rate,
    });
    setCreateItem(null);
  }

  const canSave =
    !locked &&
    extraction.items.length > 0 &&
    extraction.items.every(
      (item) => item.qty > 0 && item.matched_product_id && item.rate >= 0,
    ) &&
    (!isCash ? Boolean(selectedParty?.id) : true) &&
    (!duplicate || duplicateAck);

  function confirm() {
    if (!canSave || saving) return;
    const partyId = isCash
      ? isPurchase && selectedParty?.type === "supplier"
        ? selectedParty.id
        : walkIn?.id || state.parties[0]?.id || ""
      : selectedParty?.id || "";
    setSaving(true);
    void onConfirm({
      party_id: partyId,
      parchi_number: (extraction.parchi_number || "").trim() || null,
      type: isReturn ? "sale_return" : isPurchase ? "purchase" : "sale",
      routing_mode: extraction.detected_routing,
      payment_mode: isCash ? "cash" : "udhaar",
      subtotal,
      extra_charges: roundMoney(extraction.extra_charges),
      total_amount: total,
      paid_amount: isCash ? total : paidNow,
      bill_image_url: draft.imageUrl,
      notes: extraction.notes,
      items: extraction.items.map((item) => ({
        product_id: item.matched_product_id as string,
        raw_scanned_name: item.raw_scanned_name,
        quantity: item.qty,
        unit: item.unit,
        rate: item.rate,
        amount: roundMoney(item.qty * item.rate),
      })),
    }).finally(() => setSaving(false));
  }

  return (
    <div>
      {duplicate ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-amber-900">Duplicate parchi detected</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-amber-700">
                Parchi #{duplicate.parchi_number} pehle se {formatDateTime(duplicate.created_at)} par
                save hai. Galti se double entry na karein.
              </p>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-[10px] font-semibold text-amber-900">
                <input
                  type="checkbox"
                  checked={duplicateAck}
                  onChange={(event) => setDuplicateAck(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-amber-300 accent-amber-600"
                />
                Main samajh gaya — phir bhi save karein
              </label>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="self-start space-y-3 xl:sticky xl:top-6">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-slate-50/80 px-3.5 py-2.5">
              <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-mute">
              <FileWarning className="h-3 w-3" />
              Original Parchi
            </span>
            <Badge tone={draft.mock ? "amber" : "steel"} dot>
              {modelLabel(extraction.model_used)}
            </Badge>
          </div>
          <div className="relative bg-slate-200/70 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={draft.imageUrl}
              alt="Scanned parchi"
              className="max-h-[340px] w-full rounded-lg object-contain"
            />
            <span className="absolute bottom-4 right-4 rounded-md bg-ink/80 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.08em] text-white backdrop-blur">
              Tap fields to fix
            </span>
          </div>
          <div className="space-y-2 px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9.5px] font-medium text-ink-mute">OCR confidence</span>
              <Badge tone={confidenceTone}>{confidence}%</Badge>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn(
                  "h-full rounded-full",
                  confidence >= 85
                    ? "bg-emerald-500"
                    : confidence >= 70
                      ? "bg-amber-500"
                      : "bg-crimson",
                )}
                style={{ width: `${confidence}%` }}
              />
            </div>
            <p className="text-[9px] leading-relaxed text-slate-400">
              {lowConfidenceItems.length
                ? `${lowConfidenceItems.length} item${lowConfidenceItems.length === 1 ? "" : "s"} marked amber — please verify.`
                : "Items confidently matched with your catalogue."}
            </p>
            <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
              <span className="text-[8.5px] font-medium uppercase tracking-[0.06em] text-slate-400">
                Model
              </span>
              <span className="truncate text-[9px] font-bold text-ink-soft">
                {modelLabel(extraction.model_used)}
              </span>
            </div>
            <p className="-mt-1 text-right font-mono text-[7.5px] text-slate-400">
              {extraction.model_used}
            </p>
            {typeof draft.originalSizeKB === "number" &&
            typeof draft.compressedSizeKB === "number" ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[8.5px] font-medium uppercase tracking-[0.06em] text-slate-400">
                  Photo
                </span>
                <span className="truncate text-[9px] font-semibold tabular text-emerald-700">
                  {formatKB(draft.originalSizeKB)} → {formatKB(draft.compressedSizeKB)}
                </span>
              </div>
            ) : null}
          </div>
        </Card>

        {draft.warning ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
            <p className="text-[9.5px] leading-relaxed text-amber-800">{draft.warning}</p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
            <p className="text-[9.5px] leading-relaxed text-emerald-800">
              Review ke baad hi stock aur khata update hoga. Koi entry automatic nahi hai.
            </p>
          </div>
        )}

        <div
          className={cn(
            "rounded-xl border px-3 py-2.5",
            draft.mock
              ? "border-red-200 bg-red-50"
              : "border-emerald-200 bg-white",
          )}
        >
          <div className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                draft.mock ? "bg-red-100 text-crimson" : "bg-emerald-100 text-emerald-700",
              )}
            >
              <ShieldCheck className="h-3 w-3" />
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-[9.5px] font-bold",
                  draft.mock ? "text-crimson" : "text-emerald-800",
                )}
              >
                {draft.mock
                  ? "MOCK FALLBACK — not a real vision result"
                  : `Real AI Vision · ${modelLabel(extraction.model_used)}`}
              </p>
              {draft.debugError ? (
                <p className="mt-1 break-words font-mono text-[8px] leading-relaxed text-slate-500">
                  {draft.debugError}
                </p>
              ) : (
                <p className="mt-0.5 text-[8.5px] leading-relaxed text-ink-mute">
                  {draft.mock
                    ? "No live vision model returned a parse. Verify every field before saving."
                    : "Live vision extraction completed successfully."}
                </p>
              )}
            </div>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          Back to queue
        </Button>
      </div>

      <div className="min-w-0 space-y-4">
        {locked ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11.5px] font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Day locked — save disabled. Unlock from Reports.
          </div>
        ) : null}

        <Card className="p-3.5 sm:p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-mute">
                Routing mode · Paise ka rasta
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {isPurchase
                  ? "Purchase cash hai ya supplier ke khate mein?"
                  : isReturn
                    ? "Return cash refund hai ya customer khata adjustment?"
                    : "Cash sale ledger ko chhota rakhti hai."}
              </p>
            </div>
            <Badge tone={isCash ? "emerald" : "amber"} dot>
              {isCash ? "No ledger" : "Ledger"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRouting("cash_sale")}
              className={cn(
                "flex min-h-[58px] items-center gap-2.5 rounded-xl border p-3 text-left transition",
                isCash
                  ? "border-emerald-600 bg-emerald-600 text-white shadow-[0_8px_20px_-14px_rgba(5,150,105,0.8)]"
                  : "border-line bg-white text-ink hover:border-emerald-300 hover:bg-emerald-50/40",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  isCash ? "bg-white/15" : "bg-emerald-50 text-emerald-700",
                )}
              >
                <Banknote className="h-4 w-4" />
              </span>
              <span>
                <span className="block font-display text-[11.5px] font-bold">
                  {isPurchase ? "Cash Purchase" : isReturn ? "Cash Refund" : "Cash Sale"}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-[9px] font-medium",
                    isCash ? "text-emerald-100/80" : "text-ink-mute",
                  )}
                >
                  {isPurchase ? "Direct payment" : "No customer ledger"}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRouting("customer_khata")}
              className={cn(
                "flex min-h-[58px] items-center gap-2.5 rounded-xl border p-3 text-left transition",
                !isCash
                  ? "border-amber-500 bg-amber-500 text-white shadow-[0_8px_20px_-14px_rgba(217,119,6,0.8)]"
                  : "border-line bg-white text-ink hover:border-amber-300 hover:bg-amber-50/40",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  !isCash ? "bg-white/15" : "bg-amber-50 text-amber-700",
                )}
              >
                <BookOpen className="h-4 w-4" />
              </span>
              <span>
                <span className="block font-display text-[11.5px] font-bold">
                  {isPurchase ? "Supplier Credit" : "Customer Khata"}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-[9px] font-medium",
                    !isCash ? "text-amber-100/80" : "text-ink-mute",
                  )}
                >
                  {isPurchase ? "Add to payable" : "Add to ledger"}
                </span>
              </span>
            </button>
          </div>
        </Card>

        <Card className="p-3.5 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-mute">
                Parchi details
              </p>
              <h2 className="mt-0.5 font-display text-[15px] font-bold tracking-[-0.02em] text-ink">
                Bill ki tafseel
              </h2>
            </div>
            <Badge tone="neutral">#{extraction.parchi_number || "—"}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Parchi number" hint="Duplicate check">
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={extraction.parchi_number ?? ""}
                  onChange={(event) =>
                    patch({ parchi_number: event.target.value || null })
                  }
                  className="pl-9 font-semibold tabular"
                  placeholder="e.g. 1046"
                />
              </div>
            </Field>
            <Field label="Entry date">
              <Input value={formatDateTime(new Date())} readOnly className="bg-slate-50 text-ink-mute" />
            </Field>
            <Field
              label={isPurchase ? "Supplier" : "Customer / Party"}
              hint={isCash ? "Cash counter par" : "Required"}
              className="sm:col-span-2"
            >
              {isCash && !isPurchase ? (
                <div className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-emerald-700">
                    <Banknote className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-ink">Cash Counter / Walk-in</p>
                    <p className="text-[9px] text-ink-mute">Ledger clutter nahi banega</p>
                  </div>
                  <Badge tone="emerald">Auto</Badge>
                </div>
              ) : (
                <div className="relative">
                  {selectedParty ? (
                    <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2">
                      <PartyAvatar name={selectedParty.name} size="sm" />
                    </span>
                  ) : (
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  )}
                  <Select
                    value={selectedPartyId}
                    onChange={(event) => onMeta({ party_id: event.target.value })}
                    className="h-[46px] pl-12"
                  >
                    <option value="">
                      {isPurchase ? "Select supplier…" : "Select customer…"}
                    </option>
                    {scopedParties.map((party) => (
                      <option key={party.id} value={party.id}>
                        {party.name} — {party.area_or_shop}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {!isCash && !selectedParty ? (
                <p className="mt-1.5 text-[9.5px] font-semibold text-crimson">
                  Khata sale ke liye party select karna zaroori hai.
                </p>
              ) : null}
              {matchedParty && selectedParty?.id !== matchedParty.id && !isCash ? (
                <p className="mt-1.5 text-[9px] text-ink-mute">
                  AI ne <span className="font-semibold">{extraction.party_name}</span> parha tha.                </p>
              ) : null}
            </Field>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-mute">
                Extracted items · {extraction.items.length}
              </p>
              <h2 className="mt-0.5 font-display text-[15px] font-bold tracking-[-0.02em] text-ink">
                Maal ki tafseel
              </h2>
            </div>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold text-ink-soft transition hover:border-steel-300 hover:bg-blue-50 hover:text-steel-700"
            >
              <Plus className="h-3 w-3" />
              Add item
            </button>
          </div>

          <div className="hidden grid-cols-[minmax(0,1fr)_74px_108px_112px_28px] gap-2 border-b border-line bg-slate-50/80 px-4 py-2 text-[8.5px] font-bold uppercase tracking-[0.08em] text-ink-mute md:grid">
            <span>Product match</span>
            <span>Qty</span>
            <span>Rate</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          <div className="divide-y divide-line">
            {extraction.items.map((item, index) => {
              const product = state.products.find(
                (entry) => entry.id === item.matched_product_id,
              );
              const unmatched = !item.matched || !item.matched_product_id;
              const low = item.confidence < 0.75;
              const highlight = unmatched || low;
              const amount = roundMoney(item.qty * item.rate);
              return (
                <div
                  key={item.id}
                  className={cn(
                    "p-3.5 md:px-4",
                    unmatched
                      ? "border-l-2 border-l-amber-500 bg-amber-50/40"
                      : low
                        ? "border-l-2 border-l-amber-400 bg-amber-50/25"
                        : "",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2 md:hidden">
                    <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-ink-mute">
                      Item {index + 1}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {unmatched ? (
                        <Badge tone="amber">New item</Badge>
                      ) : low ? (
                        <Badge tone="amber">Check</Badge>
                      ) : (
                        <Badge tone="emerald">Matched</Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-crimson"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_74px_108px_112px_28px] md:items-start">
                    <div className="min-w-0">
                      <div className="relative">
                        <Select
                          value={item.matched_product_id || ""}
                          onChange={(event) => selectProduct(item.id, event.target.value)}
                          className={cn(
                            "h-10 min-h-[40px] pl-2.5 text-[11px] font-semibold",
                            highlight && "border-amber-300 bg-amber-50/60",
                          )}
                        >
                          <option value="">Pick from Stock / unmatched</option>
                          {state.products.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.attributes.size} · {entry.attributes.gauge} ·{" "}
                              {entry.attributes.grade} · {entry.attributes.shape} — {entry.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="max-w-full truncate text-[9px] font-medium text-ink-mute">
                          AI read: “{item.raw_scanned_name}”
                        </span>
                        {product ? (
                          <span className="rounded border border-line bg-slate-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.04em] text-ink-mute">
                            {formatQty(product.current_stock, product.unit)} in stock
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCreateItem(item)}
                            className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.04em] text-amber-700 transition hover:bg-amber-50"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            Create New Item
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 md:contents">
                      <div className="md:w-[74px]">
                        <span className="mb-1 block text-[8px] font-bold uppercase tracking-wide text-slate-400 md:hidden">
                          Qty
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.qty}
                          onChange={(event) =>
                            updateItem(item.id, { qty: Number(event.target.value) || 0 })
                          }
                          className={cn(
                            "h-10 min-h-[40px] px-2 text-center text-[11px] font-bold tabular",
                            highlight && "border-amber-300 bg-amber-50/60",
                          )}
                        />
                      </div>
                      <div className="md:w-[108px]">
                        <span className="mb-1 block text-[8px] font-bold uppercase tracking-wide text-slate-400 md:hidden">
                          Rate
                        </span>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">
                            Rs
                          </span>
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            value={item.rate}
                            onChange={(event) =>
                              updateItem(item.id, { rate: Number(event.target.value) || 0 })
                            }
                            className={cn(
                              "h-10 min-h-[40px] pl-7 pr-2 text-[11px] font-bold tabular",
                              highlight && "border-amber-300 bg-amber-50/60",
                            )}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col justify-end md:w-[112px] md:items-end">
                        <span className="mb-1 block text-[8px] font-bold uppercase tracking-wide text-slate-400 md:hidden">
                          Amount
                        </span>
                        <span className="flex h-10 items-center font-display text-[12px] font-extrabold tabular text-ink">
                          {formatPKR(amount)}
                        </span>
                      </div>
                      <div className="hidden items-center justify-end md:flex">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition hover:bg-red-50 hover:text-crimson"
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 hidden items-center gap-2 md:flex">
                    {unmatched ? (
                      <span className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-700">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        New item · pick or create
                      </span>
                    ) : low ? (
                      <span className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-700">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Check qty / rate
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wide text-emerald-700">
                        <Check className="h-2.5 w-2.5" />
                        Matched {Math.round(item.confidence * 100)}%
                      </span>
                    )}
                    <span className="text-[8px] text-slate-400">·</span>
                    <span className="text-[8px] text-slate-400">
                      {item.size} · {item.gauge} · {item.grade} · {item.shape}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {!extraction.items.length ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[11px] font-semibold text-ink-mute">Koi item nahi mila.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={addItem}>
                <Plus className="h-3.5 w-3.5" />
                Add item manually
              </Button>
            </div>
          ) : null}
        </Card>

        <Card className="overflow-hidden">
          <div className="grid gap-0 md:grid-cols-[1fr_270px]">
            <div className="p-4">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-mute">
                Extra charges
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <Field label={extraction.extra_charges_label || "Mazdoori / loading"}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                      Rs
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={extraction.extra_charges}
                      onChange={(event) =>
                        patch({ extra_charges: Math.max(0, Number(event.target.value) || 0) })
                      }
                      className="pl-9 font-bold tabular"
                    />
                  </div>
                </Field>
                <Field label="Charge label">
                  <Input
                    value={extraction.extra_charges_label}
                    onChange={(event) => patch({ extra_charges_label: event.target.value })}
                    placeholder="Mazdoori"
                  />
                </Field>
              </div>

              {!isCash ? (
                <div className="mt-3.5 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10.5px] font-bold text-ink">Paid now / Jama</p>
                      <p className="mt-0.5 text-[9px] text-ink-mute">
                        Khata balance confirm par update hoga.
                      </p>
                    </div>
                    <div className="relative w-[130px]">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">
                        Rs
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={total}
                        value={paidNow}
                        onChange={(event) =>
                          onMeta({
                            paid_now: clamp(Number(event.target.value) || 0, 0, total),
                          })
                        }
                        className="h-10 min-h-[40px] pl-8 text-right text-[11px] font-bold tabular"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {totalDifference > 1 ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[9.5px] leading-relaxed text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  AI ne scanned total {formatPKR(scannedTotal)} parha. Calculated total{" "}
                  {formatPKR(total)} hai — qty/rate verify karein.
                </div>
              ) : null}
            </div>

            <div className="border-t border-line bg-slate-50/80 p-4 md:border-l md:border-t-0">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="text-ink-mute">Subtotal</span>
                  <span className="font-semibold tabular text-ink-soft">{formatPKR(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="text-ink-mute">Extra charges</span>
                  <span className="font-semibold tabular text-ink-soft">
                    {formatPKR(extraction.extra_charges)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-line pt-2.5">
                  <span className="text-[11px] font-bold text-ink">Total bill</span>
                  <span className="font-display text-[20px] font-extrabold tabular text-ink">
                    {formatPKR(total)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-ink-mute">{isCash ? "Cash paid" : "Udhaar baqi"}</span>
                  <span
                    className={cn(
                      "font-bold tabular",
                      isCash ? "text-emerald-700" : "text-amber-700",
                    )}
                  >
                    {formatPKR(isCash ? total : outstanding)}
                  </span>
                </div>
              </div>

              <Button
                size="lg"
                className="mt-4 w-full"
                onClick={confirm}
                disabled={!canSave || saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {saving ? "Saving…" : "Confirm & Save"}
              </Button>
              <p className="mt-2 text-center text-[8.5px] leading-relaxed text-slate-400">
                {locked
                  ? "Day is locked."
                  : !canSave
                    ? !extraction.items.length
                      ? "Add at least one item."
                      : !isCash && !selectedParty
                        ? "Select a party for khata."
                        : duplicate && !duplicateAck
                          ? "Acknowledge duplicate parchi."
                          : "Check item matches."
                    : "Stock and ledger update together."}
              </p>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-[9px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-amber-500" />
            Vision-extracted draft · human review required
          </span>
          <span className="flex items-center gap-1.5">
            {isCash ? <Banknote className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
            {isCash ? "Cash sale — no ledger" : "Khata — ledger will update"}
          </span>
        </div>
      </div>
    </div>

    <CreateItemModal
      open={Boolean(createItem)}
      item={createItem}
      purchaseMode={isPurchase}
      onClose={() => setCreateItem(null)}
      onCreated={handleNewProduct}
    />
  </div>
  );
}
