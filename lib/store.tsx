"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createDemoState } from "./demo-data";
import type {
  AppState,
  DayClosure,
  Party,
  PaymentExpense,
  PaymentMode,
  Product,
  ProductUnit,
  RoutingMode,
  Transaction,
  TransactionItem,
  TransactionType,
} from "./types";
import { roundMoney, toDateKey, uid } from "./utils";

const STORAGE_KEY = "steelkhata-ai-state-v2";

export type DataMode = "checking" | "local" | "supabase";

export interface NewTransactionItem {
  product_id: string;
  raw_scanned_name: string;
  quantity: number;
  unit: ProductUnit;
  rate: number;
  amount: number;
}

export interface NewTransactionInput {
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
  notes?: string;
  items: NewTransactionItem[];
}

export interface NewPaymentInput {
  party_id: string | null;
  entry_type: PaymentExpense["entry_type"];
  description: string;
  amount: number;
  payment_mode: PaymentMode;
}

interface WorkspaceResponse {
  success?: boolean;
  configured?: boolean;
  empty?: boolean;
  businessId?: string | null;
  state?: AppState | null;
  error?: string;
  warning?: string;
  transactionId?: string;
  product?: Product;
  party?: Party;
}

interface StoreContextValue {
  state: AppState;
  hydrated: boolean;
  dataMode: DataMode;
  remoteConfigured: boolean;
  remoteEmpty: boolean;
  remoteBusinessId: string | null;
  remoteError: string | null;
  syncWarning: string | null;
  addProduct: (
    input: Omit<Product, "id" | "business_id" | "created_at">,
  ) => Promise<Product>;
  updateProduct: (id: string, patch: Partial<Product>) => Promise<void>;
  addParty: (
    input: Omit<Party, "id" | "business_id" | "created_at" | "current_balance">,
  ) => Promise<Party>;
  saveTransaction: (
    input: NewTransactionInput,
  ) => Promise<{ transaction: Transaction; warning?: string }>;
  recordPayment: (input: NewPaymentInput) => Promise<PaymentExpense>;
  closeDay: (date: string, openingCash: number) => Promise<void>;
  reopenDay: (date: string) => Promise<void>;
  isDayLocked: (date: string) => boolean;
  reloadRemote: () => Promise<void>;
  seedRemoteDemo: () => Promise<void>;
  resetDemo: () => void;
  clearSyncWarning: () => void;
  getProduct: (id: string) => Product | undefined;
  getParty: (id: string) => Party | undefined;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function readStoredState(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed?.business?.id || !Array.isArray(parsed.products)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function aliasOf(raw: string) {
  return raw.toLowerCase().trim().replace(/\s+/g, " ");
}

function learnAliases(product: Product, rawNames: string[]): Product {
  const existing = new Set(product.aliases.map((alias) => aliasOf(alias)));
  const next = [...product.aliases];
  for (const raw of rawNames) {
    const alias = aliasOf(raw);
    if (!alias || existing.has(alias)) continue;
    existing.add(alias);
    next.push(alias);
  }
  return next.length === product.aliases.length ? product : { ...product, aliases: next };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => createDemoState());
  const [hydrated, setHydrated] = useState(false);
  const [dataMode, setDataMode] = useState<DataMode>("checking");
  const [remoteConfigured, setRemoteConfigured] = useState(false);
  const [remoteEmpty, setRemoteEmpty] = useState(false);
  const [remoteBusinessId, setRemoteBusinessId] = useState<string | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  const postWorkspace = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      let response: Response;
      try {
        response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, payload }),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Network request failed.";
        setRemoteError(`Cloud write failed: ${message}`);
        throw new Error(`Cloud write failed: ${message}`);
      }
      let json: WorkspaceResponse;
      try {
        json = (await response.json()) as WorkspaceResponse;
      } catch {
        const error = new Error("Cloud workspace returned an invalid response.");
        setRemoteError(error.message);
        throw error;
      }
      if (!response.ok || json.success === false) {
        const error = new Error(json.error || "Supabase workspace request failed.");
        if (response.status >= 500) setRemoteError(error.message);
        throw error;
      }
      if (json.state) setState(json.state);
      if (json.warning) setSyncWarning(json.warning);
      setRemoteError(null);
      return json;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const stored = readStoredState();
    if (stored) {
      setState({
        business: stored.business,
        products: stored.products,
        parties: stored.parties,
        transactions: stored.transactions,
        transactionItems: stored.transactionItems ?? [],
        payments: stored.payments ?? [],
        dayClosures: stored.dayClosures ?? [],
      });
    }

    async function hydrate() {
      try {
        const response = await fetch("/api/workspace", {
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });
        const json = (await response.json()) as WorkspaceResponse;
        if (cancelled) return;

        setRemoteConfigured(Boolean(json.configured));
        setRemoteBusinessId(json.businessId || null);
        if (!json.configured) {
          setDataMode("local");
        } else if (json.state) {
          setState(json.state);
          setDataMode("supabase");
          setRemoteEmpty(false);
          setRemoteError(null);
        } else if (json.empty) {
          setDataMode("supabase");
          setRemoteEmpty(true);
          setRemoteError(json.error || null);
        } else {
          setDataMode("supabase");
          setRemoteError(json.error || "Supabase returned no workspace state.");
        }
      } catch (error) {
        if (cancelled) return;
        const likelyConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
        setDataMode(likelyConfigured ? "supabase" : "local");
        setRemoteConfigured(likelyConfigured);
        setRemoteError(
          `${
            likelyConfigured ? "Cloud workspace unavailable" : "Local cache active"
          }: ${error instanceof Error ? error.message : "network error"}`,
        );
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Bill images can exhaust localStorage; the app stays usable in-memory.
    }
  }, [state, hydrated]);

  const addProduct = useCallback(
    async (input: Omit<Product, "id" | "business_id" | "created_at">) => {
      if (remoteConfigured && dataMode === "supabase") {
        if (remoteEmpty) throw new Error("Load Demo Shop Data before adding products.");
        const json = await postWorkspace("add_product", { product: input });
        if (!json.product) throw new Error("Supabase did not return the new product.");
        return json.product;
      }

      const product: Product = {
        ...input,
        id: uid("prod"),
        business_id: state.business.id,
        created_at: new Date().toISOString(),
      };
      setState((current) => ({ ...current, products: [product, ...current.products] }));
      return product;
    },
    [dataMode, postWorkspace, remoteConfigured, remoteEmpty, state.business.id],
  );

  const updateProduct = useCallback(
    async (id: string, patch: Partial<Product>) => {
      const existing = state.products.find((product) => product.id === id);
      if (!existing) throw new Error("Product not found.");
      const next = { ...existing, ...patch };

      if (remoteConfigured && dataMode === "supabase") {
        await postWorkspace("update_product", { product: next });
        return;
      }

      setState((current) => ({
        ...current,
        products: current.products.map((product) =>
          product.id === id ? { ...product, ...patch } : product,
        ),
      }));
    },
    [dataMode, postWorkspace, remoteConfigured, state.products],
  );

  const addParty = useCallback(
    async (
      input: Omit<Party, "id" | "business_id" | "created_at" | "current_balance">,
    ) => {
      if (remoteConfigured && dataMode === "supabase") {
        if (remoteEmpty) throw new Error("Load Demo Shop Data before adding khatay.");
        const json = await postWorkspace("add_party", { party: input });
        if (!json.party) throw new Error("Supabase did not return the new party.");
        return json.party;
      }

      const party: Party = {
        ...input,
        id: uid("party"),
        business_id: state.business.id,
        current_balance: 0,
        created_at: new Date().toISOString(),
      };
      setState((current) => ({ ...current, parties: [...current.parties, party] }));
      return party;
    },
    [dataMode, postWorkspace, remoteConfigured, remoteEmpty, state.business.id],
  );

  const saveTransaction = useCallback(
    async (input: NewTransactionInput) => {
      if (remoteConfigured && dataMode === "supabase") {
        if (remoteEmpty) {
          throw new Error("Load Demo Shop Data before saving transactions.");
        }
        const json = await postWorkspace("save_transaction", {
          ...input,
          billImageDataUrl: input.bill_image_url,
        });
        const transaction = json.state?.transactions.find(
          (entry) => entry.id === json.transactionId,
        );
        if (!transaction) {
          throw new Error("Transaction was saved but could not be read back.");
        }
        if (json.warning) setSyncWarning(json.warning);
        return { transaction, warning: json.warning };
      }

      const now = new Date();
      const transactionId = uid("txn");
      const transaction: Transaction = {
        id: transactionId,
        business_id: state.business.id,
        party_id: input.party_id,
        parchi_number: input.parchi_number,
        type: input.type,
        routing_mode: input.routing_mode,
        payment_mode: input.payment_mode,
        subtotal: roundMoney(input.subtotal),
        extra_charges: roundMoney(input.extra_charges),
        total_amount: roundMoney(input.total_amount),
        paid_amount: roundMoney(input.paid_amount),
        bill_image_url: input.bill_image_url,
        is_day_locked: false,
        created_at: now.toISOString(),
        notes: input.notes,
      };

      const newItems: TransactionItem[] = input.items.map((line) => ({
        id: uid("item"),
        transaction_id: transactionId,
        product_id: line.product_id,
        raw_scanned_name: line.raw_scanned_name,
        quantity: line.quantity,
        unit: line.unit,
        rate: line.rate,
        amount: roundMoney(line.amount),
      }));

      setState((current) => {
        const products = current.products.map((product) => {
          const matchingLines = newItems.filter((line) => line.product_id === product.id);
          if (!matchingLines.length) return product;
          const qty = matchingLines.reduce((sum, line) => sum + line.quantity, 0);
          let nextStock = product.current_stock;
          if (transaction.type === "sale") nextStock -= qty;
          if (transaction.type === "purchase") nextStock += qty;
          if (transaction.type === "sale_return") nextStock += qty;
          const nextProduct: Product = {
            ...product,
            current_stock: roundMoney(Math.max(0, nextStock)),
            last_sold_at:
              transaction.type === "sale" ? transaction.created_at : product.last_sold_at,
          };
          return learnAliases(
            nextProduct,
            matchingLines.map((line) => line.raw_scanned_name),
          );
        });

        const parties = current.parties.map((party) => {
          if (party.id !== transaction.party_id) return party;
          let balance = party.current_balance;

          if (transaction.type === "sale") {
            if (transaction.routing_mode === "customer_khata") {
              balance += transaction.total_amount;
            }
          }
          if (transaction.type === "sale_return") {
            if (party.type !== "walk_in_cash") {
              balance -= transaction.total_amount;
            }
          }

          return { ...party, current_balance: roundMoney(balance) };
        });

        return {
          ...current,
          products,
          parties,
          transactions: [transaction, ...current.transactions],
          transactionItems: [...newItems, ...current.transactionItems],
        };
      });

      return { transaction };
    },
    [dataMode, postWorkspace, remoteConfigured, remoteEmpty, state.business.id],
  );

  const recordPayment = useCallback(
    async (input: NewPaymentInput) => {
      if (remoteConfigured && dataMode === "supabase") {
        if (remoteEmpty) throw new Error("Load Demo Shop Data before recording payments.");
        await postWorkspace("record_payment", { payment: input });
        const now = new Date().toISOString();
        return {
          ...input,
          id: uid("pay"),
          business_id: state.business.id,
          amount: roundMoney(input.amount),
          created_at: now,
        } as PaymentExpense;
      }

      const payment: PaymentExpense = {
        ...input,
        id: uid("pay"),
        business_id: state.business.id,
        amount: roundMoney(input.amount),
        created_at: new Date().toISOString(),
      };

      setState((current) => {
        const parties = current.parties.map((party) => {
          if (!input.party_id || party.id !== input.party_id) return party;
          let balance = party.current_balance;
          if (input.entry_type === "customer_wasooli") balance -= input.amount;
          if (input.entry_type === "supplier_payment") balance += input.amount;
          return { ...party, current_balance: roundMoney(balance) };
        });
        return {
          ...current,
          parties,
          payments: [payment, ...current.payments],
        };
      });

      return payment;
    },
    [dataMode, postWorkspace, remoteConfigured, remoteEmpty, state.business.id],
  );

  const closeDay = useCallback(
    async (date: string, openingCash: number) => {
      if (remoteConfigured && dataMode === "supabase") {
        await postWorkspace("close_day", { date, opening_cash: openingCash });
        return;
      }

      const closure: DayClosure = {
        date,
        locked_at: new Date().toISOString(),
        opening_cash: openingCash,
      };
      setState((current) => {
        const withoutDate = current.dayClosures.filter((entry) => entry.date !== date);
        return {
          ...current,
          dayClosures: [closure, ...withoutDate],
          transactions: current.transactions.map((transaction) =>
            toDateKey(transaction.created_at) === date
              ? { ...transaction, is_day_locked: true }
              : transaction,
          ),
        };
      });
    },
    [dataMode, postWorkspace, remoteConfigured],
  );

  const reopenDay = useCallback(
    async (date: string) => {
      if (remoteConfigured && dataMode === "supabase") {
        await postWorkspace("reopen_day", { date });
        return;
      }

      setState((current) => ({
        ...current,
        dayClosures: current.dayClosures.filter((entry) => entry.date !== date),
        transactions: current.transactions.map((transaction) =>
          toDateKey(transaction.created_at) === date
            ? { ...transaction, is_day_locked: false }
            : transaction,
        ),
      }));
    },
    [dataMode, postWorkspace, remoteConfigured],
  );

  const reloadRemote = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const json = (await response.json()) as WorkspaceResponse;
    setRemoteConfigured(Boolean(json.configured));
    setRemoteBusinessId(json.businessId || null);
    if (!json.configured) {
      setDataMode("local");
      setRemoteError(null);
      return;
    }
    if (json.state) {
      setState(json.state);
      setDataMode("supabase");
      setRemoteEmpty(false);
      setRemoteError(null);
      return;
    }
    if (json.empty) setRemoteEmpty(true);
    setDataMode("supabase");
    setRemoteError(json.error || null);
  }, []);

  const seedRemoteDemo = useCallback(async () => {
    const json = await postWorkspace("seed_demo", {});
    if (!json.state) throw new Error("Demo data was not returned by Supabase.");
    setState(json.state);
    setDataMode("supabase");
    setRemoteEmpty(false);
    setRemoteError(null);
    if (json.businessId) setRemoteBusinessId(json.businessId);
  }, [postWorkspace]);

  const isDayLocked = useCallback(
    (date: string) => state.dayClosures.some((entry) => entry.date === date),
    [state.dayClosures],
  );

  const resetDemo = useCallback(() => {
    setState(createDemoState());
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const clearSyncWarning = useCallback(() => setSyncWarning(null), []);

  const getProduct = useCallback(
    (id: string) => state.products.find((product) => product.id === id),
    [state.products],
  );

  const getParty = useCallback(
    (id: string) => state.parties.find((party) => party.id === id),
    [state.parties],
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      state,
      hydrated,
      dataMode,
      remoteConfigured,
      remoteEmpty,
      remoteBusinessId,
      remoteError,
      syncWarning,
      addProduct,
      updateProduct,
      addParty,
      saveTransaction,
      recordPayment,
      closeDay,
      reopenDay,
      isDayLocked,
      reloadRemote,
      seedRemoteDemo,
      resetDemo,
      clearSyncWarning,
      getProduct,
      getParty,
    }),
    [
      state,
      hydrated,
      dataMode,
      remoteConfigured,
      remoteEmpty,
      remoteBusinessId,
      remoteError,
      syncWarning,
      addProduct,
      updateProduct,
      addParty,
      saveTransaction,
      recordPayment,
      closeDay,
      reopenDay,
      isDayLocked,
      reloadRemote,
      seedRemoteDemo,
      resetDemo,
      clearSyncWarning,
      getProduct,
      getParty,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
