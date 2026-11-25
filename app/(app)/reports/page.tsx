"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  CalendarRange,
  ChevronRight,
  Clock3,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  LockKeyhole,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  UnlockKeyhole,
  Wallet,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  buildReport,
  getRangePreset,
  type RangePreset,
} from "@/lib/analytics";
import type { ReportData, TransactionWithItems } from "@/lib/types";
import {
  cn,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPKR,
  paymentModeLabel,
} from "@/lib/utils";
import { downloadReportExcel, downloadReportPdf } from "@/lib/exports";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SegmentedTabs } from "@/components/ui/tabs";
import { BillDetailModal } from "@/components/shared/bill-detail-modal";
import { useToast } from "@/components/toast";

const OWNER_PIN = process.env.NEXT_PUBLIC_DEMO_OWNER_PIN || "1234";

export default function ReportsPage() {
  const { state, closeDay, reopenDay, isDayLocked } = useStore();
  const { toast } = useToast();
  const todayPreset = useMemo(() => getRangePreset("today"), []);
  const [preset, setPreset] = useState<RangePreset["id"]>("today");
  const [range, setRange] = useState(todayPreset);
  const [openingCash, setOpeningCash] = useState("25000");
  const [report, setReport] = useState<ReportData | null>(() =>
    buildReport(state, todayPreset, 25000),
  );
  const [customFrom, setCustomFrom] = useState(todayPreset.from);
  const [customTo, setCustomTo] = useState(todayPreset.to);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [selectedBill, setSelectedBill] = useState<TransactionWithItems | null>(null);

  const singleDay = range.from === range.to;
  const locked = singleDay ? isDayLocked(range.from) : false;
  const closure = state.dayClosures.find((entry) => entry.date === range.from);
  const customInvalid = preset === "custom" && customFrom > customTo;

  useEffect(() => {
    if (!singleDay) return;
    const existing = state.dayClosures.find((entry) => entry.date === range.from);
    if (existing) setOpeningCash(String(existing.opening_cash));
  }, [range.from, singleDay, state.dayClosures]);

  function choosePreset(id: RangePreset["id"]) {
    setPreset(id);
    setPin("");
    if (id === "custom") {
      const next = {
        id: "custom" as const,
        label: "Custom Range",
        from: customFrom,
        to: customTo,
        description: "Choose your own dates",
      };
      setRange(next);
    } else {
      setRange(getRangePreset(id));
    }
    setReport(null);
  }

  function updateCustom(from: string, to: string) {
    setCustomFrom(from);
    setCustomTo(to);
    if (from && to && from <= to) {
      setRange({
        id: "custom",
        label: "Custom Range",
        from,
        to,
        description: `${formatDate(from)} → ${formatDate(to)}`,
      });
    }
    setReport(null);
  }

  function generate() {
    if (!range.from || !range.to || range.from > range.to) {
      toast({ title: "Date range check karein", tone: "error" });
      return;
    }
    const next = buildReport(state, range, Number(openingCash) || 0);
    setReport(next);
    toast({
      title: "Report generate ho gayi",
      description: `${formatDate(range.from)} → ${formatDate(range.to)} · ${next.transactions.length} entries.`,
      tone: "success",
    });
  }

  async function exportPdf() {
    if (!report) return;
    setPdfLoading(true);
    try {
      await downloadReportPdf(report, state.business, state.products);
      toast({ title: "PDF download ho gayi", description: "Clean accounting sheet ready hai." });
    } catch {
      toast({ title: "PDF export fail hui", description: "Dobara try karein.", tone: "error" });
    } finally {
      setPdfLoading(false);
    }
  }

  async function exportExcel() {
    if (!report) return;
    setExcelLoading(true);
    try {
      await downloadReportExcel(report, state.business, state.products, state.parties);
      toast({
        title: "Excel download ho gayi",
        description: "Summary, transactions, stock aur khatay sheets ready hain.",
      });
    } catch {
      toast({ title: "Excel export fail hui", description: "Dobara try karein.", tone: "error" });
    } finally {
      setExcelLoading(false);
    }
  }

  function openLockModal() {
    if (!singleDay) {
      toast({
        title: "Single day select karein",
        description: "Closing lock sirf ek din par lagta hai.",
        tone: "info",
      });
      return;
    }
    setPin("");
    setPinError("");
    setPinOpen(true);
  }

  function submitPin() {
    if (pin !== OWNER_PIN) {
      setPinError("Ghalat PIN. Demo PIN 1234 hai.");
      return;
    }
    if (locked) {
      reopenDay(range.from);
      toast({
        title: "Day unlock ho gaya",
        description: `${formatDate(range.from)} ki entries ab editable hain.`,
        tone: "success",
      });
    } else {
      closeDay(range.from, Number(openingCash) || 0);
      toast({
        title: "Day close & lock ho gaya",
        description: `${formatDate(range.from)} ki entries staff edits se lock hain.`,
        tone: "success",
      });
    }
    setPinOpen(false);
  }

  const cashIn = report ? report.cashSales + report.cashWasooli : 0;
  const cashOut = report ? report.cashExpenses : 0;
  const flowMax = Math.max(cashIn, cashOut, 1);

  return (
    <>
      <PageHeader
        eyebrow="End of Day · Roznamcha Closing"
        title={
          <>
            Din ka hisab, <span className="text-steel-700">aap ke control mein.</span>
          </>
        }
        description="Report manually generate karein, clean PDF ya Excel export lein, aur din close karke entries lock karein."
        actions={
          <>
            <Button
              variant="outline"
              onClick={exportExcel}
              disabled={!report || excelLoading}
            >
              {excelLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Excel
            </Button>
            <Button onClick={exportPdf} disabled={!report || pdfLoading}>
              {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_190px_auto] lg:items-end lg:p-5">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-[9px] font-bold uppercase tracking-[0.13em] text-ink-mute">
                Report period
              </label>
              <span className="flex items-center gap-1 text-[8.5px] font-semibold text-slate-400">
                <ShieldCheck className="h-3 w-3" />
                Manual only · no cron
              </span>
            </div>
            <SegmentedTabs
              value={preset}
              onChange={choosePreset}
              options={[
                { value: "today", label: "Today" },
                { value: "yesterday", label: "Yesterday" },
                { value: "week", label: "This Week" },
                { value: "custom", label: "Custom" },
              ]}
            />
            {preset === "custom" ? (
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <Field label="From">
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(event) => updateCustom(event.target.value, customTo)}
                    className="h-10 min-h-[40px] text-[11px]"
                  />
                </Field>
                <Field label="To">
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(event) => updateCustom(customFrom, event.target.value)}
                    className="h-10 min-h-[40px] text-[11px]"
                  />
                </Field>
              </div>
            ) : (
              <p className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-ink-mute">
                <CalendarRange className="h-3.5 w-3.5 text-slate-400" />
                {range.from === range.to ? formatDate(range.from, "long") : `${formatDate(range.from)} → ${formatDate(range.to)}`}
              </p>
            )}
            {customInvalid ? (
              <p className="mt-1 text-[9.5px] font-semibold text-crimson">
                “From” date “To” date se pehle honi chahiye.
              </p>
            ) : null}
          </div>

          <Field label="Opening cash in galla" hint="PKR">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                Rs.
              </span>
              <Input
                type="number"
                min={0}
                value={openingCash}
                onChange={(event) => setOpeningCash(event.target.value)}
                className="h-11 pl-9 font-bold tabular"
              />
            </div>
          </Field>

          <Button onClick={generate} size="lg" disabled={customInvalid} className="w-full lg:w-auto">
            <RefreshCw className="h-4 w-4" />
            Generate Report
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-slate-50/60 px-4 py-2 text-[8.5px] font-medium text-slate-400 lg:px-5">
          <span className="flex items-center gap-1">
            <BadgeCheck className="h-3 w-3 text-emerald-600" />
            PDF & Excel include full ledger detail
          </span>
          <span className="h-2.5 w-px bg-line" />
          <span>Report snapshot uses the opening cash entered above.</span>
        </div>
      </Card>

      {report ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Report ready
              </span>
              <span className="text-[9.5px] text-slate-400">
                {formatDateTime(report.generatedAt)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge tone={locked ? "emerald" : "amber"} dot>
                {locked ? "Day locked" : "Day open"}
              </Badge>
              <Badge tone="neutral">{report.transactions.length} entries</Badge>
            </div>
          </div>

          <section className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            <ReportStat
              icon={<TrendingUp className="h-4 w-4" />}
              label="Total sales"
              value={formatPKR(report.totalSales)}
              caption={`Cash ${formatPKR(report.cashSales)} · Udhaar ${formatPKR(report.udhaarSales)}`}
              tone="steel"
            />
            <ReportStat
              icon={<PackageOpen className="h-4 w-4" />}
              label="Purchases"
              value={formatPKR(report.totalPurchases)}
              caption="Aaya hua maal"
              tone="emerald"
            />
            <ReportStat
              icon={<RotateCcw className="h-4 w-4" />}
              label="Returns / Wapsi"
              value={formatPKR(report.totalReturns)}
              caption="Customer returns"
              tone="crimson"
            />
            <ReportStat
              icon={<Wallet className="h-4 w-4" />}
              label="Net cash in galla"
              value={formatPKR(report.netCash)}
              caption={`Opening ${formatPKR(report.openingCash)}`}
              tone="ink"
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5">
                  <div>
                    <h2 className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink">
                      Galla Reconciliation
                    </h2>
                    <p className="mt-0.5 text-[10px] text-ink-mute">
                      Opening + Cash sales + Wasooli − Expenses
                    </p>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <Banknote className="h-4 w-4" />
                  </span>
                </div>
                <div className="grid gap-0 md:grid-cols-[1.1fr_.9fr]">
                  <div className="p-4 sm:p-5">
                    <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] text-ink-mute">
                      Closing cash in hand
                    </p>
                    <p className="mt-1 font-display text-[32px] font-extrabold leading-none tracking-[-0.045em] tabular text-emerald-700">
                      {formatPKR(report.netCash)}
                    </p>
                    <div className="mt-5 space-y-2.5">
                      <FlowLine label="Opening cash" value={report.openingCash} />
                      <FlowLine label="Cash sales" value={report.cashSales} plus />
                      <FlowLine label="Cash wasooli" value={report.cashWasooli} plus />
                      <FlowLine label="Cash kharcha" value={report.cashExpenses} minus />
                      <div className="border-t border-dashed border-line pt-2.5">
                        <FlowLine label="Closing balance" value={report.netCash} strong />
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-line bg-slate-50/60 p-4 md:border-l md:border-t-0">
                    <p className="text-[8.5px] font-bold uppercase tracking-[0.1em] text-ink-mute">
                      Cash movement
                    </p>
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-[9.5px]">
                          <span className="font-semibold text-emerald-700">Cash in</span>
                          <span className="font-bold tabular text-ink">{formatPKR(cashIn)}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.max(6, (cashIn / flowMax) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-[9.5px]">
                          <span className="font-semibold text-crimson">Cash out</span>
                          <span className="font-bold tabular text-ink">{formatPKR(cashOut)}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white">
                          <div
                            className="h-full rounded-full bg-crimson"
                            style={{ width: `${Math.max(4, (cashOut / flowMax) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg border border-line bg-white px-3 py-2.5">
                      <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-slate-400">
                        Bank receipts
                      </p>
                      <p className="mt-0.5 text-[11px] font-bold tabular text-ink">
                        Wasooli {formatPKR(report.totalWasooli - report.cashWasooli)}
                      </p>
                      <p className="mt-0.5 text-[8.5px] leading-relaxed text-ink-mute">
                        Bank entries cash in hand mein include nahi hain.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5">
                  <div>
                    <h2 className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink">
                      Top Selling Pipe Sizes
                    </h2>
                    <p className="mt-0.5 text-[10px] text-ink-mute">By sales value in selected period</p>
                  </div>
                  <Badge tone="steel">{report.topSizes.length} sizes</Badge>
                </div>
                {report.topSizes.length ? (
                  <div className="space-y-3 p-4 sm:p-5">
                    {report.topSizes.map((row, index) => {
                      const max = report.topSizes[0]?.amount || 1;
                      return (
                        <div key={row.size} className="flex items-center gap-3">
                          <span className="w-5 text-[9px] font-bold tabular text-slate-400">
                            0{index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10.5px] font-bold text-ink">{row.size}</span>
                              <span className="text-[9.5px] font-semibold tabular text-ink-soft">
                                {formatNumber(row.qty, 2)} nali · {formatPKR(row.amount)}
                              </span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-steel-600 to-blue-400"
                                style={{ width: `${Math.max(4, (row.amount / max) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-5 py-8 text-center text-[11px] text-ink-mute">
                    Is period mein koi sale nahi hui.
                  </div>
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5">
                  <div>
                    <h2 className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink">
                      Period Transactions
                    </h2>
                    <p className="mt-0.5 text-[10px] text-ink-mute">
                      Tap any row to view the original scanned parchi.
                    </p>
                  </div>
                  <Badge tone="neutral">{report.transactions.length}</Badge>
                </div>
                {report.transactions.length ? (
                  <div className="divide-y divide-line">
                    {report.transactions.slice(0, 10).map((transaction) => (
                      <button
                        key={transaction.id}
                        type="button"
                        onClick={() => setSelectedBill(transaction)}
                        className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50/80 sm:px-5"
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                            transaction.type === "purchase"
                              ? "border-blue-100 bg-blue-50 text-steel-700"
                              : transaction.type === "sale_return"
                                ? "border-red-100 bg-red-50 text-crimson"
                                : "border-emerald-100 bg-emerald-50 text-emerald-700",
                          )}
                        >
                          {transaction.type === "purchase" ? (
                            <PackageOpen className="h-3.5 w-3.5" />
                          ) : transaction.type === "sale_return" ? (
                            <RotateCcw className="h-3.5 w-3.5" />
                          ) : (
                            <FileText className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[11px] font-bold text-ink">
                              {transaction.party?.name || "Walk-in"}
                            </p>
                            <Badge
                              tone={
                                transaction.type === "purchase"
                                  ? "steel"
                                  : transaction.type === "sale_return"
                                    ? "crimson"
                                    : transaction.routing_mode === "cash_sale"
                                      ? "emerald"
                                      : "amber"
                              }
                            >
                              {transaction.type === "purchase"
                                ? "Purchase"
                                : transaction.type === "sale_return"
                                  ? "Wapsi"
                                  : paymentModeLabel(transaction.payment_mode)}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-[9px] text-ink-mute">
                            #{transaction.parchi_number || "—"} ·{" "}
                            {formatDate(transaction.created_at, "time")} · {transaction.items.length} items
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-extrabold tabular text-ink">
                            {formatPKR(transaction.total_amount)}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-8 text-center text-[11px] text-ink-mute">
                    Is period mein koi transaction nahi.
                  </div>
                )}
                {report.transactions.length > 10 ? (
                  <div className="border-t border-line bg-slate-50/50 px-4 py-2 text-center text-[9px] font-medium text-slate-400">
                    Showing 10 of {report.transactions.length} · full list PDF/Excel mein hai
                  </div>
                ) : null}
              </Card>
            </div>

            <div className="space-y-4">
              <Card
                className={cn(
                  "relative overflow-hidden p-4",
                  locked ? "border-emerald-200" : "border-amber-200",
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-ink-mute">
                      Day Closing
                    </p>
                    <p className="mt-1 font-display text-[15px] font-extrabold text-ink">
                      {locked ? "Day is locked" : singleDay ? "Aaj ka din open" : "Select a single day"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl",
                      locked ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {locked ? <LockKeyhole className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                  </span>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-mute">
                  {locked
                    ? `${formatDate(range.from)} ki entries staff edits se locked hain. Owner PIN se unlock ho sakti hain.`
                    : singleDay
                      ? "Close & Lock karne par is din ki entries accidental staff edits se mehfooz ho jayengi."
                      : "Closing lock lagane ke liye date range mein ek hi din select karein."}
                </p>
                {closure ? (
                  <div className="mt-3 rounded-lg border border-line bg-slate-50 px-3 py-2 text-[9px] text-ink-mute">
                    Locked {formatDateTime(closure.locked_at)} · opening{" "}
                    {formatPKR(closure.opening_cash)}
                  </div>
                ) : null}
                <Button
                  variant={locked ? "outline" : "amber"}
                  className="mt-3 w-full"
                  onClick={openLockModal}
                  disabled={!singleDay}
                >
                  {locked ? <UnlockKeyhole className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
                  {locked ? "Unlock Day" : "Close & Lock Day"}
                </Button>
                <p className="mt-2 flex items-center justify-center gap-1 text-center text-[8px] font-medium text-slate-400">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  Owner PIN required · demo PIN 1234
                </p>
              </Card>

              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <p className="text-[11.5px] font-bold text-ink">Low Stock</p>
                      <p className="text-[8.5px] text-ink-mute">Reorder alerts</p>
                    </div>
                  </div>
                  <Badge tone="amber">{report.lowStock.length}</Badge>
                </div>
                {report.lowStock.length ? (
                  <div className="divide-y divide-line">
                    {report.lowStock.map((product) => (
                      <div key={product.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[10px] font-bold text-ink">
                            {product.attributes.size} · {product.attributes.gauge} · {product.attributes.grade}
                          </p>
                          <p className="text-[8px] text-slate-400">{product.sku_code}</p>
                        </div>
                        <span className="shrink-0 text-[9.5px] font-bold tabular text-amber-700">
                          {formatNumber(product.current_stock, 2)} left
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-5 text-center text-[10px] text-ink-mute">
                    Sab stock minimum se upar hai.
                  </div>
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-crimson">
                      <TrendingUp className="h-3.5 w-3.5 rotate-180" />
                    </span>
                    <div>
                      <p className="text-[11.5px] font-bold text-ink">Dead Stock</p>
                      <p className="text-[8.5px] text-ink-mute">30+ days unsold</p>
                    </div>
                  </div>
                  <Badge tone="crimson">{report.deadStock.length}</Badge>
                </div>
                {report.deadStock.length ? (
                  <div className="divide-y divide-line">
                    {report.deadStock.map((product) => (
                      <div key={product.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[10px] font-bold text-ink">
                            {product.attributes.size} · {product.attributes.grade}
                          </p>
                          <p className="text-[8px] text-slate-400">
                            {formatNumber(product.current_stock, 2)} in stock
                          </p>
                        </div>
                        <span className="shrink-0 text-[9px] font-semibold text-crimson">
                          {product.last_sold_at
                            ? `${Math.floor((Date.now() - +new Date(product.last_sold_at)) / 86400000)}d`
                            : "Never"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-5 text-center text-[10px] text-ink-mute">
                    Koi dead stock nahi. Inventory healthy hai.
                  </div>
                )}
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-steel-700">
                    <FileDown className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-bold text-ink">Manual exports</p>
                    <p className="text-[8.5px] text-ink-mute">1-click, no automation</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={exportPdf} disabled={pdfLoading}>
                    {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportExcel} disabled={excelLoading}>
                    {excelLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                    )}
                    Excel
                  </Button>
                </div>
                <p className="mt-2 text-[8px] leading-relaxed text-slate-400">
                  Exports include the selected period only. Phase 1 mein koi background job ya
                  WhatsApp Cloud API nahi hai.
                </p>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <Card className="mt-4 border-dashed">
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
              <FileText className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-display text-lg font-extrabold tracking-[-0.025em] text-ink">
              Report abhi generate nahi hui
            </h2>
            <p className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-ink-mute">
              {formatDate(range.from)} → {formatDate(range.to)} ke liye “Generate Report” dabayein.
              Report manual snapshot hai — jab chahein refresh karein.
            </p>
            <Button className="mt-4" onClick={generate}>
              <RefreshCw className="h-4 w-4" />
              Generate Report
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title={locked ? "Unlock Day" : "Close & Lock Day"}
        description={
          locked
            ? "Owner PIN daalein. Unlock ke baad staff entries edit kar sakega."
            : "Owner PIN daalein. Is din ki tamam entries accidental edits se lock ho jayengi."
        }
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPinOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              variant={locked ? "outline" : "amber"}
              onClick={submitPin}
            >
              {locked ? <UnlockKeyhole className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
              {locked ? "Unlock" : "Lock day"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Owner PIN" hint="4 digits">
            <Input
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(event) => {
                setPin(event.target.value);
                setPinError("");
              }}
              placeholder="••••"
              className="h-12 text-center text-[22px] font-bold tracking-[0.35em]"
              autoFocus
            />
          </Field>
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[9.5px] leading-relaxed text-ink-mute">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
            Demo PIN <span className="font-bold text-ink">1234</span> · production mein ye owner
            profile se aana chahiye.
          </div>
          {pinError ? (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-semibold text-crimson">
              {pinError}
            </p>
          ) : null}
          <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
            <span className="text-[9px] font-semibold text-ink-mute">Date</span>
            <span className="text-[10px] font-bold text-ink">{formatDate(range.from)}</span>
          </div>
        </div>
      </Modal>

      <BillDetailModal
        open={Boolean(selectedBill)}
        onClose={() => setSelectedBill(null)}
        transaction={selectedBill}
      />
    </>
  );
}

function ReportStat({
  icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  caption: string;
  tone: "steel" | "emerald" | "crimson" | "ink";
}) {
  const iconStyles = {
    steel: "bg-blue-50 text-steel-700",
    emerald: "bg-emerald-50 text-emerald-700",
    crimson: "bg-red-50 text-crimson",
    ink: "bg-ink text-emerald-300",
  };
  return (
    <Card className="relative overflow-hidden p-3.5">
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-[3px]",
          tone === "steel"
            ? "bg-steel-600"
            : tone === "emerald"
              ? "bg-emerald-500"
              : tone === "crimson"
                ? "bg-crimson"
                : "bg-ink",
        )}
      />
      <div className="flex items-start justify-between">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", iconStyles[tone])}>
          {icon}
        </span>
      </div>
      <p className="mt-3 font-display text-[21px] font-extrabold leading-none tracking-[-0.035em] tabular text-ink">
        {value}
      </p>
      <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-ink-mute">{label}</p>
      <p className="mt-0.5 truncate text-[8px] font-medium text-slate-400">{caption}</p>
    </Card>
  );
}

function FlowLine({
  label,
  value,
  plus,
  minus,
  strong,
}: {
  label: string;
  value: number;
  plus?: boolean;
  minus?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-[10.5px]", strong ? "font-bold text-ink" : "text-ink-mute")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular",
          strong
            ? "text-[12px] font-extrabold text-emerald-700"
            : plus
              ? "text-[11px] font-bold text-emerald-700"
              : minus
                ? "text-[11px] font-bold text-crimson"
                : "text-[11px] font-semibold text-ink-soft",
        )}
      >
        {plus ? "+" : minus ? "−" : ""}
        {formatPKR(value)}
      </span>
    </div>
  );
}
