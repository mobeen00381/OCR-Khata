import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-7 text-center shadow-card">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
          <FileQuestion className="h-5 w-5" />
        </span>
        <p className="mt-4 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
          404 · Not Found
        </p>
        <h1 className="mt-1 font-display text-[22px] font-extrabold tracking-[-0.03em] text-ink">
          Yeh page nahi mila.
        </h1>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-mute">
          Link purana ho sakta hai. Dashboard se dobara shuru karein.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[12px] font-bold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
