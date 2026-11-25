import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeTone =
  | "neutral"
  | "emerald"
  | "amber"
  | "steel"
  | "crimson"
  | "violet"
  | "dark";

const tones: Record<BadgeTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-ink-soft",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  steel: "border-blue-100 bg-blue-50 text-steel-700",
  crimson: "border-red-100 bg-red-50 text-crimson",
  violet: "border-violet-100 bg-violet-50 text-violet-700",
  dark: "border-ink bg-ink text-white",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10.5px] font-bold uppercase leading-none tracking-[0.055em]",
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "emerald" && "bg-emerald-500",
            tone === "amber" && "bg-amber-500",
            tone === "steel" && "bg-blue-500",
            tone === "crimson" && "bg-red-500",
            tone === "violet" && "bg-violet-500",
            tone === "neutral" && "bg-slate-400",
            tone === "dark" && "bg-emerald-400",
          )}
        />
      )}
      {children}
    </span>
  );
}
