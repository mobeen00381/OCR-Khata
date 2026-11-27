"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  HandCoins,
  MapPin,
  NotebookTabs,
  Phone,
  Plus,
  Search,
  Store,
  Truck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { Party, PartyType } from "@/lib/types";
import {
  cn,
  daysAgo,
  formatDate,
  formatPKR,
} from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PartyAvatar } from "@/components/shared/party-avatar";
import { QuickEntryModal } from "@/components/shared/quick-entry-modal";
import { useToast } from "@/components/toast";

type PartyFilter = "customer" | "supplier";

export default function KhatayPage() {
  const { state, addParty } = useStore();
  const [filter, setFilter] = useState<PartyFilter>("customer");
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [wasooliOpen, setWasooliOpen] = useState(false);

  const parties = useMemo(
    () =>
      state.parties
        .filter((party) => party.type !== "walk_in_cash")
        .filter((party) => party.type === filter)
        .sort((a, b) => Math.abs(b.current_balance) - Math.abs(a.current_balance)),
    [state.parties, filter],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return parties;
    return parties.filter((party) =>
      `${party.name} ${party.area_or_shop} ${party.phone}`.toLowerCase().includes(needle),
    );
  }, [parties, query]);

  const customers = state.parties.filter((party) => party.type === "customer");
  const suppliers = state.parties.filter((party) => party.type === "supplier");
  const outstanding = customers
    .filter((party) => party.current_balance > 0)
    .reduce((sum, party) => sum + party.current_balance, 0);
  const advances = customers
    .filter((party) => party.current_balance < 0)
    .reduce((sum, party) => sum + Math.abs(party.current_balance), 0);
  const payable = suppliers
    .filter((party) => party.current_balance < 0)
    .reduce((sum, party) => sum + Math.abs(party.current_balance), 0);

  const lastActivity = useMemo(() => {
    const map = new Map<string, string>();
    state.transactions.forEach((transaction) => {
      const current = map.get(transaction.party_id);
      if (!current || +new Date(transaction.created_at) > +new Date(current)) {
        map.set(transaction.party_id, transaction.created_at);
      }
    });
    state.payments.forEach((payment) => {
      if (!payment.party_id) return;
      const current = map.get(payment.party_id);
      if (!current || +new Date(payment.created_at) > +new Date(current)) {
        map.set(payment.party_id, payment.created_at);
      }
    });
    return map;
  }, [state.transactions, state.payments]);

  return (
    <>
      <PageHeader
        eyebrow="Khatay · Udhaar Ledger"
        title={
          <>
            Har customer ka <span className="text-steel-700">hisab, clear.</span>
          </>
        }
        description="Regular fabricators aur suppliers ke khatay — area tags ke saath, taake same name wale log mix na hon."
        actions={
          <>
            <Button variant="outline" onClick={() => setWasooliOpen(true)}>
              <HandCoins className="h-4 w-4" />
              Record Wasooli
            </Button>
            <Button onClick={() => setNewOpen(true)}>
              <UserPlus className="h-4 w-4" />
              New Khata
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Card className="relative overflow-hidden p-3.5">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-amber-500" />
          <div className="flex items-start justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <NotebookTabs className="h-4 w-4" />
            </span>
            <Badge tone="amber">Wasooli</Badge>
          </div>
          <p className="mt-3 font-display text-[22px] font-extrabold leading-none tracking-[-0.035em] tabular text-ink">
            {formatPKR(outstanding)}
          </p>
          <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-ink-mute">
            Total customer udhaar
          </p>
        </Card>
        <Card className="relative overflow-hidden p-3.5">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-emerald-500" />
          <div className="flex items-start justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <CircleDollarSign className="h-4 w-4" />
            </span>
            <Badge tone="emerald">Credit</Badge>
          </div>
          <p className="mt-3 font-display text-[22px] font-extrabold leading-none tracking-[-0.035em] tabular text-ink">
            {formatPKR(advances)}
          </p>
          <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-ink-mute">
            Customer advances
          </p>
        </Card>
        <Card className="relative overflow-hidden p-3.5">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-steel-600" />
          <div className="flex items-start justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-steel-700">
              <Users className="h-4 w-4" />
            </span>
            <Badge tone="steel">{suppliers.length}</Badge>
          </div>
          <p className="mt-3 font-display text-[22px] font-extrabold leading-none tracking-[-0.035em] tabular text-ink">
            {formatPKR(payable)}
          </p>
          <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-ink-mute">
            Supplier payable
          </p>
        </Card>
        <Card className="relative overflow-hidden p-3.5">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-slate-400" />
          <div className="flex items-start justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-ink-soft">
              <Truck className="h-4 w-4" />
            </span>
            <Badge tone="neutral">Live</Badge>
          </div>
          <p className="mt-3 font-display text-[22px] font-extrabold leading-none tracking-[-0.035em] tabular text-ink">
            {customers.length + suppliers.length}
          </p>
          <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-ink-mute">
            Active khatay
          </p>
        </Card>
      </section>

      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="flex rounded-xl border border-line bg-slate-100/80 p-1">
          <button
            type="button"
            onClick={() => setFilter("customer")}
            className={cn(
              "flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg px-4 text-[11px] font-bold transition sm:flex-none",
              filter === "customer" ? "bg-white text-ink shadow-sm" : "text-ink-mute hover:text-ink",
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Customers
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8.5px] font-extrabold">
              {customers.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("supplier")}
            className={cn(
              "flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg px-4 text-[11px] font-bold transition sm:flex-none",
              filter === "supplier" ? "bg-white text-ink shadow-sm" : "text-ink-mute hover:text-ink",
            )}
          >
            <Truck className="h-3.5 w-3.5" />
            Suppliers
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8.5px] font-extrabold">
              {suppliers.length}
            </span>
          </button>
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, area ya phone se dhoondein…"
            className="h-10 min-h-[40px] bg-white pl-9 text-[12px]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 md:grid-cols-2">
        {filtered.map((party) => (
          <PartyCard
            key={party.id}
            party={party}
            lastActivity={lastActivity.get(party.id)}
          />
        ))}
      </div>

      {!filtered.length ? (
        <Card className="mt-3">
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={query ? "Koi khata match nahi hua" : filter === "customer" ? "Abhi koi customer nahi" : "Abhi koi supplier nahi"}
            description={
              query
                ? "Spelling ya area tag check karein."
                : "Naya khata banayein aur udhaar likhna shuru karein."
            }
            action={
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                New Khata
              </Button>
            }
          />
        </Card>
      ) : null}

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-white px-3.5 py-2.5">
        <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <p className="text-[9.5px] leading-relaxed text-ink-mute">
          <span className="font-semibold text-ink-soft">Cash Counter / Walk-in</span> intentionally
          list se chhupa hai. Naqad sales daily hisab mein aati hain lekin khatay list clutter nahi karti.
        </p>
      </div>

      <NewPartyModal open={newOpen} onClose={() => setNewOpen(false)} onSave={addParty} />
      <QuickEntryModal open={wasooliOpen} onClose={() => setWasooliOpen(false)} defaultMode="wasooli" />
    </>
  );
}

function PartyCard({ party, lastActivity }: { party: Party; lastActivity?: string }) {
  const isSupplier = party.type === "supplier";
  const balance = party.current_balance;
  const displayBalance = isSupplier ? Math.abs(balance) : balance;
  const positive = isSupplier ? balance < 0 : balance > 0;
  const zero = balance === 0;

  return (
    <Link
      href={`/khatay/${party.id}`}
      className="group relative overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-float"
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          positive ? (isSupplier ? "bg-steel-600" : "bg-amber-500") : zero ? "bg-slate-200" : "bg-emerald-500",
        )}
      />
      <div className="flex items-start gap-3">
        <PartyAvatar name={party.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-[13.5px] font-extrabold tracking-[-0.02em] text-ink">
                {party.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="flex items-center gap-1 text-[9px] font-medium text-ink-mute">
                  <MapPin className="h-2.5 w-2.5 text-slate-400" />
                  {party.area_or_shop}
                </span>
                {party.phone !== "—" ? (
                  <span className="flex items-center gap-1 text-[9px] font-medium text-slate-400">
                    <Phone className="h-2.5 w-2.5" />
                    {party.phone}
                  </span>
                ) : null}
              </div>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
          </div>

          <div className="mt-3 flex items-end justify-between gap-2 border-t border-dashed border-line pt-2.5">
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-slate-400">
                {isSupplier ? "Payable" : balance > 0 ? "Udhaar balance" : balance < 0 ? "Advance" : "Balance"}
              </p>
              <p
                className={cn(
                  "mt-0.5 font-display text-[17px] font-extrabold tracking-[-0.03em] tabular",
                  positive
                    ? isSupplier
                      ? "text-steel-700"
                      : "text-amber-700"
                    : zero
                      ? "text-ink-mute"
                      : "text-emerald-700",
                )}
              >
                {zero ? "Rs. 0" : formatPKR(displayBalance)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Last activity
              </p>
              <p className="mt-0.5 text-[9px] font-semibold text-ink-soft">
                {lastActivity
                  ? daysAgo(lastActivity) === 0
                    ? "Today"
                    : `${daysAgo(lastActivity)}d ago`
                  : "No entries"}
              </p>
              {lastActivity ? (
                <p className="text-[8px] text-slate-400">{formatDate(lastActivity)}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function NewPartyModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (
    input: Omit<Party, "id" | "business_id" | "created_at" | "current_balance">,
  ) => Promise<Party>;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<PartyFilter>("customer");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setSaving(false);
    }
  }, [open]);

  async function submit() {
    if (saving) return;
    if (!name.trim()) {
      setError("Party ka naam zaroori hai.");
      return;
    }
    if (!area.trim()) {
      setError("Area / shop likhein — same name wale customers alag rahenge.");
      return;
    }
    setSaving(true);
    try {
      const party = await onSave({
        name: name.trim(),
        area_or_shop: area.trim(),
        phone: phone.trim() || "—",
        type: type as PartyType,
      });
      toast({
        title: "Naya khata ban gaya",
        description: `${party.name} · ${party.area_or_shop}`,
      });
      setName("");
      setArea("");
      setPhone("");
      setError("");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Khata save nahi hua.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Khata"
      description="Area tag zaroori hai — warna same name wale Nadeem mix ho jate hain."
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={() => void submit()} disabled={saving}>
            <UserPlus className="h-4 w-4" />
            {saving ? "Saving…" : "Create khata"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Nadeem Fabricators"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Area / Shop">
            <Input
              value={area}
              onChange={(event) => setArea(event.target.value)}
              placeholder="Sialkot Road"
            />
          </Field>
          <Field label="Phone" hint="Optional">
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="0300 1234567"
            />
          </Field>
        </div>
        <Field label="Party type">
          <Select value={type} onChange={(event) => setType(event.target.value as PartyFilter)}>
            <option value="customer">Customer · Udhaar khata</option>
            <option value="supplier">Supplier · Payable khata</option>
          </Select>
        </Field>
        {error ? (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10.5px] font-semibold text-crimson">
            {error}
          </p>
        ) : null}
        <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[9.5px] leading-relaxed text-ink-mute">
          <Banknote className="mt-0.5 h-3 w-3 shrink-0" />
          Khata zero balance se shuru hoga. Pehli udhaar sale khud add ho jayegi.
        </div>
      </div>
    </Modal>
  );
}
