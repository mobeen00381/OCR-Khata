"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ReceiptText, Wallet } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatPKR, roundMoney, toDateKey } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SegmentedTabs } from "@/components/ui/tabs";
import { useToast } from "@/components/toast";

type EntryMode = "wasooli" | "expense";

export function QuickEntryModal({
  open,
  onClose,
  defaultMode = "wasooli",
}: {
  open: boolean;
  onClose: () => void;
  defaultMode?: EntryMode;
}) {
  const { state, recordPayment, isDayLocked } = useStore();
  const { toast } = useToast();
  const [mode, setMode] = useState<EntryMode>(defaultMode);
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "bank">("cash");

  useEffect(() => {
    if (open) {
      setMode(defaultMode);
      setPartyId("");
      setAmount("");
      setDescription("");
      setPaymentMode("cash");
    }
  }, [open, defaultMode]);

  const customers = state.parties.filter(
    (party) => party.type === "customer" || party.type === "supplier",
  );
  const numericAmount = Number(amount) || 0;

  function submit() {
    if (isDayLocked(toDateKey())) {
      toast({
        title: "Aaj ka din locked hai",
        description: "Unlock karne ke liye Reports page par owner PIN dalein.",
        tone: "error",
      });
      return;
    }
    if (numericAmount <= 0) {
      toast({ title: "Amount likhein", description: "Entry ke liye sahi raqam darj karein.", tone: "error" });
      return;
    }

    if (mode === "wasooli") {
      if (!partyId) {
        toast({ title: "Party select karein", description: "Wasooli kis customer se aayi hai?", tone: "error" });
        return;
      }
      const party = state.parties.find((entry) => entry.id === partyId);
      recordPayment({
        party_id: partyId,
        entry_type: "customer_wasooli",
        description: description.trim() || `Wasooli — ${party?.name || "Customer"}`,
        amount: roundMoney(numericAmount),
        payment_mode: paymentMode,
      });
      toast({
        title: "Wasooli record ho gayi",
        description: `${formatPKR(numericAmount)} ${party?.name || "customer"} ke khate mein jama.`,
      });
    } else {
      recordPayment({
        party_id: null,
        entry_type: "shop_expense",
        description: description.trim() || "Shop expense",
        amount: roundMoney(numericAmount),
        payment_mode: paymentMode,
      });
      toast({
        title: "Kharcha add ho gaya",
        description: `${formatPKR(numericAmount)} Roznamcha mein darj.`,
      });
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Roznamcha Entry"
      description="Wasooli ya shop kharcha — galla hisab foran update hoga."
      footer={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={submit} className="flex-1">
            <Wallet className="h-4 w-4" />
            Save Entry
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <SegmentedTabs
          value={mode}
          onChange={(value) => setMode(value)}
          options={[
            { value: "wasooli", label: "Customer Wasooli", icon: <ArrowDownLeft className="h-3.5 w-3.5" /> },
            { value: "expense", label: "Shop Kharcha", icon: <ReceiptText className="h-3.5 w-3.5" /> },
          ]}
        />

        {mode === "wasooli" ? (
          <Field label="Customer / Party" hint="Ledger balance adjust hoga">
            <Select value={partyId} onChange={(event) => setPartyId(event.target.value)}>
              <option value="">Select customer…</option>
              {customers.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name} — {party.area_or_shop}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Amount (PKR)">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
              Rs.
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="pl-10 text-[17px] font-bold tabular"
              autoFocus
            />
          </div>
          <div className="mt-2 flex gap-1.5">
            {[1000, 5000, 10000, 25000].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(String(value))}
                className="rounded-md border border-line bg-slate-50 px-2 py-1 text-[10px] font-semibold text-ink-mute transition hover:border-slate-300 hover:text-ink"
              >
                +{value / 1000}k
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-[1fr_1.6fr] gap-3">
          <Field label="Payment">
            <Select
              value={paymentMode}
              onChange={(event) => setPaymentMode(event.target.value as "cash" | "bank")}
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </Select>
          </Field>
          <Field label="Note" hint="Optional">
            <Input
              placeholder={mode === "wasooli" ? "Nadeem se wasooli" : "Diesel / chai / labour"}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>

        {mode === "expense" ? (
          <Textarea
            placeholder="Tafseel likhein… (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-[70px]"
          />
        ) : null}

        {numericAmount > 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
            <span className="text-[11px] font-semibold text-emerald-800">
              {mode === "wasooli" ? "Galla mein jama" : "Galla se kharch"}
            </span>
            <span className="font-display text-[17px] font-extrabold tabular text-emerald-800">
              {formatPKR(numericAmount)}
            </span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
