"use client";

import { useEffect, useState } from "react";
import { Loader2, PackagePlus } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Product, ProductUnit, ScanItem } from "@/lib/types";
import { cn, formatPKR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";

export function CreateItemModal({
  open,
  item,
  purchaseMode,
  onClose,
  onCreated,
}: {
  open: boolean;
  item: ScanItem | null;
  purchaseMode: boolean;
  onClose: () => void;
  onCreated: (product: Product) => void;
}) {
  const { addProduct } = useStore();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [gauge, setGauge] = useState("18G");
  const [grade, setGrade] = useState("304");
  const [shape, setShape] = useState("round");
  const [unit, setUnit] = useState<ProductUnit>("length");
  const [rate, setRate] = useState("0");
  const [purchaseRate, setPurchaseRate] = useState("0");
  const [stock, setStock] = useState("0");
  const [lowAt, setLowAt] = useState("10");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !item) return;
    setSize(item.size || "");
    setGauge(item.gauge || "18G");
    setGrade(item.grade || "304");
    setShape(item.shape || "round");
    setUnit(item.unit || "length");
    setRate(String(item.rate || 0));
    setPurchaseRate(String(Math.round((item.rate || 0) * 0.82)));
    setStock("0");
    setLowAt("10");
    setError("");
    const guessedSize = item.size || "new";
    setName(`Pipe ${guessedSize} — SS ${item.grade || "304"}`);
  }, [open, item]);

  async function submit() {
    if (!item) return;
    if (!name.trim() || !size.trim() || !gauge.trim() || !grade.trim()) {
      setError("Name, size, gauge and grade are required.");
      return;
    }
    if (Number(rate) <= 0) {
      setError("Sale rate must be greater than zero.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const product = await addProduct({
        name: name.trim(),
        sku_code: `SP-${shape.slice(0, 1).toUpperCase()}-${size.replace(
          /[^0-9.]/g,
          "",
        )}-${grade}-${gauge.replace(/\D/g, "")}`,
        unit,
        weight_per_length: null,
        current_stock: Math.max(0, Number(stock) || 0),
        low_stock_alert: Math.max(0, Number(lowAt) || 0),
        purchase_rate: Math.max(0, Number(purchaseRate) || 0),
        sale_rate: Math.max(0, Number(rate) || 0),
        attributes: {
          size: size.trim(),
          gauge: gauge.trim().toUpperCase(),
          grade: grade.trim(),
          shape: shape.trim().toLowerCase(),
          length_ft: 20,
        },
        aliases: item.raw_scanned_name ? [item.raw_scanned_name.toLowerCase().trim()] : [],
        last_sold_at: null,
      });
      toast({
        title: "New item added to inventory",
        description: `${product.name} · handwriting alias saved for next scan.`,
      });
      onCreated(product);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create New Item"
      description="Add this handwritten pipe size to inventory — the raw line becomes an alias automatically."
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
            {saving ? "Creating…" : "Create & match"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Product name">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Size">
            <Input value={size} onChange={(event) => setSize(event.target.value)} placeholder='1.5"' />
          </Field>
          <Field label="Gauge">
            <Input value={gauge} onChange={(event) => setGauge(event.target.value)} />
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
              <option value="length">Nali / Length</option>
              <option value="kg">Kg</option>
              <option value="pcs">Pieces</option>
            </Select>
          </Field>
          <Field label="Sale rate">
            <Input type="number" min={0} value={rate} onChange={(event) => setRate(event.target.value)} />
          </Field>
          <Field label="Purchase rate">
            <Input
              type="number"
              min={0}
              value={purchaseRate}
              onChange={(event) => setPurchaseRate(event.target.value)}
            />
          </Field>
          <Field label="Opening stock">
            <Input type="number" min={0} value={stock} onChange={(event) => setStock(event.target.value)} />
          </Field>
        </div>
        <Field label="Low stock alert">
          <Input
            type="number"
            min={0}
            value={lowAt}
            onChange={(event) => setLowAt(event.target.value)}
            className="max-w-[170px]"
          />
        </Field>

        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-amber-700">
            Learning this handwriting
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-amber-800">
            “{item?.raw_scanned_name}” will be stored as an alias for this product.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-line bg-slate-50 px-3 py-2">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-mute">
            {purchaseMode ? "Purchase" : "Sale"} match preview
          </span>
          <span className={cn("text-[11px] font-bold tabular text-ink")}>
            {formatPKR(Number(rate) || 0)}
          </span>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-semibold text-crimson">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
