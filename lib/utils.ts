import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ProductUnit } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPKR(value: number, options?: { compact?: boolean; decimals?: boolean }) {
  const safe = Number.isFinite(value) ? value : 0;
  if (options?.compact && Math.abs(safe) >= 100000) {
    return `Rs. ${(safe / 100000).toFixed(1).replace(/\.0$/, "")} lac`;
  }
  return `Rs. ${new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: options?.decimals ? 2 : 0,
    minimumFractionDigits: 0,
  }).format(Math.round(safe))}`;
}

export function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatQty(value: number, unit: ProductUnit) {
  const suffix = unit === "length" ? "nali" : unit;
  return `${formatNumber(value, value % 1 === 0 ? 0 : 2)} ${suffix}`;
}

export function formatDate(input: string | Date, style: "short" | "long" | "time" = "short") {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  if (style === "time") {
    return new Intl.DateTimeFormat("en-PK", {
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  }
  if (style === "long") {
    return new Intl.DateTimeFormat("en-PK", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  }
  return new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(input: string | Date) {
  return `${formatDate(input)} · ${formatDate(input, "time")}`;
}

export function toDateKey(input: string | Date = new Date()): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0);
}

export function startOfDay(input: Date | string): Date {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(input: Date | string): Date {
  const d = new Date(input);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(input: Date, days: number): Date {
  const d = new Date(input);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysAgo(input: string | Date | null): number {
  if (!input) return Infinity;
  const delta = Date.now() - new Date(input).getTime();
  return Math.floor(delta / 86400000);
}

export function isToday(input: string | Date): boolean {
  return toDateKey(input) === toDateKey();
}

export function inRange(input: string | Date, from: string, to: string) {
  const key = toDateKey(input);
  return key >= from && key <= to;
}

export function initials(name: string) {
  return name
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function uid(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function shapeLabel(shape?: string) {
  const normalized = (shape || "round").toLowerCase();
  if (normalized === "round" || normalized === "gol") return "Round / Gol";
  if (normalized === "square" || normalized === "chauras") return "Square / Chauras";
  if (normalized === "rectangular") return "Rectangular";
  return titleCase(normalized);
}

export function unitLabel(unit: ProductUnit) {
  if (unit === "length") return "Nali / Length";
  if (unit === "kg") return "Kilogram";
  return "Pieces";
}

export function paymentModeLabel(mode: string) {
  if (mode === "cash") return "Cash";
  if (mode === "udhaar") return "Udhaar";
  if (mode === "bank") return "Bank";
  return titleCase(mode);
}

export function paymentModeUrdu(mode: string) {
  if (mode === "cash") return "Naqad";
  if (mode === "udhaar") return "Udhaar";
  if (mode === "bank") return "Bank";
  return "";
}

export function percentage(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function getInitialsColor(name: string) {
  const colors = [
    "bg-blue-50 text-blue-700 border-blue-100",
    "bg-emerald-50 text-emerald-700 border-emerald-100",
    "bg-amber-50 text-amber-700 border-amber-100",
    "bg-violet-50 text-violet-700 border-violet-100",
    "bg-rose-50 text-rose-700 border-rose-100",
    "bg-cyan-50 text-cyan-700 border-cyan-100",
  ];
  const hash = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
