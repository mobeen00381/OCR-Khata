"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronDown,
  Edit3,
  Package,
  PackageOpen,
  Plus,
  ScanLine,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  Warehouse,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { deadStockProducts } from "@/lib/analytics";
import type { Product, ProductUnit, SteelAttributes } from "@/lib/types";
import {
  cn,
  daysAgo,
  formatNumber,
  formatPKR,
  formatQty,
  shapeLabel,
  titleCase,
  unitLabel,
} from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";

type StatusFilter = "all" | "low" | "dead";

function stockStatus(product: Product) {
  const low = product.current_stock <= product.low_stock_alert;
  const dead = Boolean(product.last_sold_at && daysAgo(product.last_sold_at) >= 30);
  return { low, dead };
}

export default function StockPage() {
  const { state, addProduct, updateProduct } = useStore();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [size, setSize] = useState("all");
  const [gauge, setGauge] = useState("all");
  const [grade, setGrade] = useState("all");
  const [shape, setShape] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("low") === "1") setStatus("low");
    if (params.get("dead") === "1") setStatus("dead");
    const q = params.get("q");
    if (q) setQuery(q);
  }, []);

  const dead = useMemo(() => deadStockProducts(state), [state]);
  const low = useMemo(
    () => state.products.filter((product) => product.current_stock <= product.low_stock_alert),
    [state.products],
  );
  const valuation = useMemo(
    () =>
      state.products.reduce(
        (sum, product) => sum + product.current_stock * product.purchase_rate,
        0,
      ),
    [state.products],
  );

  const sizes = useMemo(
    () => [...new Set(state.products.map((product) => String(product.attributes.size || "")))].filter(Boolean),
    [state.products],
  );
  const gauges = useMemo(
    () => [...new Set(state.products.map((product) => String(product.attributes.gauge || "")))].filter(Boolean),
    [state.products],
  );
  const grades = useMemo(
    () => [...new Set(state.products.map((product) => String(product.attributes.grade || "")))].filter(Boolean),
    [state.products],
  );
  const shapes = useMemo(
    () => [...new Set(state.products.map((product) => String(product.attributes.shape || "")))].filter(Boolean),
    [state.products],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.products
      .filter((product) => {
        if (needle) {
          const haystack = [
            product.name,
            product.sku_code,
            product.attributes.size,
            product.attributes.gauge,
            product.attributes.grade,
            product.attributes.shape,
            ...product.aliases,
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        if (size !== "all" && String(product.attributes.size) !== size) return false;
        if (gauge !== "all" && String(product.attributes.gauge) !== gauge) return false;
        if (grade !== "all" && String(product.attributes.grade) !== grade) return false;
        if (shape !== "all" && String(product.attributes.shape) !== shape) return false;
        const flags = stockStatus(product);
        if (status === "low" && !flags.low) return false;
        if (status === "dead" && !flags.dead) return false;
        return true;
      })
      .sort((a, b) => {
        const aLow = a.current_stock <= a.low_stock_alert ? 0 : 1;
        const bLow = b.current_stock <= b.low_stock_alert ? 0 : 1;
        if (aLow !== bLow) return aLow - bLow;
        return a.name.localeCompare(b.name);
      });
  }, [state.products, query, size, gauge, grade, shape, status]);

  const activeFilterCount = [size, gauge, grade, shape].filter((value) => value !== "all").length +
    (status !== "all" ? 1 : 0);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setModalOpen(true);
  }

  function resetFilters() {
    setSize("all");
    setGauge("all");
    setGrade("all");
    setShape("all");
    setStatus("all");
    setQuery("");
  }

  function saveProduct(product: Product) {
    if (editing) {
      updateProduct(editing.id, product);
      toast({ title: "Product update ho gaya", description: product.name });
    } else {
      addProduct({
        name: product.name,
        sku_code: product.sku_code,
        unit: product.unit,
        weight_per_length: product.weight_per_length,
        current_stock: product.current_stock,
        low_stock_alert: product.low_stock_alert,
        purchase_rate: product.purchase_rate,
        sale_rate: product.sale_rate,
        attributes: product.attributes,
        aliases: product.aliases,
        last_sold_at: product.last_sold_at,
      });
      toast({ title: "Naya SKU add ho gaya", description: product.name });
    }
    setModalOpen(false);
  }

  return (
    <>
      <PageHeader
        eyebrow="Inventory · Maal"
        title={
          <>
            Steel stock, <span className="text-steel-700">saaf nazar mein.</span>
          </>
        }
        description="Size, gauge, grade aur shape se filter karein. Low stock aur dead stock foran nazar aayega."
        actions={
          <>
            <Link href="/scan?type=purchase" className={buttonStyles({ variant: "outline" })}>
              <ScanLine className="h-4 w-4" />
              Scan Stock Register
            </Link>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StockStat
          icon={<Warehouse className="h-4 w-4" />}
          label="Total SKUs"
          value={String(state.products.length)}
          caption={`${formatQty(
            state.products.reduce((sum, product) => sum + product.current_stock, 0),
            "length",
          )} total`}
          tone="steel"
        />
        <StockStat
          icon={<Package className="h-4 w-4" />}
          label="Stock value"
          value={formatPKR(valuation, { compact: true })}
          caption="Purchase cost"
          tone="emerald"
        />
        <button type="button" onClick={() => setStatus("low")} className="text-left">
          <StockStat
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Low stock"
            value={String(low.length)}
            caption="Reorder needed"
            tone="amber"
            active={status === "low"}
          />
        </button>
        <button type="button" onClick={() => setStatus("dead")} className="text-left">
          <StockStat
            icon={<TrendingDown className="h-4 w-4" />}
            label="Dead stock"
            value={String(dead.length)}
            caption="30+ days unsold"
            tone="crimson"
            active={status === "dead"}
          />
        </button>
      </section>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line p-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search size, gauge, grade, SKU, alias…"
              className="h-10 min-h-[40px] border-transparent bg-slate-50 pl-9 text-[12px] focus:border-steel-600 focus:bg-white"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-ink"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            className={cn(
              "flex h-10 min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-[10.5px] font-bold transition",
              showFilters
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-ink-soft hover:bg-slate-50",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount ? (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[8px] font-extrabold text-white">
                {activeFilterCount}
              </span>
            ) : null}
            <ChevronDown className={cn("h-3 w-3 transition", showFilters && "rotate-180")} />
          </button>
          <Button size="icon" variant="outline" onClick={openAdd} aria-label="Add product">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {showFilters ? (
          <div className="border-b border-line p-2.5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <FilterSelect label="Size" value={size} onChange={setSize} options={sizes} />
              <FilterSelect label="Gauge" value={gauge} onChange={setGauge} options={gauges} />
              <FilterSelect label="Grade" value={grade} onChange={setGrade} options={grades} />
              <FilterSelect
                label="Shape"
                value={shape}
                onChange={setShape}
                options={shapes}
                display={(value) => shapeLabel(value).split(" /")[0]}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["all", "All stock"],
                  ["low", `Low stock · ${low.length}`],
                  ["dead", `Dead stock · ${dead.length}`],
                ] as Array<[StatusFilter, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[9.5px] font-bold transition",
                    status === value
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-white text-ink-mute hover:border-slate-300 hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
              {activeFilterCount || query ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="ml-auto flex items-center gap-1 text-[9.5px] font-bold text-steel-700"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between border-b border-line bg-slate-50/60 px-4 py-2">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-mute">
            {filtered.length} products
          </p>
          <span className="flex items-center gap-1 text-[9px] text-slate-400">
            <ArrowDownUp className="h-3 w-3" />
            Low stock first
          </span>
        </div>

        {filtered.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-left">
                <thead>
                  <tr className="border-b border-line text-[8.5px] font-bold uppercase tracking-[0.08em] text-ink-mute">
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-3 py-2.5">Specification</th>
                    <th className="px-3 py-2.5 text-right">Stock</th>
                    <th className="px-3 py-2.5 text-right">Sale rate</th>
                    <th className="px-3 py-2.5 text-right">Cost value</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Last sold</th>
                    <th className="px-3 py-2.5 text-right">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((product) => {
                    const flags = stockStatus(product);
                    return (
                      <tr
                        key={product.id}
                        className="group cursor-pointer transition hover:bg-slate-50/70"
                        onClick={() => openEdit(product)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <PipeGlyph shape={String(product.attributes.shape || "round")} />
                            <div className="min-w-0">
                              <p className="truncate text-[11.5px] font-bold text-ink">{product.name}</p>
                              <p className="mt-0.5 text-[8.5px] font-medium uppercase tracking-[0.05em] text-slate-400">
                                {product.sku_code}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <SpecChip>{product.attributes.size}</SpecChip>
                            <SpecChip>{product.attributes.gauge}</SpecChip>
                            <SpecChip>{product.attributes.grade}</SpecChip>
                            <SpecChip>{shapeLabel(String(product.attributes.shape || "")).split(" /")[0]}</SpecChip>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <p
                            className={cn(
                              "text-[11.5px] font-extrabold tabular",
                              flags.low ? "text-amber-700" : "text-ink",
                            )}
                          >
                            {formatNumber(product.current_stock, 2)}
                          </p>
                          <p className="text-[8px] text-slate-400">{unitLabel(product.unit).split(" /")[0]}</p>
                        </td>
                        <td className="px-3 py-3 text-right text-[11px] font-semibold tabular text-ink-soft">
                          {formatPKR(product.sale_rate)}
                        </td>
                        <td className="px-3 py-3 text-right text-[11px] font-semibold tabular text-ink-soft">
                          {formatPKR(product.current_stock * product.purchase_rate)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {flags.low ? <Badge tone="amber">Low</Badge> : null}
                            {flags.dead ? <Badge tone="crimson">Dead</Badge> : null}
                            {!flags.low && !flags.dead ? <Badge tone="emerald">Healthy</Badge> : null}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[9.5px] font-medium text-ink-mute">
                          {product.last_sold_at
                            ? daysAgo(product.last_sold_at) === 0
                              ? "Today"
                              : `${daysAgo(product.last_sold_at)}d ago`
                            : "Never"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEdit(product);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-slate-400 transition group-hover:border-slate-300 group-hover:text-ink"
                            aria-label={`Edit ${product.name}`}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {filtered.map((product) => {
                const flags = stockStatus(product);
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => openEdit(product)}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition active:bg-slate-50"
                  >
                    <PipeGlyph shape={String(product.attributes.shape || "round")} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-bold text-ink">{product.name}</p>
                          <p className="mt-0.5 text-[8.5px] font-medium uppercase tracking-[0.05em] text-slate-400">
                            {product.sku_code}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          {flags.low ? <Badge tone="amber">Low</Badge> : null}
                          {flags.dead ? <Badge tone="crimson">Dead</Badge> : null}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <SpecChip>{product.attributes.size}</SpecChip>
                        <SpecChip>{product.attributes.gauge}</SpecChip>
                        <SpecChip>{product.attributes.grade}</SpecChip>
                        <SpecChip>{shapeLabel(String(product.attributes.shape || "")).split(" /")[0]}</SpecChip>
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div>
                          <p
                            className={cn(
                              "text-[13px] font-extrabold tabular",
                              flags.low ? "text-amber-700" : "text-ink",
                            )}
                          >
                            {formatQty(product.current_stock, product.unit)}
                          </p>
                          <p className="text-[8.5px] text-slate-400">min {product.low_stock_alert}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-bold tabular text-ink">{formatPKR(product.sale_rate)}</p>
                          <p className="text-[8px] text-slate-400">per {product.unit === "length" ? "nali" : product.unit}</p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState
            icon={<PackageOpen className="h-5 w-5" />}
            title="Koi product match nahi hua"
            description="Filters change karein ya naya SKU add karein."
            action={
              <Button size="sm" onClick={resetFilters} variant="outline">
                Clear filters
              </Button>
            }
          />
        )}
      </Card>

      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-steel-700 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-[11px] font-bold text-ink">Bulk stock import</p>
            <p className="mt-0.5 text-[9.5px] leading-relaxed text-ink-mute">
              Stock register ka pura page scan karein — AI rows ko products se match karega.
            </p>
          </div>
        </div>
        <Link href="/scan?type=purchase" className={buttonStyles({ variant: "outline", size: "sm" })}>
          Scan register page
          <ScanLine className="h-3.5 w-3.5" />
        </Link>
      </div>

      <ProductModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        product={editing}
        onSave={saveProduct}
      />
    </>
  );
}

function StockStat({
  icon,
  label,
  value,
  caption,
  tone,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  caption: string;
  tone: "steel" | "emerald" | "amber" | "crimson";
  active?: boolean;
}) {
  const tones = {
    steel: "text-steel-700 bg-blue-50",
    emerald: "text-emerald-700 bg-emerald-50",
    amber: "text-amber-700 bg-amber-50",
    crimson: "text-crimson bg-red-50",
  };
  return (
    <Card
      className={cn(
        "relative overflow-hidden p-3.5 transition",
        active && "border-ink ring-1 ring-ink",
      )}
    >
      <div className="flex items-start justify-between">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tones[tone])}>
          {icon}
        </span>
      </div>
      <p className="mt-3 font-display text-[22px] font-extrabold leading-none tracking-[-0.035em] tabular text-ink">
        {value}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-ink-mute">{label}</span>
        <span className="text-[8px] font-medium text-slate-400">{caption}</span>
      </div>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  display,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  display?: (value: string) => string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[8px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </span>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-h-[36px] text-[10.5px] font-semibold"
      >
        <option value="all">All {label.toLowerCase()}s</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {display ? display(option) : option}
          </option>
        ))}
      </Select>
    </label>
  );
}

function SpecChip({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <span className="rounded border border-line bg-slate-50 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.03em] text-ink-soft">
      {children}
    </span>
  );
}

function PipeGlyph({ shape, size = 34 }: { shape: string; size?: number }) {
  const round = shape.toLowerCase() === "round" || shape.toLowerCase() === "gol";
  return (
    <span
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className={cn(
          "absolute inset-0 border-[3px] border-slate-300 bg-gradient-to-br from-slate-50 via-slate-200 to-slate-300 shadow-inner",
          round ? "rounded-full" : "rounded-[7px]",
        )}
      />
      <span
        className={cn(
          "relative h-[48%] w-[48%] border border-slate-300 bg-white shadow-inner",
          round ? "rounded-full" : "rounded-[3px]",
        )}
      />
      <span className="absolute left-[18%] top-[12%] h-[3px] w-[25%] -rotate-45 rounded-full bg-white/80" />
    </span>
  );
}

function ProductModal({
  open,
  onClose,
  product,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onSave: (product: Product) => void;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [size, setSize] = useState('1"');
  const [gauge, setGauge] = useState("18G");
  const [grade, setGrade] = useState("304");
  const [shape, setShape] = useState("round");
  const [unit, setUnit] = useState<ProductUnit>("length");
  const [stock, setStock] = useState("0");
  const [lowAt, setLowAt] = useState("10");
  const [purchaseRate, setPurchaseRate] = useState("0");
  const [saleRate, setSaleRate] = useState("0");
  const [weight, setWeight] = useState("");
  const [aliases, setAliases] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (product) {
      setName(product.name);
      setSku(product.sku_code);
      setSize(String(product.attributes.size || ""));
      setGauge(String(product.attributes.gauge || ""));
      setGrade(String(product.attributes.grade || ""));
      setShape(String(product.attributes.shape || "round"));
      setUnit(product.unit);
      setStock(String(product.current_stock));
      setLowAt(String(product.low_stock_alert));
      setPurchaseRate(String(product.purchase_rate));
      setSaleRate(String(product.sale_rate));
      setWeight(product.weight_per_length ? String(product.weight_per_length) : "");
      setAliases(product.aliases.join(", "));
    } else {
      setName("");
      setSku("");
      setSize('1"');
      setGauge("18G");
      setGrade("304");
      setShape("round");
      setUnit("length");
      setStock("0");
      setLowAt("10");
      setPurchaseRate("0");
      setSaleRate("0");
      setWeight("");
      setAliases("");
    }
    setError("");
  }, [open, product]);

  function submit() {
    const cleanName = name.trim() || `${titleCase(shape)} Pipe ${size} — SS ${grade}`;
    if (!size.trim() || !gauge.trim() || !grade.trim()) {
      setError("Size, gauge aur grade zaroori hain.");
      return;
    }
    if (Number(saleRate) <= 0) {
      setError("Sale rate 0 se zyada honi chahiye.");
      return;
    }
    if (Number(purchaseRate) < 0 || Number(stock) < 0) {
      setError("Stock aur purchase rate negative nahi ho sakte.");
      return;
    }
    const attributes: SteelAttributes = {
      size: size.trim(),
      gauge: gauge.trim().toUpperCase(),
      grade: grade.trim(),
      shape: shape.trim().toLowerCase(),
      length_ft: 20,
    };
    const result: Product = {
      id: product?.id || "",
      business_id: product?.business_id || "",
      name: cleanName,
      sku_code:
        sku.trim().toUpperCase() ||
        `SP-${shape.slice(0, 1).toUpperCase()}-${size.replace(/[^0-9.]/g, "")}-${grade}-${gauge.replace(
          /\D/g,
          "",
        )}`,
      unit,
      weight_per_length: weight ? Number(weight) : null,
      current_stock: Number(stock),
      low_stock_alert: Number(lowAt),
      purchase_rate: Number(purchaseRate),
      sale_rate: Number(saleRate),
      attributes,
      aliases: aliases
        .split(",")
        .map((alias) => alias.trim())
        .filter(Boolean),
      last_sold_at: product?.last_sold_at || null,
      created_at: product?.created_at || new Date().toISOString(),
    };
    onSave(result);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? "Edit Product" : "Add New Product"}
      description="Steel pipe ki specification aur rates — inventory foran update hoga."
      size="lg"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={submit} className="flex-1">
            {product ? "Save changes" : "Add product"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Product name" hint="Optional — auto ban jayega">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder='e.g. Round Pipe 2" — SS 304'
          />
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Size">
            <Input value={size} onChange={(event) => setSize(event.target.value)} placeholder='1.5"' />
          </Field>
          <Field label="Gauge">
            <Input value={gauge} onChange={(event) => setGauge(event.target.value)} placeholder="18G" />
          </Field>
          <Field label="Grade">
            <Select value={grade} onChange={(event) => setGrade(event.target.value)}>
              <option>201</option>
              <option>304</option>
              <option>316</option>
            </Select>
          </Field>
          <Field label="Shape">
            <Select value={shape} onChange={(event) => setShape(event.target.value)}>
              <option value="round">Round / Gol</option>
              <option value="square">Square / Chauras</option>
              <option value="rectangular">Rectangular</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Unit">
            <Select value={unit} onChange={(event) => setUnit(event.target.value as ProductUnit)}>
              <option value="length">Length / Nali</option>
              <option value="kg">Kilogram</option>
              <option value="pcs">Pieces</option>
            </Select>
          </Field>
          <Field label="Current stock">
            <Input
              type="number"
              min={0}
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              className="tabular"
            />
          </Field>
          <Field label="Low alert at">
            <Input
              type="number"
              min={0}
              value={lowAt}
              onChange={(event) => setLowAt(event.target.value)}
              className="tabular"
            />
          </Field>
          <Field label="Weight / length" hint="kg">
            <Input
              type="number"
              min={0}
              step="0.1"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              placeholder="Optional"
              className="tabular"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase rate" hint="PKR">
            <Input
              type="number"
              min={0}
              value={purchaseRate}
              onChange={(event) => setPurchaseRate(event.target.value)}
              className="tabular"
            />
          </Field>
          <Field label="Sale rate" hint="PKR">
            <Input
              type="number"
              min={0}
              value={saleRate}
              onChange={(event) => setSaleRate(event.target.value)}
              className="tabular"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="SKU code" hint="Auto if blank">
            <Input
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              placeholder="SP-R-150-304-18"
              className="uppercase"
            />
          </Field>
          <Field label="Aliases" hint="Comma separated">
            <Input
              value={aliases}
              onChange={(event) => setAliases(event.target.value)}
              placeholder="dedh inch, 1.5 round"
            />
          </Field>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10.5px] font-semibold text-crimson">
            <X className="h-3.5 w-3.5" />
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-xl border border-line bg-slate-50 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <PipeGlyph shape={shape} size={30} />
            <div>
              <p className="text-[10px] font-bold text-ink">
                {size} · {gauge.toUpperCase()} · {grade} · {shapeLabel(shape).split(" /")[0]}
              </p>
              <p className="text-[8.5px] text-ink-mute">
                {formatQty(Number(stock) || 0, unit)} · {formatPKR(Number(saleRate) || 0)} sale
              </p>
            </div>
          </div>
          <Badge tone="steel">Preview</Badge>
        </div>
      </div>
    </Modal>
  );
}
