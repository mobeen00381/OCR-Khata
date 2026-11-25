export type BusinessNiche = "steel_pipes" | "general" | "hardware";
export type ProductUnit = "length" | "kg" | "pcs";
export type PartyType = "customer" | "supplier" | "walk_in_cash";
export type TransactionType = "sale" | "purchase" | "sale_return";
export type RoutingMode = "cash_sale" | "customer_khata";
export type PaymentMode = "cash" | "udhaar" | "bank";
export type ExpenseEntryType =
  | "customer_wasooli"
  | "supplier_payment"
  | "shop_expense";

export interface Business {
  id: string;
  owner_id: string;
  business_name: string;
  niche: BusinessNiche;
  phone: string;
  city: string;
  created_at: string;
}

export interface SteelAttributes {
  size?: string;
  gauge?: string;
  grade?: string;
  shape?: string;
  length_ft?: number;
  [key: string]: string | number | undefined;
}

export interface Product {
  id: string;
  business_id: string;
  name: string;
  sku_code: string;
  unit: ProductUnit;
  weight_per_length: number | null;
  current_stock: number;
  low_stock_alert: number;
  purchase_rate: number;
  sale_rate: number;
  attributes: SteelAttributes;
  aliases: string[];
  last_sold_at: string | null;
  created_at: string;
}

export interface Party {
  id: string;
  business_id: string;
  name: string;
  area_or_shop: string;
  phone: string;
  type: PartyType;
  current_balance: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  business_id: string;
  party_id: string;
  parchi_number: string | null;
  type: TransactionType;
  routing_mode: RoutingMode;
  payment_mode: PaymentMode;
  subtotal: number;
  extra_charges: number;
  total_amount: number;
  paid_amount: number;
  bill_image_url: string | null;
  is_day_locked: boolean;
  created_at: string;
  notes?: string;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  product_id: string;
  raw_scanned_name: string;
  quantity: number;
  unit: ProductUnit;
  rate: number;
  amount: number;
}

export interface PaymentExpense {
  id: string;
  business_id: string;
  party_id: string | null;
  entry_type: ExpenseEntryType;
  description: string;
  amount: number;
  payment_mode: PaymentMode;
  created_at: string;
}

export interface TransactionWithItems extends Transaction {
  items: TransactionItem[];
  party: Party | null;
}

export interface DayClosure {
  date: string;
  locked_at: string;
  opening_cash: number;
}

export interface AppState {
  business: Business;
  products: Product[];
  parties: Party[];
  transactions: Transaction[];
  transactionItems: TransactionItem[];
  payments: PaymentExpense[];
  dayClosures: DayClosure[];
}

export interface LedgerRow {
  id: string;
  date: string;
  kind: "bill" | "return" | "wasooli" | "payment" | "expense" | "purchase";
  title: string;
  subtitle: string;
  debit: number;
  credit: number;
  runningBalance: number;
  transaction?: TransactionWithItems;
  payment?: PaymentExpense;
}

export type ScanKind = "sale" | "purchase" | "return";
export type ScanConfidence = "high" | "medium" | "low";

export interface ScanItem {
  id: string;
  raw_scanned_name: string;
  matched_product_id: string | null;
  size: string;
  gauge: string;
  grade: string;
  shape: string;
  qty: number;
  unit: ProductUnit;
  rate: number;
  amount: number;
  confidence: number;
}

export interface ScanExtraction {
  parchi_number: string | null;
  party_name: string | null;
  detected_routing: RoutingMode;
  payment_mode: PaymentMode;
  items: ScanItem[];
  extra_charges: number;
  extra_charges_label: string;
  total_amount: number;
  scanned_total?: number;
  confidence_score: number;
  model_used: string;
  notes?: string;
}

export interface ScanResponse {
  success: boolean;
  data?: ScanExtraction;
  mock?: boolean;
  warning?: string;
  error?: string;
  model_used?: string;
}

export interface ScanDraft {
  id: string;
  imageUrl: string;
  fileName: string;
  status: "queued" | "processing" | "ready" | "error" | "saved";
  error?: string;
  extraction?: ScanExtraction;
  mock?: boolean;
  warning?: string;
  party_id?: string;
  paid_now?: number;
  originalSizeKB?: number;
  compressedSizeKB?: number;
}

export interface ReportRange {
  from: string;
  to: string;
  label: string;
}

export interface ReportData {
  range: ReportRange;
  generatedAt: string;
  totalSales: number;
  cashSales: number;
  udhaarSales: number;
  totalPurchases: number;
  totalReturns: number;
  totalWasooli: number;
  cashWasooli: number;
  totalExpenses: number;
  cashExpenses: number;
  openingCash: number;
  netCash: number;
  transactions: TransactionWithItems[];
  payments: PaymentExpense[];
  topSizes: Array<{ size: string; qty: number; amount: number }>;
  lowStock: Product[];
  deadStock: Product[];
  salesCount: number;
}
