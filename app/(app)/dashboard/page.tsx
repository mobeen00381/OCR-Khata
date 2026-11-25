"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  Camera,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  LockKeyhole,
  NotebookTabs,
  PackageOpen,
  ReceiptText,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  getDayMetrics,
  getWeeklySales,
  hydrateTransactions,
} from "@/lib/analytics";
import type { TransactionWithItems } from "@/lib/types";
import {
  cn,
  formatDate,
  formatNumber,
  formatPKR,
  formatQty,
  paymentModeLabel,
  percentage,
  toDateKey,
} from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BillDetailModal } from "@/components/shared/bill-detail-modal";
import { PartyAvatar } from "@/components/shared/party-avatar";
import { QuickEntryModal } from "@/components/shared/quick-entry-modal";

export default function DashboardPage() {
  const { state, isDayLocked } = useStore();
  const [selectedBill, setSelectedBill] = useState<TransactionWithItems | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickMode, setQuickMode] = useState<"wasooli" | "expense">("wasooli");

  const metrics = useMemo(() => getDayMetrics(state), [state]);
  const weekly = useMemo(() => getWeeklySales(state), [state]);
  const allTransactions = useMemo(() => hydrateTransactions(state), [state]);
  const recentBills = useMemo(() => allTransactions.slice(0, 5), [allTransactions]);
  const topUdhaar = useMemo(
    () =>
      state.parties
        .filter((party) => party.type === "customer" && party.current_balance > 0)
        .sort((a, b) => b.current_balance - a.current_balance)
        .slice(0, 3),
    [state.parties],
  );
  const todayLocked = isDayLocked(toDateKey());

  useEffect(() => {
    const action = new URLSearchParams(window.location.search).get("action");
    if (action === "wasooli" || action === "expense") {
      setQuickMode(action);
      setQuickOpen(true);
      window.history.replaceState({}, "", "/dashboard");
    }
  }, []);

  function openQuick(mode: "wasooli" | "expense") {
    if (todayLocked) return;
    setQuickMode(mode);
    setQuickOpen(true);
  }

  const maxWeek = Math.max(...weekly.map((day) => day.amount), 1);

  return (
    <>
      <PageHeader
        eyebrow="Live Dashboard · Roznamcha"
        title={
          <>
            Assalam-o-Alaikum,
            <br className="sm:hidden" /> <span className="text-steel-700">Malik Sahib.</span>
          </>
        }
        description="Aaj ka pura hisab — ek nazar mein. Parchi scan karein, stock update karein aur galla control mein rakhein."
        actions={
          <>
            <Button variant="outline" onClick={() => openQuick("expense")} disabled={todayLocked}>
              <Wallet className="h-4 w-4" />
              Add Kharcha
            </Button>
            <Link
              href={todayLocked ? "/reports" : "/scan?type=sale"}
              className={buttonStyles({ variant: "primary", size: "md" })}
            >
              <Camera className="h-4 w-4" />
              Scan Parchi
            </Link>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-3.5 py-2.5 shadow-card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-soft">
            <Clock3 className="h-3.5 w-3.5 text-slate-400" />
            {formatDate(new Date(), "long")}
          </span>
          <span className="hidden h-3 w-px bg-line sm:block" />
          <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-emerald-700">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            {todayLocked ? "Day locked" : "Shop open · entries live"}
          </span>
          <span className="hidden h-3 w-px bg-line sm:block" />
          <span className="text-[10.5px] font-medium text-ink-mute">
            {metrics.billsToday} parchiyan · {formatNumber(metrics.itemsSold, 0)} nali sold
          </span>
        </div>
        <Link
          href="/reports"
          className="group flex items-center gap-1 text-[10.5px] font-bold text-steel-700 transition hover:text-steel-600"
        >
          {todayLocked ? <ShieldCheck className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
          {todayLocked ? "View locked day" : "Close & lock day"}
          <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </Link>
      </div>

      <section aria-label="Today's key numbers" className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <SaleCard metrics={metrics} weekly={weekly} maxWeek={maxWeek} />
        <CashCard metrics={metrics} />
        <UdhaarCard metrics={metrics} />
        <LowStockCard count={metrics.lowStock.length} items={metrics.lowStock.slice(0, 3)} />
      </section>

      <section className="mt-5" aria-labelledby="quick-actions">
        <div className="mb-2.5 flex items-end justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-slate-400">One-tap workflow</p>
            <h2 id="quick-actions" className="mt-0.5 font-display text-[15px] font-bold tracking-[-0.02em] text-ink">
              Quick Actions
            </h2>
          </div>
          <button
            type="button"
            onClick={() => openQuick("wasooli")}
            disabled={todayLocked}
            className="text-[10.5px] font-bold text-steel-700 disabled:opacity-40"
          >
            + Roznamcha
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Link
            href={todayLocked ? "/reports" : "/scan?type=sale"}
            className="group relative overflow-hidden rounded-2xl bg-emerald-600 p-4 text-white shadow-[0_14px_30px_-18px_rgba(5,150,105,0.75)] transition hover:bg-emerald-700"
          >
            <span className="diagonal-lines absolute inset-0 opacity-60" />
            <span className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-white/10 blur-sm" />
            <span className="relative flex items-start justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
                <Camera className="h-[18px] w-[18px]" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-emerald-100/70 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
            <span className="relative mt-5 block font-display text-[13px] font-bold">Scan Sales Bill</span>
            <span className="relative mt-0.5 block text-[10px] font-medium text-emerald-100/80">
              Becha hua maal · Naqad / Udhaar
            </span>
          </Link>

          <QuickTile
            href={todayLocked ? "/reports" : "/scan?type=purchase"}
            icon={<PackageOpen className="h-[18px] w-[18px]" />}
            iconClass="bg-blue-50 text-steel-700"
            title="Scan Purchase"
            subtitle="Aaya hua maal · Stock in"
            hint="Steel Blue"
          />
          <QuickTile
            href={todayLocked ? "/reports" : "/scan?type=return"}
            icon={<RotateCcw className="h-[18px] w-[18px]" />}
            iconClass="bg-red-50 text-crimson"
            title="Scan Return"
            subtitle="Maal wapsi · Stock out"
            hint="Crimson"
          />
          <button
            type="button"
            onClick={() => openQuick("wasooli")}
            disabled={todayLocked}
            className="group relative overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-left transition hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex items-start justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-100 bg-white text-amber-700 shadow-sm">
                <NotebookTabs className="h-[18px] w-[18px]" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-amber-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
            <span className="mt-5 block font-display text-[13px] font-bold text-ink">Kharcha / Wasooli</span>
            <span className="mt-0.5 block text-[10px] font-medium text-ink-mute">Roznamcha · Cash in / out</span>
          </button>
        </div>
      </section>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink">Recent Parchis</h2>
                <Badge tone="steel">{recentBills.length} latest</Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-mute">Abhi scan hui bills · image ke saath</p>
            </div>
            <Link
              href="/reports"
              className="flex items-center gap-1 text-[10.5px] font-bold text-steel-700 transition hover:text-steel-600"
            >
              All entries
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {recentBills.length ? (
            <div className="divide-y divide-line">
              {recentBills.map((bill) => (
                <button
                  key={bill.id}
                  type="button"
                  onClick={() => setSelectedBill(bill)}
                  className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50/80 sm:px-5"
                >
                  <span className="relative h-[54px] w-[42px] shrink-0 overflow-hidden rounded-md border border-line bg-slate-100">
                    {bill.bill_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={bill.bill_image_url}
                        alt=""
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <ReceiptText className="absolute inset-0 m-auto h-4 w-4 text-slate-400" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[12.5px] font-bold text-ink">
                        {bill.party?.name || "Walk-in customer"}
                      </span>
                      <span className="hidden text-[9px] font-semibold text-slate-400 sm:inline">
                        #{bill.parchi_number || "—"}
                      </span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge
                        tone={
                          bill.type === "purchase"
                            ? "steel"
                            : bill.type === "sale_return"
                              ? "crimson"
                              : bill.routing_mode === "cash_sale"
                                ? "emerald"
                                : "amber"
                        }
                      >
                        {bill.type === "purchase"
                          ? "Purchase"
                          : bill.type === "sale_return"
                            ? bill.routing_mode === "customer_khata"
                              ? "Wapsi · Khata"
                              : "Wapsi · Cash"
                            : bill.routing_mode === "cash_sale"
                              ? "Cash"
                              : "Khata"}
                      </Badge>
                      <span className="text-[9.5px] font-medium text-ink-mute">
                        {formatDate(bill.created_at, "time")} · {bill.items.length} items
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className={cn(
                        "block font-display text-[13px] font-extrabold tabular text-ink",
                        bill.type === "sale_return" && "text-crimson",
                      )}
                    >
                      {bill.type === "sale_return" ? "−" : ""}
                      {formatPKR(bill.total_amount)}
                    </span>
                    <span className="mt-0.5 flex items-center justify-end gap-1 text-[9px] font-semibold uppercase tracking-[0.04em] text-slate-400">
                      {bill.type === "sale_return"
                        ? bill.routing_mode === "customer_khata"
                          ? "Khata adjusted"
                          : "Cash refund"
                        : paymentModeLabel(bill.payment_mode)}
                      <ChevronRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <ScanLine className="mx-auto h-7 w-7 text-slate-300" />
              <p className="mt-2 text-[12px] font-bold text-ink">No parchis yet</p>
              <p className="mt-0.5 text-[11px] text-ink-mute">Camera se pehli bill scan karein.</p>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Banknote className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-[12px] font-bold text-ink">Aaj ka Galla</p>
                  <p className="text-[9px] font-medium text-ink-mute">Cash reconciliation</p>
                </div>
              </div>
              <Badge tone="emerald" dot>
                Live
              </Badge>
            </div>
            <div className="bg-gradient-to-b from-emerald-50/50 to-white p-4">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-emerald-700">Cash in hand</p>
              <p className="mt-1 font-display text-[27px] font-extrabold tracking-[-0.04em] tabular text-ink">
                {formatPKR(metrics.cashInGalla)}
              </p>
              <div className="mt-4 space-y-2.5 text-[11px]">
                <GallaLine label="Cash sales" value={formatPKR(metrics.cashSales)} tone="plus" />
                <GallaLine label="Wasooli" value={formatPKR(metrics.cashWasooli)} tone="plus" />
                <GallaLine label="Shop kharcha" value={formatPKR(metrics.cashExpenses)} tone="minus" />
                <div className="border-t border-dashed border-line pt-2">
                  <GallaLine
                    label="Net cash movement"
                    value={formatPKR(metrics.cashSales + metrics.cashWasooli - metrics.cashExpenses)}
                    strong
                  />
                </div>
              </div>
            </div>
            <Link
              href="/reports"
              className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[10.5px] font-bold text-ink-soft transition hover:bg-slate-50"
            >
              Full galla report
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-[12px] font-bold text-ink">Stock Watch</p>
                  <p className="text-[9px] font-medium text-ink-mute">Low stock · reorder soon</p>
                </div>
              </div>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9.5px] font-extrabold text-amber-700">
                {metrics.lowStock.length}
              </span>
            </div>
            {metrics.lowStock.length ? (
              <div className="divide-y divide-line">
                {metrics.lowStock.slice(0, 3).map((product) => (
                  <div key={product.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-bold text-ink">
                        {product.attributes.size} · {product.attributes.grade}
                      </p>
                      <span className="shrink-0 text-[10px] font-bold tabular text-amber-700">
                        {formatQty(product.current_stock, product.unit)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{
                            width: `${Math.max(8, percentage(product.current_stock, product.low_stock_alert * 2))}%`,
                          }}
                        />
                      </div>
                      <span className="text-[8.5px] font-medium text-slate-400">
                        min {product.low_stock_alert}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-[11px] text-ink-mute">Sab stock theek hai.</div>
            )}
            <Link
              href="/stock?low=1"
              className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[10.5px] font-bold text-ink-soft transition hover:bg-slate-50"
            >
              Manage stock
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Card>

          {topUdhaar.length ? (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-steel-700">
                    <NotebookTabs className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-[12px] font-bold text-ink">Top Udhaar</p>
                    <p className="text-[9px] font-medium text-ink-mute">Wasooli priority</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-line">
                {topUdhaar.map((party) => (
                  <Link
                    key={party.id}
                    href={`/khatay/${party.id}`}
                    className="flex items-center gap-2.5 px-4 py-2.5 transition hover:bg-slate-50"
                  >
                    <PartyAvatar name={party.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-bold text-ink">{party.name}</p>
                      <p className="truncate text-[9px] text-ink-mute">{party.area_or_shop}</p>
                    </div>
                    <span className="shrink-0 text-[10.5px] font-extrabold tabular text-amber-700">
                      {formatPKR(party.current_balance)}
                    </span>
                  </Link>
                ))}
              </div>
              <Link
                href="/khatay"
                className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[10.5px] font-bold text-ink-soft transition hover:bg-slate-50"
              >
                All khatay
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Card>
          ) : null}
        </div>
      </div>

      <BillDetailModal
        open={Boolean(selectedBill)}
        onClose={() => setSelectedBill(null)}
        transaction={selectedBill}
      />
      <QuickEntryModal open={quickOpen} onClose={() => setQuickOpen(false)} defaultMode={quickMode} />
    </>
  );
}

function SaleCard({
  metrics,
  weekly,
  maxWeek,
}: {
  metrics: ReturnType<typeof getDayMetrics>;
  weekly: ReturnType<typeof getWeeklySales>;
  maxWeek: number;
}) {
  return (
    <Card className="relative flex h-full flex-col justify-between overflow-hidden p-4">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-steel-600" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-mute">Total Sale</p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">Aaj ki bechen</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-steel-700">
          <TrendingUp className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-[27px] font-extrabold leading-none tracking-[-0.04em] tabular text-ink">
        {formatPKR(metrics.totalSale)}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-1.5">
          <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.08em] text-emerald-700">
            <span className="h-1 w-1 rounded-full bg-emerald-500" />
            Cash
          </p>
          <p className="mt-0.5 text-[11px] font-extrabold tabular text-ink">{formatPKR(metrics.cashSales)}</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50/70 px-2.5 py-1.5">
          <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.08em] text-amber-700">
            <span className="h-1 w-1 rounded-full bg-amber-500" />
            Udhaar
          </p>
          <p className="mt-0.5 text-[11px] font-extrabold tabular text-ink">{formatPKR(metrics.udhaarSales)}</p>
        </div>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="flex h-9 items-end gap-[3px]">
          {weekly.map((day, index) => (
            <div key={day.key} className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-[6px] rounded-t-[2px]",
                  index === weekly.length - 1 ? "bg-steel-600" : "bg-blue-100",
                )}
                style={{ height: `${Math.max(3, (day.amount / maxWeek) * 30)}px` }}
                title={`${day.label}: ${formatPKR(day.amount)}`}
              />
            </div>
          ))}
        </div>
        <span className="flex items-center gap-1 text-[9.5px] font-semibold text-ink-mute">
          <CircleDollarSign className="h-3 w-3 text-slate-400" />
          {metrics.billsToday} bills · {formatNumber(metrics.itemsSold, 0)} nali
        </span>
      </div>
    </Card>
  );
}

function CashCard({ metrics }: { metrics: ReturnType<typeof getDayMetrics> }) {
  return (
    <Card className="relative flex h-full flex-col justify-between overflow-hidden p-4">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-emerald-500" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-mute">Asli Cash in Galla</p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">Hath mein naqad</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Banknote className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-[27px] font-extrabold leading-none tracking-[-0.04em] tabular text-emerald-700">
        {formatPKR(metrics.cashInGalla)}
      </p>
      <div className="mt-3 space-y-1.5 border-t border-dashed border-line pt-2.5 text-[10px]">
        <div className="flex justify-between gap-2">
          <span className="text-ink-mute">Cash sales</span>
          <span className="font-bold tabular text-ink-soft">{formatPKR(metrics.cashSales)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-ink-mute">Wasooli</span>
          <span className="font-bold tabular text-emerald-700">+{formatPKR(metrics.cashWasooli)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-ink-mute">Shop kharcha</span>
          <span className="font-bold tabular text-crimson">−{formatPKR(metrics.cashExpenses)}</span>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-1.5 rounded-md bg-emerald-50/70 px-2 py-1.5">
        <ShieldCheck className="h-3 w-3 text-emerald-700" />
        <span className="text-[8.5px] font-semibold leading-tight text-emerald-800">
          Cash sale + wasooli − kharcha
        </span>
      </div>
    </Card>
  );
}

function UdhaarCard({ metrics }: { metrics: ReturnType<typeof getDayMetrics> }) {
  const khataBills = Math.max(0, Math.round(metrics.udhaarGiven / Math.max(1, metrics.udhaarSales) * metrics.billsToday));
  return (
    <Card className="relative flex h-full flex-col justify-between overflow-hidden p-4">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-amber-500" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-mute">Today&apos;s Udhaar</p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">Naya udhaar diya</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <NotebookTabs className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-[27px] font-extrabold leading-none tracking-[-0.04em] tabular text-ink">
        {formatPKR(metrics.udhaarGiven)}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-800">
          <ArrowUpRight className="h-3 w-3" />
          {khataBills || metrics.billsToday} khata entries
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600">Udhaar</span>
      </div>
      <div className="mt-auto pt-3">
        <Link href="/khatay" className="flex items-center justify-between text-[10px] font-bold text-amber-700">
          Recover from khatay
          <ArrowRight className="h-3 w-3" />
        </Link>
        <p className="mt-2 text-[8.5px] font-medium leading-tight text-slate-400">
          Sales return {formatPKR(metrics.salesReturn)} separately adjusted.
        </p>
      </div>
    </Card>
  );
}

function LowStockCard({ count, items }: { count: number; items: ReturnType<typeof getDayMetrics>["lowStock"] }) {
  return (
    <Card className="group relative flex h-full flex-col justify-between overflow-hidden p-4">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-crimson" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-mute">Low Stock Alerts</p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">Reorder karein</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-crimson">
          <AlertTriangle className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="font-display text-[32px] font-extrabold leading-none tracking-[-0.04em] tabular text-crimson">
          {String(count).padStart(2, "0")}
        </p>
        <span className="mb-1 text-[10px] font-medium text-ink-mute">SKUs below minimum</span>
      </div>
      <div className="mt-3 space-y-1">
        {items.length ? (
          items.map((product) => (
            <Link
              key={product.id}
              href={`/stock?q=${encodeURIComponent(product.sku_code)}`}
              className="flex items-center justify-between gap-2 rounded-md px-1 py-1 transition hover:bg-slate-50"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Boxes className="h-2.5 w-2.5 shrink-0 text-slate-400" />
                <span className="truncate text-[9.5px] font-medium text-ink-soft">
                  {product.attributes.size} · {product.attributes.gauge} · {product.attributes.grade}
                </span>
              </span>
              <span className="shrink-0 text-[9px] font-bold tabular text-crimson">
                {formatNumber(product.current_stock)} left
              </span>
            </Link>
          ))
        ) : (
          <p className="rounded-md bg-emerald-50 px-2 py-1.5 text-[9.5px] font-medium text-emerald-700">
            Sab stock minimum se upar hai.
          </p>
        )}
      </div>
      <Link href="/stock?low=1" className="mt-auto flex items-center justify-between pt-2.5 text-[10px] font-bold text-ink-soft">
        Open inventory
        <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
      </Link>
    </Card>
  );
}

function QuickTile({
  href,
  icon,
  iconClass,
  title,
  subtitle,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  subtitle: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-line bg-white p-4 transition hover:border-slate-300 hover:shadow-card"
    >
      <span className="flex items-start justify-between">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", iconClass)}>{icon}</span>
        <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink-mute" />
      </span>
      <span className="mt-5 block font-display text-[13px] font-bold text-ink">{title}</span>
      <span className="mt-0.5 block text-[10px] font-medium text-ink-mute">{subtitle}</span>
      <span className="mt-3 inline-block rounded border border-line px-1.5 py-0.5 text-[7.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
        {hint}
      </span>
    </Link>
  );
}

function GallaLine({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "plus" | "minus";
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "text-[11px] font-bold text-ink" : "text-ink-mute"}>{label}</span>
      <span
        className={cn(
          "tabular font-bold",
          tone === "plus" && "text-emerald-700",
          tone === "minus" && "text-crimson",
          strong && "text-[12px] text-ink",
          !tone && !strong && "text-ink-soft",
        )}
      >
        {tone === "plus" ? "+" : tone === "minus" ? "−" : ""}
        {value}
      </span>
    </div>
  );
}
