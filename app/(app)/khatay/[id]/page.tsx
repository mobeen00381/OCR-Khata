"use client";

import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  FileImage,
  HandCoins,
  Loader2,
  MapPin,
  Phone,
  ReceiptText,
  RotateCcw,
  Share2,
  ShieldCheck,
  Truck,
  UserRound,
  Wallet,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { getLedger, partyStatementTotals } from "@/lib/analytics";
import type { LedgerRow, Party, TransactionWithItems } from "@/lib/types";
import type { Business } from "@/lib/types";
import {
  cn,
  downloadBlob,
  formatDate,
  formatPKR,
  roundMoney,
  toDateKey,
} from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PartyAvatar } from "@/components/shared/party-avatar";
import { BillDetailModal } from "@/components/shared/bill-detail-modal";
import { useToast } from "@/components/toast";

export default function PartyDetailPage() {
  const params = useParams<{ id: string }>();
  const partyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { state } = useStore();
  const { toast } = useToast();
  const [selectedBill, setSelectedBill] = useState<TransactionWithItems | null>(null);
  const [wasooliOpen, setWasooliOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const slipRef = useRef<HTMLDivElement>(null);

  const { party, rows } = useMemo(() => getLedger(state, partyId), [state, partyId]);
  const totals = useMemo(() => partyStatementTotals(state, partyId), [state, partyId]);

  if (!party) {
    return (
      <>
        <PageHeader
          backHref="/khatay"
          eyebrow="Khatay"
          title="Khata nahi mila"
          description="Ho sakta hai ye party delete ho gayi ho ya link purana ho."
        />
        <Card>
          <EmptyState
            icon={<BookOpen className="h-5 w-5" />}
            title="Party record missing"
            description="Khatay list par wapas jaakar dobara select karein."
            action={
              <Link href="/khatay" className={buttonStyles({ variant: "primary" })}>
                Back to Khatay
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const isSupplier = party.type === "supplier";
  const balance = party.current_balance;
  const isPayable = isSupplier && balance < 0;
  const totalBilled = isSupplier
    ? state.transactions
        .filter(
          (transaction) =>
            transaction.party_id === party.id && transaction.type === "purchase",
        )
        .reduce((sum, transaction) => sum + transaction.total_amount, 0)
    : totals.totalBilled;
  const totalSettled = isSupplier
    ? state.payments
        .filter(
          (payment) =>
            payment.party_id === party.id && payment.entry_type === "supplier_payment",
        )
        .reduce((sum, payment) => sum + payment.amount, 0)
    : totals.totalRecovered;

  async function shareSlip() {
    if (!slipRef.current || sharing) return;
    setSharing(true);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const { toJpeg } = await import("html-to-image");
      const dataUrl = await toJpeg(slipRef.current, {
        quality: 0.96,
        pixelRatio: 2,
        backgroundColor: "#0F172A",
        cacheBust: true,
      });
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const fileName = `${(party?.name || "party").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-balance-slip.jpg`;
      const file = new File([blob], fileName, { type: "image/jpeg" });
      const canNativeShare =
        window.matchMedia("(pointer: coarse)").matches &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      if (canNativeShare) {
        await navigator.share({
          files: [file],
          title: `${party?.name || "Party"} — Balance Slip`,
          text: `${state.business.business_name} · ${formatPKR(Math.abs(balance))} outstanding`,
        });
        toast({ title: "Balance slip share ho gayi", tone: "success" });
      } else {
        downloadBlob(blob, fileName);
        toast({
          title: "Balance slip download ho gayi",
          description: "JPG image save ho gayi hai — WhatsApp par bhej dein.",
          tone: "success",
        });
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        toast({
          title: "Slip generate nahi hui",
          description: "Dobara try karein. Browser image rendering block kar raha ho sakta hai.",
          tone: "error",
        });
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <PageHeader
        backHref="/khatay"
        eyebrow={isSupplier ? "Supplier Khata · Payable" : "Customer Khata · Udhaar"}
        title={party.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 text-slate-400" />
              {party.area_or_shop}
            </span>
            {party.phone !== "—" ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3 text-slate-400" />
                {party.phone}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3 text-slate-400" />
              Since {formatDate(party.created_at)}
            </span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={shareSlip} disabled={sharing}>
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              {sharing ? "Generating…" : "Share Slip (JPG)"}
            </Button>
            <Button onClick={() => setWasooliOpen(true)}>
              {isSupplier ? <Truck className="h-4 w-4" /> : <HandCoins className="h-4 w-4" />}
              {isSupplier ? "Pay Supplier" : "Record Wasooli"}
            </Button>
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
        <Card className="relative overflow-hidden p-4 sm:p-5">
          <span
            className={cn(
              "absolute inset-x-0 top-0 h-[3px]",
              isPayable ? "bg-steel-600" : balance > 0 ? "bg-amber-500" : "bg-emerald-500",
            )}
          />
          <div className="flex items-start gap-3">
            <PartyAvatar name={party.name} size="xl" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-mute">
                    {isSupplier ? "Payable balance" : balance < 0 ? "Advance / Jama" : "Udhaar balance"}
                  </p>
                  <p
                    className={cn(
                      "mt-1 font-display text-[30px] font-extrabold leading-none tracking-[-0.045em] tabular sm:text-[34px]",
                      isPayable
                        ? "text-steel-700"
                        : balance > 0
                          ? "text-amber-700"
                          : "text-emerald-700",
                    )}
                  >
                    {formatPKR(Math.abs(balance))}
                  </p>
                </div>
                <Badge tone={isPayable ? "steel" : balance > 0 ? "amber" : "emerald"} dot>
                  {isSupplier ? "Supplier" : balance > 0 ? "Udhaar" : balance < 0 ? "Advance" : "Clear"}
                </Badge>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-ink-mute">
                {isPayable
                  ? "Supplier ko yeh raqam deni hai. Payment record karne par balance adjust hoga."
                  : balance > 0
                    ? "Customer se yeh udhaar wasool karna hai. Wasooli entry ledger mein jama hogi."
                    : balance < 0
                      ? "Customer ke paas advance jama hai — agla bill isse adjust hoga."
                      : "Hisab clear hai. Koi baqi raqam nahi."}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-dashed border-line pt-3">
            <MiniMetric
              label={isSupplier ? "Purchased" : "Lifetime billed"}
              value={formatPKR(totalBilled)}
            />
            <MiniMetric
              label={isSupplier ? "Payments" : "Recovered"}
              value={formatPKR(totalSettled)}
              tone="emerald"
            />
            <MiniMetric
              label="Returns / Wapsi"
              value={formatPKR(totals.totalReturned)}
              tone="crimson"
            />
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-ink-mute">
                Account actions
              </p>
              <p className="mt-0.5 font-display text-[13px] font-bold text-ink">Ledger shortcuts</p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-ink-soft">
              <UserRound className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            <button
              type="button"
              onClick={() => setWasooliOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-left transition hover:border-emerald-200 hover:bg-emerald-50/50"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                <ArrowDownLeft className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">
                <span className="block text-[10.5px] font-bold text-ink">
                  {isSupplier ? "Record supplier payment" : "Record wasooli"}
                </span>
                <span className="block text-[8.5px] text-ink-mute">Cash ya bank entry</span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            </button>
            <button
              type="button"
              onClick={shareSlip}
              disabled={sharing}
              className="flex w-full items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-left transition hover:border-amber-200 hover:bg-amber-50/50"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                <FileImage className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">
                <span className="block text-[10.5px] font-bold text-ink">Share balance slip</span>
                <span className="block text-[8.5px] text-ink-mute">Branded JPG · WhatsApp ready</span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            </button>
            {party.phone !== "—" ? (
              <a
                href={`tel:${party.phone.replace(/\s/g, "")}`}
                className="flex w-full items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-left transition hover:border-blue-200 hover:bg-blue-50/50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-steel-700">
                  <Phone className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1">
                  <span className="block text-[10.5px] font-bold text-ink">Call party</span>
                  <span className="block text-[8.5px] text-ink-mute">{party.phone}</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              </a>
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3.5 sm:px-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink">
                Khata Statement
              </h2>
              <Badge tone="neutral">{rows.length} entries</Badge>
            </div>
            <p className="mt-0.5 text-[10.5px] text-ink-mute">
              Bills, returns aur wasooli — latest first. Running balance ke saath.
            </p>
          </div>
          <span className="flex items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 text-[8.5px] font-bold uppercase tracking-[0.06em] text-emerald-700">
            <ShieldCheck className="h-3 w-3" />
            Ledger secured
          </span>
        </div>

        {rows.length ? (
          <div className="relative">
            {rows.map((row) => (
              <LedgerLine
                key={row.id}
                row={row}
                isSupplier={isSupplier}
                onOpen={() => {
                  if (row.transaction) setSelectedBill(row.transaction);
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<BookOpen className="h-5 w-5" />}
            title="Khata abhi khali hai"
            description="Pehli sale ya wasooli record karne par entries yahan nazar aayengi."
            action={
              <Button onClick={() => setWasooliOpen(true)} size="sm">
                <HandCoins className="h-3.5 w-3.5" />
                {isSupplier ? "Pay supplier" : "Record wasooli"}
              </Button>
            }
          />
        )}
      </Card>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-white px-3.5 py-2.5">
        <ReceiptText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <p className="text-[9.5px] leading-relaxed text-ink-mute">
          Kisi bhi bill par tap karein to original scanned parchi photo aur itemized details
          khulengi. Ye record edit nahi hota — audit ke liye safe rehta hai.
        </p>
      </div>

      <BillDetailModal
        open={Boolean(selectedBill)}
        onClose={() => setSelectedBill(null)}
        transaction={selectedBill}
      />
      <PaymentModal
        open={wasooliOpen}
        onClose={() => setWasooliOpen(false)}
        party={party}
      />

      <div className="pointer-events-none fixed left-[-10000px] top-0 z-[-1]">
        <BalanceSlip ref={slipRef} party={party} business={state.business} />
      </div>
    </>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "crimson";
}) {
  return (
    <div>
      <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-[11.5px] font-extrabold tabular",
          tone === "emerald" ? "text-emerald-700" : tone === "crimson" ? "text-crimson" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function LedgerLine({
  row,
  isSupplier,
  onOpen,
}: {
  row: LedgerRow;
  isSupplier: boolean;
  onOpen: () => void;
}) {
  const date = new Date(row.date);
  const isReturn = row.kind === "return";
  const isWasooli = row.kind === "wasooli";
  const isPurchase = row.kind === "purchase";
  const isPayment = row.kind === "payment";
  const clickable = Boolean(row.transaction);
  const running = row.runningBalance;
  const runningLabel = isSupplier
    ? running < 0
      ? "Payable"
      : running > 0
        ? "Advance"
        : "Clear"
    : running > 0
      ? "Udhaar"
      : running < 0
        ? "Advance"
        : "Clear";

  const amount = row.transaction?.total_amount || row.payment?.amount || 0;
  const sign = isWasooli || isReturn ? "−" : isPurchase ? "−" : isPayment ? "+" : "+";
  const amountTone = isWasooli
    ? "text-emerald-700"
    : isReturn
      ? "text-crimson"
      : isPayment
        ? "text-steel-700"
        : isPurchase
          ? "text-steel-700"
          : "text-ink";

  const icon = isWasooli ? (
    <ArrowDownLeft className="h-3.5 w-3.5" />
  ) : isReturn ? (
    <RotateCcw className="h-3.5 w-3.5" />
  ) : isPayment ? (
    <ArrowUpRight className="h-3.5 w-3.5" />
  ) : isPurchase ? (
    <Truck className="h-3.5 w-3.5" />
  ) : (
    <ReceiptText className="h-3.5 w-3.5" />
  );
  const iconTone = isWasooli
    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
    : isReturn
      ? "border-red-100 bg-red-50 text-crimson"
      : isPayment || isPurchase
        ? "border-blue-100 bg-blue-50 text-steel-700"
        : "border-amber-100 bg-amber-50 text-amber-700";

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!clickable}
      className={cn(
        "group flex w-full items-start gap-3 border-b border-line px-4 py-3.5 text-left transition last:border-b-0 sm:px-5",
        clickable ? "hover:bg-slate-50/80" : "cursor-default",
      )}
    >
      <div className="hidden w-10 shrink-0 pt-0.5 text-center sm:block">
        <p className="font-display text-[18px] font-extrabold leading-none tabular text-ink">
          {date.getDate()}
        </p>
        <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-slate-400">
          {new Intl.DateTimeFormat("en-PK", { month: "short" }).format(date)}
        </p>
      </div>
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
          iconTone,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11.5px] font-bold text-ink">{row.title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[9px] font-medium text-ink-mute sm:hidden">
                {formatDate(row.date)} ·
              </span>
              <span className="truncate text-[9px] font-medium text-ink-mute">{row.subtitle}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className="text-right">
              <p className={cn("text-[11.5px] font-extrabold tabular", amountTone)}>
                {sign}
                {formatPKR(amount)}
              </p>
              <p className="mt-0.5 text-[8px] font-medium text-slate-400">
                Bal {formatPKR(Math.abs(running))} · {runningLabel}
              </p>
            </div>
            {clickable ? (
              <ChevronRight className="mt-1 h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-ink-mute" />
            ) : (
              <span className="w-3.5" />
            )}
          </div>
        </div>
        {row.transaction ? (
          <div className="mt-1 flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.04em] text-slate-400">
            <span>#{row.transaction.parchi_number || "No parchi"}</span>
            <span className="h-2 w-px bg-line" />
            <span>{row.transaction.items.length} items</span>
            <span className="h-2 w-px bg-line" />
            <span>{row.transaction.payment_mode === "udhaar" ? "Khata" : "Cash"}</span>
            <span className="ml-auto hidden items-center gap-1 text-emerald-600 sm:flex">
              <FileImage className="h-2.5 w-2.5" />
              Parchi
            </span>
          </div>
        ) : null}
      </div>
    </button>
  );
}

function PaymentModal({
  open,
  onClose,
  party,
}: {
  open: boolean;
  onClose: () => void;
  party: Party;
}) {
  const { recordPayment, isDayLocked } = useStore();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"cash" | "bank">("cash");
  const [note, setNote] = useState("");
  const isSupplier = party.type === "supplier";
  const locked = isDayLocked(toDateKey());
  const numeric = Number(amount) || 0;
  const outstanding = Math.abs(party.current_balance);

  useEffect(() => {
    if (!open) return;
    setAmount(String(Math.max(0, outstanding)));
    setMode("cash");
    setNote("");
  }, [open, outstanding]);

  function submit() {
    if (locked) {
      toast({
        title: "Day locked hai",
        description: "Reports page se owner PIN ke saath unlock karein.",
        tone: "error",
      });
      return;
    }
    if (numeric <= 0) {
      toast({ title: "Sahi amount likhein", tone: "error" });
      return;
    }
    recordPayment({
      party_id: party.id,
      entry_type: isSupplier ? "supplier_payment" : "customer_wasooli",
      description:
        note.trim() ||
        `${isSupplier ? "Supplier payment" : "Wasooli"} — ${party.name}`,
      amount: roundMoney(numeric),
      payment_mode: mode,
    });
    toast({
      title: isSupplier ? "Supplier payment record ho gayi" : "Wasooli record ho gayi",
      description: `${formatPKR(numeric)} · ${party.name}`,
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isSupplier ? "Pay Supplier" : "Record Wasooli"}
      description={
        isSupplier
          ? "Supplier ko diya gaya cash/bank payment ledger mein adjust hoga."
          : "Customer se cash/bank wasooli — khata balance foran kam hoga."
      }
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={submit} className="flex-1" disabled={locked}>
            <Wallet className="h-4 w-4" />
            Save payment
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-slate-50/70 p-3">
          <PartyAvatar name={party.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-bold text-ink">{party.name}</p>
            <p className="text-[9px] text-ink-mute">{party.area_or_shop}</p>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-bold uppercase text-slate-400">
              {isSupplier ? "Payable" : "Outstanding"}
            </p>
            <p className="text-[11px] font-extrabold tabular text-amber-700">{formatPKR(outstanding)}</p>
          </div>
        </div>

        <Field label="Amount (PKR)">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
              Rs.
            </span>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-12 pl-10 text-[18px] font-extrabold tabular"
              autoFocus
            />
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {[0.25, 0.5, 1].map((fraction) => (
              <button
                key={fraction}
                type="button"
                onClick={() => setAmount(String(Math.round(outstanding * fraction)))}
                className="rounded-md border border-line bg-slate-50 px-2 py-1 text-[9px] font-bold text-ink-mute transition hover:border-slate-300 hover:text-ink"
              >
                {fraction === 1 ? "Full" : `${fraction * 100}%`}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Payment mode">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("cash")}
              className={cn(
                "flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border text-[11px] font-bold transition",
                mode === "cash"
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-ink-soft",
              )}
            >
              <Banknote className="h-3.5 w-3.5" />
              Cash
            </button>
            <button
              type="button"
              onClick={() => setMode("bank")}
              className={cn(
                "flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border text-[11px] font-bold transition",
                mode === "bank"
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-ink-soft",
              )}
            >
              <CircleDollarSign className="h-3.5 w-3.5" />
              Bank
            </button>
          </div>
        </Field>

        <Field label="Note" hint="Optional">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Reference / tafseel…"
            className="min-h-[66px]"
          />
        </Field>

        {numeric > 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-3">
            <span className="text-[10.5px] font-semibold text-emerald-800">
              {isSupplier ? "Payment ke baad" : "Wasooli ke baad"}
            </span>
            <span className="font-display text-[15px] font-extrabold tabular text-emerald-800">
              {formatPKR(Math.max(0, outstanding - numeric))}
            </span>
          </div>
        ) : null}
        {locked ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-800">
            Aaj ka din locked hai. Payment save nahi hogi.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

const BalanceSlip = forwardRef<
  HTMLDivElement,
  {
    party: Party;
    business: Business;
  }
>(function BalanceSlip({ party, business }, ref) {
  const isSupplier = party.type === "supplier";
  const balance = Math.abs(party.current_balance);
  const balanceLabel = isSupplier
    ? "PAYABLE TO SUPPLIER"
    : party.current_balance >= 0
      ? "UDHAAR OUTSTANDING"
      : "ADVANCE WITH SHOP";

  return (
    <div
      ref={ref}
      className="relative w-[420px] overflow-hidden bg-[#0F172A] p-6 text-white"
      style={{ fontFamily: "Inter, Segoe UI, sans-serif" }}
    >
      <div className="industrial-grid absolute inset-0 opacity-20" />
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <svg viewBox="0 0 40 40" className="h-7 w-7" fill="none">
                <circle cx="20" cy="20" r="12.5" stroke="white" strokeWidth="2.2" />
                <circle cx="20" cy="20" r="6.8" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" />
                <path d="M8 30 30 8" stroke="#34D399" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="font-display text-[16px] font-extrabold tracking-[-0.03em]">
                SteelKhata <span className="text-emerald-400">AI</span>
              </p>
              <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Scan · Khata · Control
              </p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.12em] text-emerald-300">
            Balance Slip
          </span>
        </div>

        <div className="mt-7 border-t border-white/10 pt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {business.business_name}
              </p>
              <p className="mt-1 text-[9px] text-slate-400">
                {business.city} · {business.phone}
              </p>
            </div>
            <p dir="rtl" className="font-urdu text-[13px] text-slate-300">
              کھاتہ بیلنس
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
          <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-slate-500">
            {isSupplier ? "Supplier account" : "Customer account"}
          </p>
          <p className="mt-1 font-display text-[23px] font-extrabold tracking-[-0.03em]">
            {party.name}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">{party.area_or_shop}</p>

          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-emerald-400">
              {balanceLabel}
            </p>
            <p className="mt-1 font-display text-[36px] font-extrabold leading-none tracking-[-0.05em] tabular text-white">
              Rs. {new Intl.NumberFormat("en-PK").format(Math.round(balance))}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 px-3 py-2.5">
            <p className="text-[7.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Party phone
            </p>
            <p className="mt-1 text-[10.5px] font-semibold text-slate-200">{party.phone}</p>
          </div>
          <div className="rounded-xl border border-white/10 px-3 py-2.5">
            <p className="text-[7.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Statement date
            </p>
            <p className="mt-1 text-[10.5px] font-semibold text-slate-200">
              {formatDate(new Date())}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between border-t border-white/10 pt-4">
          <div>
            <p className="text-[8px] text-slate-500">Generated by</p>
            <p className="mt-0.5 text-[9px] font-bold text-slate-300">SteelKhata AI · Owner verified</p>
          </div>
          <div className="text-right">
            <p className="text-[8px] text-slate-500">Shop stamp</p>
            <p className="mt-0.5 font-urdu text-[11px] text-emerald-300">ملک اسٹیل پائپ</p>
          </div>
        </div>
        <p className="mt-4 text-center text-[7.5px] leading-relaxed text-slate-600">
          Ye slip shop ke digital khate se generate hui hai. Kisi bhi discrepancy ke liye
          {` ${business.phone} `}par rabta karein.
        </p>
      </div>
    </div>
  );
});
