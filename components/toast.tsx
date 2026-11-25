"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn, uid } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: string;
}

const ToastContext = createContext<{
  toast: (input: ToastInput) => void;
} | null>(null);

const toneMap = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-600",
    bar: "bg-emerald-500",
  },
  error: {
    icon: AlertTriangle,
    iconClass: "text-crimson",
    bar: "bg-crimson",
  },
  info: {
    icon: Info,
    iconClass: "text-steel-600",
    bar: "bg-steel-600",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = uid("toast");
    setItems((current) => [...current.slice(-3), { ...input, id }]);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-[calc(94px+env(safe-area-inset-bottom))] z-[110] flex flex-col gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:w-[380px]">
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const tone = toneMap[item.tone || "success"];
            const Icon = tone.icon;
            return (
              <ToastCard
                key={item.id}
                item={item}
                icon={Icon}
                iconClass={tone.iconClass}
                bar={tone.bar}
                onDismiss={() => dismiss(item.id)}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  item,
  icon: Icon,
  iconClass,
  bar,
  onDismiss,
}: {
  item: ToastItem;
  icon: typeof Info;
  iconClass: string;
  bar: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, item.duration ?? 4200);
    return () => window.clearTimeout(timer);
  }, [item.duration, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 16, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className="pointer-events-auto relative flex overflow-hidden rounded-xl border border-line bg-white shadow-float"
      role="status"
    >
      <span className={cn("w-1 shrink-0", bar)} />
      <div className="flex flex-1 items-start gap-3 p-3.5 pr-2">
        <Icon className={cn("mt-0.5 h-[18px] w-[18px] shrink-0", iconClass)} strokeWidth={2.2} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-snug text-ink">{item.title}</p>
          {item.description ? (
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-mute">{item.description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
