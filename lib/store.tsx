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
import { createDemoState, DEMO_BUSINESS_ID } from "./demo-data";
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

interface StoreContextValue {
  state: AppState;
  hydrated: boolean;
  addProduct: (input: Omit<Product, "id" | "business_id" | "created_at">) => Product;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  addParty: (
    input: Omit<Party, "id" | "business_id" | "created_at" | "current_balance">,
  ) => Party;
  saveTransaction: (input: NewTransactionInput) => { transaction: Transaction };
  recordPayment: (input: NewPaymentInput) => PaymentExpense;
  closeDay: (date: string, openingCash: number) => void;
  reopenDay: (date: string) => void;
  isDayLocked: (date: string) => boolean;
  resetDemo: () => void;
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => createDemoState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
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
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Bill images can exhaust storage; the app stays usable in-memory.
    }
  }, [state, hydrated]);

  const addProduct = useCallback(
    (input: Omit<Product, "id" | "business_id" | "created_at">) => {
      const product: Product = {
        ...input,
        id: uid("prod"),
        business_id: DEMO_BUSINESS_ID,
        created_at: new Date().toISOString(),
      };
      setState((current) => ({ ...current, products: [product, ...current.products] }));
      return product;
    },
    [],
  );

  const updateProduct = useCallback((id: string, patch: Partial<Product>) => {
    setState((current) => ({
      ...current,
      products: current.products.map((product) =>
        product.id === id ? { ...product, ...patch } : product,
      ),
    }));
  }, []);

  const addParty = useCallback(
    (input: Omit<Party, "id" | "business_id" | "created_at" | "current_balance">) => {
      const party: Party = {
        ...input,
        id: uid("party"),
        business_id: DEMO_BUSINESS_ID,
        current_balance: 0,
        created_at: new Date().toISOString(),
      };
      setState((current) => ({ ...current, parties: [...current.parties, party] }));
      return party;
    },
    [],
  );

  const saveTransaction = useCallback((input: NewTransactionInput) => {
    const now = new Date();
    const transactionId = uid("txn");
    const transaction: Transaction = {
      id: transactionId,
      business_id: DEMO_BUSINESS_ID,
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
        return {
          ...product,
          current_stock: roundMoney(Math.max(0, nextStock)),
          last_sold_at:
            transaction.type === "sale" ? transaction.created_at : product.last_sold_at,
        };
      });

      const parties = current.parties.map((party) => {
        if (party.id !== transaction.party_id) return party;
        let balance = party.current_balance;
        const unpaid = Math.max(0, transaction.total_amount - transaction.paid_amount);

        if (transaction.type === "sale") {
          if (transaction.routing_mode === "customer_khata") balance += unpaid;
        }
        if (transaction.type === "sale_return") {
          if (party.type !== "walk_in_cash") {
            balance -= transaction.total_amount;
          }
        }
        if (transaction.type === "purchase") {
          if (party.type === "supplier" && transaction.payment_mode === "udhaar") {
            balance -= unpaid;
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
  }, []);

  const recordPayment = useCallback((input: NewPaymentInput) => {
    const payment: PaymentExpense = {
      ...input,
      id: uid("pay"),
      business_id: DEMO_BUSINESS_ID,
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
  }, []);

  const closeDay = useCallback((date: string, openingCash: number) => {
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
  }, []);

  const reopenDay = useCallback((date: string) => {
    setState((current) => ({
      ...current,
      dayClosures: current.dayClosures.filter((entry) => entry.date !== date),
      transactions: current.transactions.map((transaction) =>
        toDateKey(transaction.created_at) === date
          ? { ...transaction, is_day_locked: false }
          : transaction,
      ),
    }));
  }, []);

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
      addProduct,
      updateProduct,
      addParty,
      saveTransaction,
      recordPayment,
      closeDay,
      reopenDay,
      isDayLocked,
      resetDemo,
      getProduct,
      getParty,
    }),
    [
      state,
      hydrated,
      addProduct,
      updateProduct,
      addParty,
      saveTransaction,
      recordPayment,
      closeDay,
      reopenDay,
      isDayLocked,
      resetDemo,
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
