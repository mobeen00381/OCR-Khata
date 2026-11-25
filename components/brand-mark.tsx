import { cn } from "@/lib/utils";

export function BrandMark({ className, size = 38 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-ink shadow-[0_6px_16px_-8px_rgba(15,23,42,0.65)]",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-emerald-500/20 blur-[2px]"
        aria-hidden="true"
      />
      <svg viewBox="0 0 40 40" className="relative h-[72%] w-[72%]" fill="none">
        <circle cx="20" cy="20" r="12.5" stroke="white" strokeWidth="2.15" strokeOpacity="0.92" />
        <circle cx="20" cy="20" r="6.8" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <path
          d="M8 30 30 8"
          stroke="#34D399"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path d="M29.6 8h3.2v3.2" stroke="#34D399" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="29.8" cy="29.8" r="1.8" fill="#34D399" />
      </svg>
    </span>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark size={compact ? 34 : 38} />
      <div className="leading-none">
        <div className="flex items-center gap-1.5 font-display text-[17px] font-extrabold tracking-[-0.035em] text-ink">
          SteelKhata
          <span className="rounded-[5px] border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-sans text-[8.5px] font-extrabold uppercase tracking-[0.13em] text-emerald-700">
            AI
          </span>
        </div>
        <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.19em] text-slate-400">
          Scan · Khata · Control
        </p>
      </div>
    </div>
  );
}
