"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarDays, Hash, ReceiptText, UserRound } from "lucide-react";
import type { TransactionWithItems } from "@/lib/types";
import { formatDateTime, formatPKR, formatQty, paymentModeLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function BillDetailModal({
  open,
  onClose,
  transaction,
}: {
  open: boolean;
  onClose: () => void;
  transaction: TransactionWithItems | null;
}) {
  if (!transaction) return null;
  const isReturn = transaction.type === "sale_return";
  const isPurchase = transaction.type === "purchase";
  const balance = Math.max(0, transaction.total_amount - transaction.paid_amount);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Original Parchi"
      description="Scanned bill photo alongside the saved accounting entry."
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="hidden text-[11px] font-medium text-ink-mute sm:block">
            Bill image is stored with this transaction.
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            {transaction.party && transaction.party.type !== "walk_in_cash" ? (
              <Link
                href={`/khatay/${transaction.party.id}`}
                className={buttonStyles({ variant: "outline", className: "flex-1 sm:flex-none" })}
              >
                Open Khata
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
            <Button variant="dark" onClick={onClose} className="flex-1 sm:flex-none">
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-[250px_1fr]">
        <div>
          <div className="relative overflow-hidden rounded-xl border border-line bg-slate-100">
            {transaction.bill_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={transaction.bill_image_url}
                alt={`Scanned parchi ${transaction.parchi_number || ""}`}
                className="max-h-[360px] w-full object-contain"
              />
            ) : (
              <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 text-slate-400">
                <ReceiptText className="h-7 w-7" />
                <span className="text-[11px] font-semibold">No image attached</span>
              </div>
            )}
            <span className="absolute left-2 top-2 rounded-md bg-ink/90 px-2 py-1 text-[8.5px] font-bold uppercase tracking-[0.1em] text-white backdrop-blur">
              Parchi copy
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
            <span className="text-[10px] font-semibold text-ink-mute">Stored securely</span>
            <Badge tone={transaction.payment_mode === "udhaar" ? "amber" : "emerald"}>
              {isPurchase ? "Purchase" : isReturn ? "Wapsi" : paymentModeLabel(transaction.payment_mode)}
            </Badge>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-display text-lg font-extrabold tracking-[-0.025em] text-ink">
                {transaction.party?.name || "Walk-in customer"}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-ink-mute">
                {transaction.party?.area_or_shop || "Counter sale"}
              </p>
            </div>
            <Badge
              tone={transaction.type === "purchase" ? "steel" : isReturn ? "crimson" : transaction.routing_mode === "cash_sale" ? "emerald" : "amber"}
              dot
            >
              {transaction.type === "purchase"
                ? "Aaya Hua Maal"
                : isReturn
                  ? "Maal Wapsi"
                  : transaction.routing_mode === "cash_sale"
                    ? "Cash Sale"
                    : "Customer Khata"}
            </Badge>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <DetailChip
              icon={<Hash className="h-3 w-3" />}
              label="Parchi"
              value={transaction.parchi_number || "—"}
            />
            <DetailChip
              icon={<CalendarDays className="h-3 w-3" />}
              label="Entry"
              value={formatDateTime(transaction.created_at).split(" · ")[0]}
            />
            <DetailChip
              icon={<UserRound className="h-3 w-3" />}
              label="Mode"
              value={paymentModeLabel(transaction.payment_mode)}
            />
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-[0.08em] text-ink-mute">
                <tr>
                  <th className="px-3 py-2.5">Item</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-right">Rate</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {transaction.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2.5">
                      <p className="text-[11.5px] font-semibold leading-snug text-ink">
                        {item.raw_scanned_name}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-[11px] tabular text-ink-soft">
                      {formatQty(item.quantity, item.unit)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-[11px] tabular text-ink-soft">
                      {formatPKR(item.rate)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-[11.5px] font-bold tabular text-ink">
                      {formatPKR(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 ml-auto w-full max-w-[280px] space-y-2">
            <MoneyLine label="Subtotal" value={formatPKR(transaction.subtotal)} />
            <MoneyLine
              label="Mazdoori / Extra"
              value={formatPKR(transaction.extra_charges)}
            />
            <div className="border-t border-dashed border-line pt-2">
              <MoneyLine
                label="Total"
                value={formatPKR(transaction.total_amount)}
                strong
              />
            </div>
            <MoneyLine label="Paid" value={formatPKR(transaction.paid_amount)} />
            {balance > 0 ? (
              <MoneyLine
                label="Baaki / Udhaar"
                value={formatPKR(balance)}
                tone="amber"
              />
            ) : null}
          </div>

          {transaction.notes ? (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-ink-mute">
              <span className="font-semibold text-ink-soft">Note: </span>
              {transaction.notes}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function DetailChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-slate-50/60 px-2.5 py-2">
      <p className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.08em] text-ink-mute">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-[11px] font-bold text-ink">{value}</p>
    </div>
  );
}

function MoneyLine({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "amber";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "text-[12px] font-bold text-ink" : "text-[11px] text-ink-mute"}>
        {label}
      </span>
      <span
        className={
          strong
            ? "font-display text-[16px] font-extrabold tabular text-ink"
            : tone === "amber"
              ? "text-[11.5px] font-bold tabular text-amber-700"
              : "text-[11.5px] font-semibold tabular text-ink-soft"
        }
      >
        {value}
      </span>
    </div>
  );
}
