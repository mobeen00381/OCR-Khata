"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  Loader2,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useStore, type NewTransactionInput } from "@/lib/store";
import type { ScanDraft, ScanKind, ScanResponse, TransactionType } from "@/lib/types";
import { sampleParchiImage } from "@/lib/demo-images";
import { compressImage } from "@/lib/compressImage";
import { rasterizeImage } from "@/lib/images";
import {
  cn,
  formatPKR,
  paymentModeLabel,
  toDateKey,
  uid,
} from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CaptureStage } from "@/components/scanner/capture-stage";
import { ReviewStage } from "@/components/scanner/review-stage";
import { useToast } from "@/components/toast";

type Stage = "capture" | "scanning" | "review" | "done";

interface SavedEntry {
  id: string;
  type: TransactionType;
  partyName: string;
  total: number;
  routing: "cash_sale" | "customer_khata";
  parchi: string;
}

const kindLabels: Record<ScanKind, { label: string; short: string }> = {
  sale: { label: "Sales Bill", short: "Becha Hua Maal" },
  purchase: { label: "Purchase / Stock", short: "Aaya Hua Maal" },
  return: { label: "Maal Wapsi", short: "Customer Return" },
};

export default function ScanPage() {
  const { state, saveTransaction, isDayLocked } = useStore();
  const { toast } = useToast();
  const [kind, setKind] = useState<ScanKind>("sale");
  const [stage, setStage] = useState<Stage>("capture");
  const [drafts, setDrafts] = useState<ScanDraft[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: 0 });
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const locked = isDayLocked(toDateKey());

  const activeDraft = drafts[activeIndex] || drafts[0] || null;
  const failedDrafts = drafts.filter((draft) => draft.status === "error");
  const readyDrafts = drafts.filter((draft) => draft.status === "ready");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("type");
    if (requested === "sale" || requested === "purchase" || requested === "return") {
      setKind(requested);
    }
    if (new URLSearchParams(window.location.search).get("locked") === "1") {
      // No-op anchor for future deep links.
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [stage, activeIndex]);

  async function addFiles(files: File[]) {
    if (locked) {
      toast({
        title: "Day locked hai",
        description: "Unlock karne se pehle nayi entry save nahi hogi.",
        tone: "error",
      });
      return;
    }
    const available = 15 - drafts.length;
    if (available <= 0) {
      toast({ title: "Batch full", description: "Ek session mein maximum 15 parchiyan.", tone: "error" });
      return;
    }
    if (files.length > available) {
      toast({
        title: `Sirf ${available} photos add hui`,
        description: "Batch limit 15 parchiyan hai.",
        tone: "info",
      });
    }

    const selected = files.slice(0, available);
    setIsCompressing(true);
    try {
      for (const file of selected) {
        try {
          const compressed = await compressImage(file);
          setDrafts((current) => [
            ...current,
            {
              id: uid("scan"),
              imageUrl: compressed.base64DataUrl,
              fileName:
                file instanceof File && file.name ? file.name : "Parchi photo",
              status: "queued",
              originalSizeKB: compressed.originalSizeKB,
              compressedSizeKB: compressed.compressedSizeKB,
            },
          ]);
        } catch (error) {
          toast({
            title: "Photo add nahi hui",
            description: error instanceof Error ? error.message : "Dobara try karein.",
            tone: "error",
          });
        }
      }
    } finally {
      setIsCompressing(false);
    }
  }

  async function addDemo() {
    if (drafts.length >= 15) {
      toast({ title: "Batch full", description: "Maximum 15 parchiyan.", tone: "error" });
      return;
    }
    try {
      setIsCompressing(true);
      const image = await rasterizeImage(sampleParchiImage);
      const bytes = Math.round((image.length * 3) / 4 / 1024);
      setDrafts((current) => [
        ...current,
        {
          id: uid("scan"),
          imageUrl: image,
          fileName: "Demo parchi · Nadeem Fabricators",
          status: "queued",
          originalSizeKB: bytes,
          compressedSizeKB: bytes,
        },
      ]);
      toast({
        title: "Sample parchi loaded",
        description: "Analyze dabayein — demo parser bill ready karega.",
        tone: "info",
        duration: 2200,
      });
    } catch {
      toast({ title: "Demo image load nahi hui", tone: "error" });
    } finally {
      setIsCompressing(false);
    }
  }

  function removeDraft(id: string) {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  }

  function clearDrafts() {
    setDrafts([]);
    setSaved([]);
    setStage("capture");
  }

  function firstReviewIndex(list: ScanDraft[]) {
    const ready = list.findIndex((draft) => draft.status === "ready");
    if (ready >= 0) return ready;
    return list.findIndex((draft) => draft.status === "error");
  }

  async function scanDrafts(indices: number[]) {
    if (!indices.length) {
      const first = firstReviewIndex(drafts);
      if (first >= 0) {
        setActiveIndex(first);
        setStage("review");
      }
      return;
    }
    if (locked) {
      toast({
        title: "Day locked hai",
        description: "Reports page par owner PIN se unlock karein.",
        tone: "error",
      });
      return;
    }
    setStage("scanning");
    setProgress({ done: 0, total: indices.length, current: indices[0] });
    const updated = [...drafts];

    for (let position = 0; position < indices.length; position += 1) {
      const index = indices[position];
      updated[index] = { ...updated[index], status: "processing", error: undefined };
      setDrafts([...updated]);
      setProgress({ done: position, total: indices.length, current: index });

      try {
        const response = await fetch("/api/scan-bill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl: updated[index].imageUrl,
            kind,
            products: state.products,
            parties: state.parties,
            fileName: updated[index].fileName,
          }),
        });
        const payload = (await response.json()) as ScanResponse;
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error || "AI could not read this parchi.");
        }
        updated[index] = {
          ...updated[index],
          status: "ready",
          extraction: payload.data,
          mock: Boolean(payload.mock),
          warning: payload.warning,
          debugError: payload.debug_error,
          error: undefined,
        };
      } catch (error) {
        updated[index] = {
          ...updated[index],
          status: "error",
          error: error instanceof Error ? error.message : "Scan failed. Retry karein.",
        };
      }
      setDrafts([...updated]);
      setProgress({ done: position + 1, total: indices.length, current: index });
    }

    const first = indices.find((index) => updated[index].status === "ready") ?? indices[0];
    setActiveIndex(first);
    setStage("review");
  }

  function handleAnalyze() {
    const queuedIndices = drafts
      .map((draft, index) => (draft.status === "queued" ? index : -1))
      .filter((index) => index >= 0);
    void scanDrafts(queuedIndices);
  }

  function handleRetry(index: number) {
    void scanDrafts([index]);
  }

  function updateActive(patch: NonNullable<ScanDraft["extraction"]>) {
    setDrafts((current) =>
      current.map((draft, index) =>
        index === activeIndex ? { ...draft, extraction: patch } : draft,
      ),
    );
  }

  function updateMeta(patch: Partial<Pick<ScanDraft, "party_id" | "paid_now">>) {
    setDrafts((current) =>
      current.map((draft, index) => (index === activeIndex ? { ...draft, ...patch } : draft)),
    );
  }

  async function handleConfirm(input: NewTransactionInput) {
    if (locked) {
      toast({
        title: "Day locked hai",
        description: "Owner PIN ke baghair save nahi ho sakta.",
        tone: "error",
      });
      return;
    }

    try {
      const { transaction, warning } = await saveTransaction(input);
      const party = state.parties.find((entry) => entry.id === input.party_id);
      const savedEntry: SavedEntry = {
        id: transaction.id,
        type: transaction.type,
        partyName: party?.name || "Cash counter",
        total: transaction.total_amount,
        routing: transaction.routing_mode,
        parchi: transaction.parchi_number || "—",
      };
      setSaved((current) => [...current, savedEntry]);
      setDrafts((current) =>
        current.map((draft, index) =>
          index === activeIndex ? { ...draft, status: "saved", error: undefined } : draft,
        ),
      );
      toast({
        title:
          transaction.type === "sale"
            ? "Sale save ho gayi"
            : transaction.type === "purchase"
              ? "Purchase stock mein add ho gaya"
              : "Wapsi entry save ho gayi",
        description: `${savedEntry.partyName} · ${formatPKR(transaction.total_amount)} · stock and handwriting alias updated.`,
      });
      if (warning) {
        toast({
          title: "Bill image upload warning",
          description: warning,
          tone: "info",
          duration: 6000,
        });
      }

      const candidates = drafts
        .map((draft, index) =>
          draft.status === "ready" && index !== activeIndex ? index : -1,
        )
        .filter((index) => index >= 0);
      const next = candidates.find((index) => index > activeIndex) ?? candidates[0];
      if (next !== undefined) {
        setActiveIndex(next);
      } else {
        setStage("done");
      }
    } catch (error) {
      toast({
        title: "Save nahi hua",
        description: error instanceof Error ? error.message : "Dobara try karein.",
        tone: "error",
        duration: 7000,
      });
    }
  }

  function reviewFailed() {
    const index = drafts.findIndex((draft) => draft.status === "error");
    if (index >= 0) {
      setActiveIndex(index);
      setStage("review");
    }
  }

  const header = useMemo(() => {
    if (stage === "capture") {
      return {
        eyebrow: "Smart Scanner · Zero Typing",
        title: (
          <>
            Parchi scan karein.
            <br className="sm:hidden" /> <span className="text-steel-700">AI baqi karega.</span>
          </>
        ),
        description:
          "Handwritten bill, stock register ya wapsi ki photo lein. AI items, rates, udhaar aur mazdoori samajh kar stock aur khata update karega.",
      };
    }
    if (stage === "scanning") {
      return {
        eyebrow: "Vision OCR · Reading",
        title: (
          <>
            Parchi padhi ja rahi hai
            <span className="text-emerald-600">…</span>
          </>
        ),
        description:
          "Handwriting decode ho rahi hai, items catalogue se match ho rahe hain, aur totals verify kiye ja rahe hain.",
      };
    }
    if (stage === "review") {
      return {
        eyebrow: `Human Review · ${kindLabels[kind].short}`,
        title: (
          <>
            Review karein,
            <br className="sm:hidden" /> <span className="text-steel-700">phir save karein.</span>
          </>
        ),
        description:
          "Amber fields ko tap karke theek karein. Confirm karne par stock aur khata ek saath update honge.",
      };
    }
    return {
      eyebrow: "Batch Complete · Saved",
      title: (
        <>
          Sab bills <span className="text-emerald-700">save ho gaye.</span>
        </>
      ),
      description:
        "Stock, cash aur customer khatay update ho chuke hain. Ab EOD report generate karke din close karein.",
    };
  }, [stage, kind]);

  return (
    <>
      <PageHeader
        eyebrow={header.eyebrow}
        title={header.title}
        description={header.description}
        actions={
          stage === "review" || stage === "scanning" ? (
            <div className="flex items-center gap-2">
              <Badge tone={readyDrafts.length ? "emerald" : "neutral"}>
                {saved.length} saved · {drafts.length} total
              </Badge>
              <button
                type="button"
                onClick={() => setStage("capture")}
                className="text-[10.5px] font-bold text-ink-mute transition hover:text-ink"
              >
                Scan queue
              </button>
            </div>
          ) : stage === "done" ? (
            <Badge tone="emerald" dot>
              {saved.length} entries booked
            </Badge>
          ) : (
            <Badge tone="steel">
              <Sparkles className="h-3 w-3" />
              AI-assisted · Human verified
            </Badge>
          )
        }
      />

      {stage === "capture" ? (
        <CaptureStage
          kind={kind}
          onKindChange={setKind}
          drafts={drafts}
          onFiles={(files) => void addFiles(files)}
          onDemo={() => void addDemo()}
          onRemove={removeDraft}
          onClear={clearDrafts}
          onAnalyze={handleAnalyze}
          locked={locked}
          compressing={isCompressing}
        />
      ) : null}

      {stage === "scanning" ? (
        <ScanningStage
          draft={drafts[progress.current] || drafts[0]}
          done={progress.done}
          total={progress.total}
          kind={kind}
        />
      ) : null}

      {stage === "review" && activeDraft ? (
        <div>
          <BatchQueue
            drafts={drafts}
            activeIndex={activeIndex}
            onSelect={(index) => {
              if (drafts[index].status !== "saved") setActiveIndex(index);
            }}
          />
          <ReviewStage
            draft={activeDraft}
            kinds={kind}
            locked={locked}
            onBack={() => setStage("capture")}
            onRetry={() => handleRetry(activeIndex)}
            onUpdate={updateActive}
            onMeta={updateMeta}
            onConfirm={handleConfirm}
          />
        </div>
      ) : null}

      {stage === "done" ? (
        <DoneStage
          saved={saved}
          failedCount={failedDrafts.length}
          onReviewFailed={reviewFailed}
          onReset={() => {
            setDrafts([]);
            setSaved([]);
            setActiveIndex(0);
            setStage("capture");
          }}
        />
      ) : null}
    </>
  );
}

function ScanningStage({
  draft,
  done,
  total,
  kind,
}: {
  draft: ScanDraft | undefined;
  done: number;
  total: number;
  kind: ScanKind;
}) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative overflow-hidden rounded-2xl border border-ink bg-ink p-5 text-white shadow-float">
        <div className="industrial-grid absolute inset-0 opacity-[0.14]" />
        <div className="relative flex items-center justify-between gap-3">
          <Badge tone="dark" dot className="border-white/10 bg-white/5 text-emerald-300">
            AI reading · Please wait
          </Badge>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
            {kindLabels[kind].label}
          </span>
        </div>
        <div className="relative mx-auto mt-5 max-w-[320px] overflow-hidden rounded-xl border border-white/10 bg-white/5 p-2">
          {draft ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.imageUrl}
              alt="Parchi being scanned"
              className="max-h-[365px] w-full rounded-lg object-contain opacity-85"
            />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center">
              <ReceiptText className="h-10 w-10 text-slate-600" />
            </div>
          )}
          <span className="absolute inset-x-3 top-0 h-[2px] animate-scan-sweep bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_18px_rgba(52,211,153,0.75)]" />
          <span className="absolute left-4 top-4 rounded-md bg-ink/80 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em] text-emerald-300 backdrop-blur">
            Live parse
          </span>
        </div>
        <p className="relative mt-4 text-center text-[10px] font-medium text-slate-500">
          Photo server par private rehti hai · structured JSON return hota hai
        </p>
      </div>

      <Card className="self-start p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-ink-mute">Batch progress</p>
            <h2 className="mt-1 font-display text-lg font-extrabold tracking-[-0.025em] text-ink">
              {done} / {total} bills
            </h2>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Loader2 className="h-5 w-5 animate-spin" />
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-right text-[10px] font-bold tabular text-emerald-700">{pct}%</p>

        <div className="mt-5 space-y-3">
          <StageStep
            status={done > 0 ? "done" : "active"}
            title="Handwriting decode"
            caption="English + Roman Urdu abbreviations"
          />
          <StageStep
            status={done > 0 ? "done" : "active"}
            title="Product matching"
            caption="Size · gauge · grade · shape"
          />
          <StageStep
            status={done >= total ? "done" : "pending"}
            title="Totals & confidence"
            caption="Human review ke liye fields mark"
          />
        </div>

        <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold text-amber-900">
            <AlertCircle className="h-3.5 w-3.5" />
            Kuch bhi automatic save nahi hoga
          </p>
          <p className="mt-1 text-[9.5px] leading-relaxed text-amber-700">
            AI sirf draft banata hai. Aap confirm karenge tab stock aur khata update hoga.
          </p>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[9px] font-medium text-slate-400">
          <ShieldCheck className="h-3 w-3" />
          glm-4.6v-flashx → glm-4.6v-flash → qwen-vl-plus → glm-4.6v (low confidence) · secure server route
        </div>
      </Card>
    </div>
  );
}

function StageStep({
  status,
  title,
  caption,
}: {
  status: "done" | "active" | "pending";
  title: string;
  caption: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
          status === "done" && "border-emerald-200 bg-emerald-50 text-emerald-700",
          status === "active" && "border-amber-200 bg-amber-50 text-amber-700",
          status === "pending" && "border-line bg-slate-50 text-slate-300",
        )}
      >
        {status === "done" ? (
          <Check className="h-3 w-3" />
        ) : status === "active" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </span>
      <div>
        <p className={cn("text-[10.5px] font-bold", status === "pending" ? "text-slate-400" : "text-ink")}>
          {title}
        </p>
        <p className="mt-0.5 text-[9px] leading-relaxed text-ink-mute">{caption}</p>
      </div>
    </div>
  );
}

function BatchQueue({
  drafts,
  activeIndex,
  onSelect,
}: {
  drafts: ScanDraft[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (drafts.length <= 1) return null;
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-line bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-mute">
          Batch · {drafts.length} parchis
        </p>
        <p className="text-[9px] font-medium text-slate-400">
          {drafts.filter((draft) => draft.status === "saved").length} saved ·{" "}
          {drafts.filter((draft) => draft.status === "ready").length} ready
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto p-2.5 no-scrollbar">
        {drafts.map((draft, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={draft.id}
              type="button"
              disabled={draft.status === "saved"}
              onClick={() => onSelect(index)}
              className={cn(
                "flex min-w-[190px] shrink-0 items-center gap-2.5 rounded-lg border p-2 text-left transition",
                isActive
                  ? "border-ink bg-slate-50"
                  : "border-line bg-white hover:border-slate-300",
                draft.status === "saved" && "opacity-60",
              )}
            >
              <span className="relative h-11 w-9 shrink-0 overflow-hidden rounded border border-line bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.imageUrl} alt="" className="h-full w-full object-cover" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-[9.5px] font-bold text-ink">
                  Bill {index + 1}
                  {draft.status === "saved" ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  ) : draft.status === "error" ? (
                    <AlertCircle className="h-3 w-3 text-crimson" />
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[8.5px] font-medium text-ink-mute">
                  {draft.status === "saved"
                    ? "Saved"
                    : draft.status === "error"
                      ? "Failed · retry"
                      : draft.extraction?.parchi_number
                        ? `#${draft.extraction.parchi_number}`
                        : "Ready"}
                </span>
              </span>
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  isActive ? "text-ink" : "text-slate-300",
                )}
              />
            </button>
          );
        })}
      </div>
      <div className="border-t border-line bg-slate-50/60 px-3.5 py-1.5">
        <p className="text-[8.5px] text-slate-400">
          Har bill apne review ke saath save hota hai. Saved bills dobara edit nahi honge.
        </p>
      </div>
    </div>
  );
}

function DoneStage({
  saved,
  failedCount,
  onReviewFailed,
  onReset,
}: {
  saved: SavedEntry[];
  failedCount: number;
  onReviewFailed: () => void;
  onReset: () => void;
}) {
  const total = saved.reduce((sum, entry) => sum + entry.total, 0);
  const cash = saved
    .filter((entry) => entry.routing === "cash_sale")
    .reduce((sum, entry) => sum + entry.total, 0);
  const khata = total - cash;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-card">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400" />
        <div className="relative px-6 py-8 text-center">
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <span className="absolute inset-0 animate-ping rounded-2xl bg-emerald-400/20" />
            <CheckCircle2 className="relative h-8 w-8" />
          </div>
          <p className="mt-4 text-[9.5px] font-bold uppercase tracking-[0.18em] text-emerald-700">
            Stock & ledger committed
          </p>
          <h2 className="mt-1 font-display text-[25px] font-extrabold tracking-[-0.035em] text-ink">
            Batch complete.
          </h2>
          <p className="mx-auto mt-1.5 max-w-sm text-[11.5px] leading-relaxed text-ink-mute">
            {saved.length === 1
              ? "1 bill save hua. Inventory aur customer balance foran update ho gaye."
              : `${saved.length} bills save hue. Inventory aur customer balances foran update ho gaye.`}
          </p>

          <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-2">
            <SummaryTile label="Bills" value={String(saved.length)} />
            <SummaryTile label="Total value" value={formatPKR(total)} />
            <SummaryTile label="Udhaar" value={formatPKR(khata)} />
          </div>

          {failedCount > 0 ? (
            <div className="mx-auto mt-5 flex max-w-md items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="flex-1">
                <p className="text-[10.5px] font-bold text-amber-900">
                  {failedCount} bill{failedCount === 1 ? "" : "s"} scan nahi ho sake
                </p>
                <button
                  type="button"
                  onClick={onReviewFailed}
                  className="mt-1 text-[9.5px] font-bold text-amber-800 underline decoration-amber-400 underline-offset-2"
                >
                  Review failed bills
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={onReset}>
              <Camera className="h-4 w-4" />
              Scan another batch
            </Button>
            <Link href="/dashboard" className={buttonStyles({ variant: "outline" })}>
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
            <Link href="/reports" className={buttonStyles({ variant: "outline" })}>
              <FileText className="h-4 w-4" />
              EOD Report
            </Link>
          </div>
        </div>

        <div className="border-t border-line bg-slate-50/60 px-5 py-4">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-mute">
            Saved entries
          </p>
          <div className="space-y-1.5">
            {saved.length ? (
              saved.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2.5 rounded-lg border border-line bg-white px-3 py-2"
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      entry.type === "purchase"
                        ? "bg-blue-50 text-steel-700"
                        : entry.type === "sale_return"
                          ? "bg-red-50 text-crimson"
                          : "bg-emerald-50 text-emerald-700",
                    )}
                  >
                    {entry.type === "purchase" ? (
                      <PackageCheck className="h-3.5 w-3.5" />
                    ) : entry.type === "sale_return" ? (
                      <RotateCcw className="h-3.5 w-3.5" />
                    ) : (
                      <ReceiptText className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10.5px] font-bold text-ink">{entry.partyName}</p>
                    <p className="text-[8.5px] text-ink-mute">
                      #{entry.parchi} · {paymentModeLabel(entry.routing === "cash_sale" ? "cash" : "udhaar")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-extrabold tabular text-ink">{formatPKR(entry.total)}</p>
                    <p className="text-[8px] font-semibold uppercase text-emerald-600">Saved</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-ink-mute">No entries in this batch.</p>
            )}
          </div>
        </div>
      </div>

      <Card className="self-start p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <CircleDollarSign className="h-4 w-4" />
          </span>
          <div>
            <p className="font-display text-[13px] font-bold text-ink">Batch accounting</p>
            <p className="text-[9.5px] text-ink-mute">Cash vs khata split</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
            <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-700">
              <Wallet className="h-3 w-3" />
              Cash routed
            </p>
            <p className="mt-1 font-display text-[19px] font-extrabold tabular text-ink">
              {formatPKR(cash)}
            </p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
            <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-amber-700">
              <ReceiptText className="h-3 w-3" />
              Khata routed
            </p>
            <p className="mt-1 font-display text-[19px] font-extrabold tabular text-ink">
              {formatPKR(khata)}
            </p>
          </div>
        </div>
        <div className="mt-4 border-t border-dashed border-line pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold text-ink-mute">Batch total</span>
            <span className="font-display text-[15px] font-extrabold tabular text-ink">
              {formatPKR(total)}
            </span>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-line bg-slate-50 p-3">
          <p className="flex items-center gap-1.5 text-[9.5px] font-bold text-ink">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Next: Close the day
          </p>
          <p className="mt-1 text-[9px] leading-relaxed text-ink-mute">
            Reports page se galla reconcile karein, PDF/Excel download karein aur din lock karein.
          </p>
          <Link
            href="/reports"
            className="mt-2 flex items-center gap-1 text-[9.5px] font-bold text-steel-700"
          >
            Open EOD Reports
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-slate-50/70 px-2 py-2.5">
      <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-ink-mute">{label}</p>
      <p className="mt-1 truncate font-display text-[13px] font-extrabold tabular text-ink">{value}</p>
    </div>
  );
}
