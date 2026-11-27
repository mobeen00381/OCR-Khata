"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Boxes,
  Camera,
  ChevronRight,
  Cloud,
  CloudOff,
  Database,
  FileBarChart2,
  LayoutDashboard,
  Loader2,
  NotebookTabs,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn, initials } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useToast } from "./toast";
import { BrandMark, Wordmark } from "./brand-mark";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, hint: "Aaj ka haal" },
  { label: "Scan", href: "/scan", icon: ScanLine, hint: "Parchi" },
  { label: "Stock", href: "/stock", icon: Boxes, hint: "Maal" },
  { label: "Khatay", href: "/khatay", icon: NotebookTabs, hint: "Udhaar" },
  { label: "Reports", href: "/reports", icon: FileBarChart2, hint: "Hisab" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, hydrated } = useStore();

  const lowStockCount = state.products.filter(
    (product) => product.current_stock <= product.low_stock_alert,
  ).length;

  if (!hydrated) {
    return <BootSplash />;
  }

  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <DesktopSidebar pathname={pathname} lowStockCount={lowStockCount} />
      <MobileHeader lowStockCount={lowStockCount} />
      <BottomNav pathname={pathname} />

      <div className="md:pl-[264px]">
        <motion.main
          id="main-content"
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[1420px] px-4 pb-nav pt-5 sm:px-6 md:px-8 md:pb-10 md:pt-8 lg:px-10"
        >
          <CloudStatusBanner />
          {children}
        </motion.main>
      </div>
    </div>
  );
}

function CloudStatusBanner() {
  const {
    dataMode,
    remoteEmpty,
    remoteError,
    syncWarning,
    seedRemoteDemo,
    reloadRemote,
    clearSyncWarning,
  } = useStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState<"seed" | "retry" | null>(null);

  async function seed() {
    setLoading("seed");
    try {
      await seedRemoteDemo();
      toast({
        title: "Demo shop loaded into Supabase",
        description: "Stock, khatay, bills and payments are now cloud-persisted.",
      });
    } catch (error) {
      toast({
        title: "Demo data load nahi hui",
        description: error instanceof Error ? error.message : "Check Supabase schema.",
        tone: "error",
        duration: 7000,
      });
    } finally {
      setLoading(null);
    }
  }

  async function retry() {
    setLoading("retry");
    try {
      await reloadRemote();
      toast({ title: "Cloud workspace refreshed" });
    } catch (error) {
      toast({
        title: "Cloud refresh failed",
        description: error instanceof Error ? error.message : "Still unavailable.",
        tone: "error",
      });
    } finally {
      setLoading(null);
    }
  }

  if (remoteEmpty) {
    return (
      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm">
            <Database className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11.5px] font-bold text-amber-900">
              Supabase connected · shop database is empty
            </p>
            <p className="mt-0.5 text-[9.5px] leading-relaxed text-amber-700">
              Load the Pakistani steel-store demo to start testing with persistent products,
              khatay and transactions.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void seed()}
          disabled={Boolean(loading)}
          className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 text-[10px] font-bold text-white transition hover:bg-amber-700 disabled:opacity-60"
        >
          {loading === "seed" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Database className="h-3.5 w-3.5" />
          )}
          {loading === "seed" ? "Loading demo…" : "Load Demo Shop Data"}
        </button>
      </div>
    );
  }

  if (remoteError) {
    return (
      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-crimson shadow-sm">
            <CloudOff className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11.5px] font-bold text-crimson">
              {dataMode === "local" ? "Cloud unavailable · local cache active" : "Supabase sync error"}
            </p>
            <p className="mt-0.5 max-h-16 overflow-y-auto break-words text-[9px] leading-relaxed text-red-700">
              {remoteError}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={Boolean(loading)}
          className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-[10px] font-bold text-crimson transition hover:bg-red-50 disabled:opacity-60"
        >
          {loading === "retry" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Retry
        </button>
      </div>
    );
  }

  if (syncWarning) {
    return (
      <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
        <Cloud className="h-4 w-4 shrink-0 text-amber-700" />
        <p className="flex-1 text-[10px] leading-relaxed text-amber-800">{syncWarning}</p>
        <button
          type="button"
          onClick={clearSyncWarning}
          className="flex h-7 w-7 items-center justify-center rounded-md text-amber-700 hover:bg-amber-100"
          aria-label="Dismiss cloud warning"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return null;
}

function BootSplash() {
  return (
    <div
      className="fixed inset-0 z-[120] flex min-h-dvh flex-col items-center justify-center bg-canvas"
      role="status"
      aria-live="polite"
    >
      <div className="industrial-grid absolute inset-0 opacity-40" />
      <div className="relative flex flex-col items-center">
        <BrandMark size={54} />
        <div className="mt-4 flex items-center gap-1.5 font-display text-[20px] font-extrabold tracking-[-0.035em] text-ink">
          SteelKhata
          <span className="rounded-[5px] border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-sans text-[9px] font-extrabold uppercase tracking-[0.13em] text-emerald-700">
            AI
          </span>
        </div>
        <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.19em] text-slate-400">
          Opening your khata
        </p>
        <div className="mt-5 h-1 w-28 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-1/2 animate-pulse-soft rounded-full bg-emerald-500" />
        </div>
      </div>
    </div>
  );
}

function DesktopSidebar({  pathname,
  lowStockCount,
}: {
  pathname: string;
  lowStockCount: number;
}) {
  const { state, dataMode } = useStore();
  const business = state.business;

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col overflow-y-auto border-r border-line bg-white/95 backdrop-blur-xl md:flex">
      <div className="px-6 pb-5 pt-7">
        <Wordmark />
      </div>

      <div className="mx-4 mb-6 rounded-xl border border-line bg-slate-50/80 p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white font-display text-[11px] font-extrabold text-ink shadow-sm">
            MS
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-bold text-ink">{business.business_name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-mute">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              {business.city} · Steel Pipes
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3">
        <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Workspace
        </p>
        <div className="space-y-1">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex min-h-[46px] items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-all",
                  active
                    ? "bg-ink text-white shadow-[0_8px_20px_-14px_rgba(15,23,42,0.8)]"
                    : "text-ink-soft hover:bg-slate-50 hover:text-ink",
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition",
                    active ? "text-emerald-300" : "text-slate-400 group-hover:text-ink-soft",
                  )}
                  strokeWidth={active ? 2.2 : 1.9}
                />
                <span className="flex-1">{item.label}</span>
                {item.href === "/stock" && lowStockCount > 0 ? (
                  <span
                    className={cn(
                      "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[9.5px] font-extrabold tabular",
                      active ? "bg-amber-400 text-ink" : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {lowStockCount}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "text-[9px] font-semibold uppercase tracking-wide",
                      active ? "text-slate-400" : "text-slate-300",
                    )}
                  >
                    {item.hint}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-2 flex items-center justify-between px-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Aaj ka Kaam
            </p>
            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-700">
              Live
            </span>
          </div>
          <Link
            href="/dashboard?action=wasooli"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12px] font-semibold text-ink-soft transition hover:bg-slate-50 hover:text-ink"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <NotebookTabs className="h-3.5 w-3.5" />
            </span>
            Wasooli / Kharcha
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300" />
          </Link>
          <Link
            href="/reports"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12px] font-semibold text-ink-soft transition hover:bg-slate-50 hover:text-ink"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-steel-700">
              <FileBarChart2 className="h-3.5 w-3.5" />
            </span>
            Day Closing
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300" />
          </Link>
        </div>
      </nav>

      <div className="p-4">
        <Link
          href="/scan"
          className="group relative flex min-h-[76px] overflow-hidden rounded-2xl bg-ink p-4 shadow-[0_16px_32px_-18px_rgba(15,23,42,0.9)] transition hover:bg-slate-800"
        >
          <span className="diagonal-lines absolute inset-0 opacity-60" />
          <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/15 blur-xl" />
          <div className="relative flex flex-1 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-scan">
              <Camera className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-display text-[12px] font-bold text-white">Scan a Parchi</span>
              <span className="mt-0.5 block text-[10px] font-medium text-slate-400">
                Camera se bill upload karein
              </span>
            </span>
          </div>
          <ChevronRight className="relative mt-3 h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-white" />
        </Link>

        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 font-display text-[10px] font-extrabold text-ink">
            {initials("Malik Sahib")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold text-ink">Malik Sahib</p>
            <p className="text-[9.5px] font-medium text-ink-mute">
              {dataMode === "supabase" ? "Owner · Supabase live" : "Owner · Local demo"}
            </p>
          </div>
          {dataMode === "supabase" ? (
            <Cloud className="h-4 w-4 text-emerald-600" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ lowStockCount }: { lowStockCount: number }) {
  const { state } = useStore();
  return (
    <header className="safe-top sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur-xl md:hidden">
      <div className="flex h-[62px] items-center gap-3 px-4">
        <BrandMark size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[13px] font-extrabold tracking-[-0.02em] text-ink">
            {state.business.business_name}
          </p>
          <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.09em] text-ink-mute">
            <span className="h-1 w-1 rounded-full bg-emerald-500" />
            {state.business.city} · SteelKhata AI
          </p>
        </div>
        <Link
          href="/stock?low=1"
          aria-label={`${lowStockCount} low stock alerts`}
          className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-ink-soft transition active:bg-slate-50"
        >
          <Bell className="h-[18px] w-[18px]" />
          {lowStockCount > 0 ? (
            <span className="absolute right-2 top-2 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full border border-white bg-amber-500" />
            </span>
          ) : null}
        </Link>
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-slate-50 font-display text-[10px] font-extrabold text-ink">
          MS
        </span>
      </div>
    </header>
  );
}

const mobileItems = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Stock", href: "/stock", icon: Boxes },
  { label: "Khatay", href: "/khatay", icon: NotebookTabs },
  { label: "Reports", href: "/reports", icon: FileBarChart2 },
];

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line/90 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-20px_rgba(15,23,42,0.35)] backdrop-blur-xl md:hidden"
    >
      <div className="relative mx-auto grid h-[70px] max-w-md grid-cols-5 items-center px-2">
        {mobileItems.slice(0, 2).map((item) => (
          <MobileNavItem key={item.href} item={item} pathname={pathname} />
        ))}
        <div className="relative flex h-full items-center justify-center">
          <Link
            href="/scan"
            aria-label="Scan a bill"
            className={cn(
              "absolute -top-[26px] flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full border-[5px] border-[#F8FAFC] bg-emerald-600 text-white shadow-scan transition active:scale-95",
              isActive(pathname, "/scan") && "bg-emerald-700 ring-2 ring-emerald-200",
            )}
          >
            <Camera className="h-[25px] w-[25px]" strokeWidth={2.1} />
          </Link>
          <span
            className={cn(
              "absolute bottom-2.5 mt-1 text-[9px] font-bold uppercase tracking-[0.05em]",
              isActive(pathname, "/scan") ? "text-emerald-700" : "text-ink-mute",
            )}
          >
            Scan
          </span>
        </div>
        {mobileItems.slice(2).map((item) => (
          <MobileNavItem key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

function MobileNavItem({
  item,
  pathname,
}: {
  item: { label: string; href: string; icon: typeof LayoutDashboard };
  pathname: string;
}) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl transition-colors",
        active ? "text-ink" : "text-slate-400",
      )}
    >
      <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.3 : 1.8} />
      <span className={cn("text-[9.5px] font-bold", active ? "text-ink" : "text-ink-mute")}>
        {item.label}
      </span>
      <span
        className={cn(
          "h-1 w-1 rounded-full bg-emerald-500 transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </Link>
  );
}
