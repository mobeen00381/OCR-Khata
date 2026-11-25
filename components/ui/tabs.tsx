"use client";

import { cn } from "@/lib/utils";

export interface TabOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: TabOption<T>[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-xl border border-line bg-slate-100/80 p-1",
        className,
      )}
      role="tablist"
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steel-600/30",
              size === "md" ? "min-h-[40px] px-2 text-xs" : "min-h-[34px] px-2 text-[11px]",
              active
                ? "bg-white text-ink shadow-[0_1px_3px_rgba(15,23,42,0.12)]"
                : "text-ink-mute hover:text-ink",
            )}
          >
            {option.icon}
            <span className="whitespace-nowrap">{option.label}</span>
            {option.hint ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                  active ? "bg-emerald-50 text-emerald-700" : "bg-white/70 text-ink-mute",
                )}
              >
                {option.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
