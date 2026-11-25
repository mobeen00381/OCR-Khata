"use client";

import { useRef, useState } from "react";
import {
  Camera,
  Check,
  ImagePlus,
  Images,
  Info,
  Loader2,
  LockKeyhole,
  PackageOpen,
  ReceiptText,
  RotateCcw,
  ScanLine,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import type { ScanDraft, ScanKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatKB } from "@/lib/compressImage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const kinds: Array<{
  value: ScanKind;
  title: string;
  shortTitle: string;
  roman: string;
  icon: typeof ReceiptText;
  accent: string;
}> = [
  {
    value: "sale",
    title: "Sales Bill",
    shortTitle: "Sales",
    roman: "Becha Hua Maal",
    icon: ReceiptText,
    accent: "emerald",
  },
  {
    value: "purchase",
    title: "Purchase / Stock",
    shortTitle: "Purchase",
    roman: "Aaya Hua Maal",
    icon: PackageOpen,
    accent: "steel",
  },
  {
    value: "return",
    title: "Maal Wapsi",
    shortTitle: "Wapsi",
    roman: "Customer Return",
    icon: RotateCcw,
    accent: "crimson",
  },
];

export function CaptureStage({
  kind,
  onKindChange,
  drafts,
  onFiles,
  onDemo,
  onRemove,
  onClear,
  onAnalyze,
  locked,
  compressing = false,
}: {
  kind: ScanKind;
  onKindChange: (kind: ScanKind) => void;
  drafts: ScanDraft[];
  onFiles: (files: File[]) => void;
  onDemo: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onAnalyze: () => void;
  locked: boolean;
  compressing?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const activeKind = kinds.find((entry) => entry.value === kind) || kinds[0];
  const queuedCount = drafts.filter((draft) => draft.status === "queued").length;

  function pick(files: FileList | null) {
    if (!files?.length || compressing) return;
    onFiles(Array.from(files));
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-1.5 sm:flex sm:gap-2">
        {kinds.map((entry) => {
          const Icon = entry.icon;
          const active = entry.value === kind;
          return (
            <button
              key={entry.value}
              type="button"
              onClick={() => onKindChange(entry.value)}
              className={cn(
                "group relative flex min-w-0 flex-1 flex-col items-start gap-2 rounded-xl border p-2.5 text-left transition sm:flex-row sm:items-center sm:gap-3 sm:p-3",
                active
                  ? "border-ink bg-ink text-white shadow-[0_10px_24px_-18px_rgba(15,23,42,0.85)]"
                  : "border-line bg-white text-ink hover:border-slate-300",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border sm:h-9 sm:w-9",
                  active
                    ? "border-white/10 bg-white/10 text-emerald-300"
                    : entry.accent === "steel"
                      ? "border-blue-100 bg-blue-50 text-steel-700"
                      : entry.accent === "crimson"
                        ? "border-red-100 bg-red-50 text-crimson"
                        : "border-emerald-100 bg-emerald-50 text-emerald-700",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[10.5px] font-bold leading-tight sm:text-[12px]">
                  <span className="sm:hidden">{entry.shortTitle}</span>
                  <span className="hidden sm:inline">{entry.title}</span>
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-[8px] font-medium leading-tight sm:text-[9.5px]",
                    active ? "text-slate-400" : "text-ink-mute",
                  )}
                >
                  {entry.roman}
                </span>
              </span>
              {active ? (
                <Check className="absolute right-2 top-2 hidden h-3.5 w-3.5 shrink-0 text-emerald-400 sm:static sm:ml-auto sm:block" />
              ) : null}
            </button>
          );
        })}
      </div>

      {locked ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <p className="text-[12px] font-bold text-amber-900">Aaj ka din locked hai</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700">
              Naye bill save nahi ho sakte. Reports page se owner PIN ke saath unlock karein.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(290px,.75fr)]">
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-slate-800 bg-ink p-5 text-white shadow-[0_24px_50px_-30px_rgba(15,23,42,0.85)] transition sm:p-7",
            dragging && "ring-2 ring-emerald-400 ring-offset-2 ring-offset-canvas",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!compressing) pick(event.dataTransfer.files);
          }}
        >
          <div className="industrial-grid absolute inset-0 opacity-[0.16]" />
          <span className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-steel-600/25 blur-[70px]" />
          <span className="absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-emerald-500/10 blur-[60px]" />

          <div className="relative flex items-center justify-between gap-3">
            <Badge tone="dark" dot className="border-white/10 bg-white/5 text-emerald-300 backdrop-blur">
              <span className="sm:hidden">Dual OCR · Qwen + GLM</span>
              <span className="hidden sm:inline">Dual OCR · Qwen 3.8 + GLM 5.3</span>
            </Badge>
            <span className="hidden text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 sm:inline">
              {activeKind.roman}
            </span>
          </div>

          <div className="relative mt-7 flex flex-col items-center text-center">
            <div className="relative mb-5 flex h-[150px] w-[190px] items-center justify-center sm:h-[170px] sm:w-[220px]">
              <span className="absolute inset-0 rounded-2xl border border-white/10 bg-white/[0.025]" />
              <span className="absolute left-3 top-3 h-5 w-5 rounded-tl border-l-2 border-t-2 border-emerald-400/80" />
              <span className="absolute right-3 top-3 h-5 w-5 rounded-tr border-r-2 border-t-2 border-emerald-400/80" />
              <span className="absolute bottom-3 left-3 h-5 w-5 rounded-bl border-b-2 border-l-2 border-emerald-400/80" />
              <span className="absolute bottom-3 right-3 h-5 w-5 rounded-br border-b-2 border-r-2 border-emerald-400/80" />
              <span className="absolute inset-x-4 top-1/2 h-px animate-scan-sweep bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent shadow-[0_0_12px_rgba(52,211,153,0.6)]" />
              <div className="relative text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur">
                  <Camera className="h-6 w-6 text-emerald-300" />
                </span>
                <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Align parchi in frame
                </p>
              </div>
            </div>

            <h2 className="font-display text-[23px] font-extrabold tracking-[-0.035em] sm:text-[27px]">
              Parchi ki tasveer lein.
            </h2>
            <p className="mt-1.5 max-w-sm text-[11.5px] leading-relaxed text-slate-400">
              Handwritten bill ki saaf photo. AI khud items, rate, udhaar aur mazdoori parse karega.
            </p>

            <div className="mt-5 grid w-full max-w-[330px] grid-cols-1 gap-2 sm:grid-cols-[1.3fr_.9fr]">
              <Button
                size="lg"
                onClick={() => cameraRef.current?.click()}
                disabled={locked || drafts.length >= 15 || compressing}
                className="w-full"
              >
                {compressing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {compressing ? "Compressing…" : "Open Camera"}
              </Button>
              <Button
                size="lg"
                onClick={() => galleryRef.current?.click()}
                disabled={locked || drafts.length >= 15 || compressing}
                className="w-full border border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.1]"
                variant="ghost"
              >
                <Images className="h-4 w-4" />
                Gallery
              </Button>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={onDemo}
                disabled={locked || drafts.length >= 15 || compressing}
                className="flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-400 transition hover:text-emerald-300 disabled:opacity-40"
              >
                <WandSparkles className="h-3.5 w-3.5" />
                Try demo parchi
              </button>
              <span className="h-3 w-px bg-white/10" />
              <span className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                Batch mode · 15 tak
              </span>
            </div>
          </div>

          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-white/10 pt-4 text-[9px] font-medium uppercase tracking-[0.08em] text-slate-500">
            <span>JPG / PNG / WebP</span>
            <span className="h-2.5 w-px bg-white/10" />
            <span>Canvas compressed · EXIF stripped</span>
            <span className="h-2.5 w-px bg-white/10" />
            <span>Private storage</span>
          </div>

          {dragging ? (
            <div className="absolute inset-3 z-10 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-400 bg-ink/90 text-emerald-300 backdrop-blur">
              <Upload className="h-7 w-7" />
              <p className="mt-2 font-display text-sm font-bold">Drop parchi photos here</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3.5">
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <div>
                <p className="text-[12px] font-bold text-ink">Scan Queue</p>
                <p className="mt-0.5 text-[9.5px] text-ink-mute">Aaj ki evening closing ke liye</p>
              </div>
              <Badge tone={compressing ? "amber" : drafts.length ? "emerald" : "neutral"}>
                {compressing ? "Compressing…" : `${drafts.length} / 15`}
              </Badge>
            </div>

            {drafts.length ? (
              <>
                <div className="max-h-[286px] space-y-2 overflow-y-auto p-3">
                  {drafts.map((draft, index) => (
                    <div
                      key={draft.id}
                      className="group flex items-center gap-2.5 rounded-xl border border-line bg-slate-50/50 p-2 transition hover:border-slate-300"
                    >
                      <span className="relative h-[54px] w-[43px] shrink-0 overflow-hidden rounded-md border border-line bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={draft.imageUrl} alt="" className="h-full w-full object-cover" />
                        <span className="absolute left-0 top-0 rounded-br bg-ink/85 px-1 py-0.5 text-[7.5px] font-bold text-white">
                          {index + 1}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10.5px] font-semibold text-ink">{draft.fileName}</p>
                        <p className="mt-0.5 text-[9px] font-medium text-emerald-700">
                          {draft.status === "ready" || draft.status === "error"
                            ? draft.status === "ready"
                              ? "Scanned · review pending"
                              : "Scan failed"
                            : "Photo ready"}
                        </p>
                        {typeof draft.originalSizeKB === "number" &&
                        typeof draft.compressedSizeKB === "number" ? (
                          <p className="mt-0.5 truncate text-[8px] font-medium tabular text-slate-400">
                            Compressed: {formatKB(draft.originalSizeKB)} →{" "}
                            {formatKB(draft.compressedSizeKB)}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(draft.id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-400 transition hover:border-line hover:bg-white hover:text-crimson"
                        aria-label={`Remove ${draft.fileName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-line p-3">
                  <Button
                    onClick={onAnalyze}
                    disabled={locked || drafts.length === 0 || compressing}
                    className="w-full"
                    size="lg"
                  >
                    {compressing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ScanLine className="h-4 w-4" />
                    )}
                    {compressing
                      ? "Compressing photos…"
                      : queuedCount
                        ? `Analyze ${queuedCount} ${queuedCount === 1 ? "Bill" : "Bills"}`
                        : `Review ${drafts.length} Scanned`}
                  </Button>
                  <button
                    type="button"
                    onClick={onClear}
                    className="mt-2 w-full py-1 text-center text-[10px] font-semibold text-ink-mute transition hover:text-crimson"
                  >
                    Clear all photos
                  </button>
                </div>
              </>
            ) : (
              <div className="px-4 py-8 text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                  <ImagePlus className="h-4 w-4" />
                </span>
                <p className="mt-2.5 text-[11px] font-bold text-ink">Queue khali hai</p>
                <p className="mx-auto mt-1 max-w-[180px] text-[10px] leading-relaxed text-ink-mute">
                  Camera se photo lein ya gallery se 1–15 bills select karein.
                </p>
                <button
                  type="button"
                  onClick={onDemo}
                  disabled={locked || compressing}
                  className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-steel-700"
                >
                  <Sparkles className="h-3 w-3" />
                  Load sample parchi
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm">
                <Info className="h-3.5 w-3.5" />
              </span>
              <p className="text-[11px] font-bold text-amber-900">Munshi shortcuts</p>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9.5px] leading-relaxed text-amber-800">
              <p><span className="font-bold">nali / pipe</span> = length</p>
              <p><span className="font-bold">dedh</span> = 1.5 inch</p>
              <p><span className="font-bold">udhaar</span> = khata</p>
              <p><span className="font-bold">mazdoori</span> = extra</p>
            </div>
          </div>

          {drafts.length ? (
            <div className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-[9.5px] font-medium text-ink-mute">
              <span className="font-bold text-ink">Tip:</span> Phari photo table par flat rakhein. Flash
              se reflection na aaye.
            </div>
          ) : null}
        </div>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          pick(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          pick(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
