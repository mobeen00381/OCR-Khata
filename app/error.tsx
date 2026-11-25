"use client";

import { useEffect } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-7 text-center shadow-card">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-crimson">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <p className="mt-4 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Something went wrong
        </p>
        <h1 className="mt-1 font-display text-[22px] font-extrabold tracking-[-0.03em] text-ink">
          App ko dobara load karein.
        </h1>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-mute">
          Aapka local demo data mehfooz hai. Agar masla rahe to page refresh karein.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[12px] font-bold text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
        {error.digest ? (
          <p className="mt-4 text-[8px] font-medium text-slate-300">Ref: {error.digest}</p>
        ) : null}
      </div>
    </main>
  );
}
