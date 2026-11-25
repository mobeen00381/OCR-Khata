import type {
  AppState,
  LedgerRow,
  Party,
  PaymentExpense,
  Product,
  ReportData,
  ReportRange,
  TransactionWithItems,
} from "./types";
import { addDays, daysAgo, formatDate, roundMoney, toDateKey } from "./utils";

export function hydrateTransactions(state: AppState): TransactionWithItems[] {
  return state.transactions
    .map((transaction) => ({
      ...transaction,
      items: state.transactionItems.filter((item) => item.transaction_id === transaction.id),
      party: state.parties.find((party) => party.id === transaction.party_id) ?? null,
    }))
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

export function transactionsForDate(state: AppState, dateKey: string) {
  return hydrateTransactions(state).filter(
    (transaction) => toDateKey(transaction.created_at) === dateKey,
  );
}

export function paymentsForDate(state: AppState, dateKey: string) {
  return state.payments
    .filter((payment) => toDateKey(payment.created_at) === dateKey)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

export function lowStockProducts(state: AppState) {
  return state.products
    .filter((product) => product.current_stock <= product.low_stock_alert)
    .sort((a, b) => a.current_stock - b.current_stock);
}

export function deadStockProducts(state: AppState) {
  return state.products
    .filter((product) => product.last_sold_at && daysAgo(product.last_sold_at) >= 30)
    .sort((a, b) => daysAgo(b.last_sold_at) - daysAgo(a.last_sold_at));
}

export interface TodayMetrics {
  totalSale: number;
  cashSales: number;
  udhaarSales: number;
  salesReturn: number;
  cashInGalla: number;
  cashWasooli: number;
  cashExpenses: number;
  udhaarGiven: number;
  lowStock: Product[];
  deadStock: Product[];
  billsToday: number;
  itemsSold: number;
}

export function getDayMetrics(state: AppState, dateKey = toDateKey()): TodayMetrics {
  const txns = transactionsForDate(state, dateKey);
  const payments = paymentsForDate(state, dateKey);
  const sales = txns.filter((transaction) => transaction.type === "sale");
  const returns = txns.filter((transaction) => transaction.type === "sale_return");
  const totalSale = sales.reduce((sum, transaction) => sum + transaction.total_amount, 0);
  const cashSales = sales.reduce((sum, transaction) => sum + transaction.paid_amount, 0);
  const udhaarSales = sales.reduce(
    (sum, transaction) =>
      sum + Math.max(0, transaction.total_amount - transaction.paid_amount),
    0,
  );
  const salesReturn = returns.reduce((sum, transaction) => sum + transaction.total_amount, 0);
  const cashWasooli = payments
    .filter(
      (payment) =>
        payment.entry_type === "customer_wasooli" && payment.payment_mode === "cash",
    )
    .reduce((sum, payment) => sum + payment.amount, 0);
  const cashExpenses = payments
    .filter(
      (payment) => payment.entry_type === "shop_expense" && payment.payment_mode === "cash",
    )
    .reduce((sum, payment) => sum + payment.amount, 0);
  const itemsSold = sales.reduce(
    (sum, transaction) =>
      sum + transaction.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );

  return {
    totalSale: roundMoney(totalSale),
    cashSales: roundMoney(cashSales),
    udhaarSales: roundMoney(udhaarSales),
    salesReturn: roundMoney(salesReturn),
    cashInGalla: roundMoney(cashSales + cashWasooli - cashExpenses),
    cashWasooli: roundMoney(cashWasooli),
    cashExpenses: roundMoney(cashExpenses),
    udhaarGiven: roundMoney(
      sales
        .filter((transaction) => transaction.routing_mode === "customer_khata")
        .reduce(
          (sum, transaction) =>
            sum + Math.max(0, transaction.total_amount - transaction.paid_amount),
          0,
        ),
    ),
    lowStock: lowStockProducts(state),
    deadStock: deadStockProducts(state),
    billsToday: sales.length,
    itemsSold,
  };
}

export function getWeeklySales(state: AppState) {
  const txns = hydrateTransactions(state);
  const days = [];
  for (let index = 6; index >= 0; index -= 1) {
    const date = addDays(new Date(), -index);
    const key = toDateKey(date);
    const amount = txns
      .filter(
        (transaction) =>
          toDateKey(transaction.created_at) === key && transaction.type === "sale",
      )
      .reduce((sum, transaction) => sum + transaction.total_amount, 0);
    days.push({
      key,
      label: new Intl.DateTimeFormat("en-PK", { weekday: "short" }).format(date).slice(0, 2),
      amount,
    });
  }
  return days;
}

export function getLedger(state: AppState, partyId: string) {
  const party = state.parties.find((entry) => entry.id === partyId);
  if (!party) return { party: null, rows: [] as LedgerRow[] };

  const txns = hydrateTransactions(state).filter(
    (transaction) => transaction.party_id === partyId,
  );
  const payments = state.payments
    .filter((payment) => payment.party_id === partyId)
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

  const entries = [
    ...txns.map((transaction) => ({
      date: transaction.created_at,
      transaction,
      payment: undefined as PaymentExpense | undefined,
    })),
    ...payments.map((payment) => ({
      date: payment.created_at,
      transaction: undefined as TransactionWithItems | undefined,
      payment,
    })),
  ].sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const deltas = entries.map(({ transaction, payment }) => {
    if (transaction) {
      if (transaction.type === "sale") return transaction.total_amount;
      if (transaction.type === "sale_return") return -transaction.total_amount;
      if (transaction.type === "purchase") return -transaction.total_amount;
      return 0;
    }
    if (payment) {
      if (payment.entry_type === "customer_wasooli") return -payment.amount;
      if (payment.entry_type === "supplier_payment") return payment.amount;
      return 0;
    }
    return 0;
  });

  const totalDelta = deltas.reduce((sum, delta) => sum + delta, 0);
  let running = roundMoney(party.current_balance - totalDelta);

  const rows: LedgerRow[] = entries.map((entry, index) => {
    const delta = deltas[index];
    running = roundMoney(running + delta);

    if (entry.transaction) {
      const transaction = entry.transaction;
      const isReturn = transaction.type === "sale_return";
      const isPurchase = transaction.type === "purchase";
      return {
        id: transaction.id,
        date: transaction.created_at,
        kind: isReturn ? "return" : isPurchase ? "purchase" : "bill",
        title: isReturn
          ? `Maal Wapsi · ${transaction.parchi_number || "No parchi"}`
          : isPurchase
            ? `Purchase bill · ${transaction.parchi_number || "No parchi"}`
            : `Sales bill · ${transaction.parchi_number || "No parchi"}`,
        subtitle: `${transaction.items.length} item${transaction.items.length === 1 ? "" : "s"} · ${
          transaction.payment_mode === "udhaar" ? "Udhaar" : "Cash"
        }`,
        debit: isReturn ? 0 : transaction.total_amount,
        credit: isReturn ? transaction.total_amount : 0,
        runningBalance: running,
        transaction,
      };
    }

    const payment = entry.payment as PaymentExpense;
    return {
      id: payment.id,
      date: payment.created_at,
      kind: payment.entry_type === "customer_wasooli" ? "wasooli" : "payment",
      title:
        payment.entry_type === "customer_wasooli"
          ? "Wasooli received"
          : payment.entry_type === "supplier_payment"
            ? "Supplier payment"
            : "Shop expense",
      subtitle: payment.description,
      debit: payment.entry_type === "supplier_payment" ? payment.amount : 0,
      credit: payment.entry_type === "customer_wasooli" ? payment.amount : 0,
      runningBalance: running,
      payment,
    };
  });

  return { party, rows: rows.reverse() };
}

export function partyStatementTotals(state: AppState, partyId: string) {
  const txns = state.transactions.filter((transaction) => transaction.party_id === partyId);
  const payments = state.payments.filter((payment) => payment.party_id === partyId);
  return {
    totalBilled: roundMoney(
      txns
        .filter((transaction) => transaction.type === "sale")
        .reduce((sum, transaction) => sum + transaction.total_amount, 0),
    ),
    totalReturned: roundMoney(
      txns
        .filter((transaction) => transaction.type === "sale_return")
        .reduce((sum, transaction) => sum + transaction.total_amount, 0),
    ),
    totalRecovered: roundMoney(
      payments
        .filter((payment) => payment.entry_type === "customer_wasooli")
        .reduce((sum, payment) => sum + payment.amount, 0),
    ),
  };
}

export interface RangePreset {
  id: "today" | "yesterday" | "week" | "custom";
  label: string;
  from: string;
  to: string;
  description: string;
}

export function getRangePreset(id: RangePreset["id"]): RangePreset {
  const today = toDateKey();
  if (id === "yesterday") {
    const yesterday = toDateKey(addDays(new Date(), -1));
    return { id, label: "Yesterday", from: yesterday, to: yesterday, description: formatDate(yesterday, "long") };
  }
  if (id === "week") {
    const from = toDateKey(addDays(new Date(), -6));
    return { id, label: "This Week", from, to: today, description: `${formatDate(from)} → ${formatDate(today)}` };
  }
  if (id === "custom") {
    return { id, label: "Custom Range", from: today, to: today, description: "Choose your own dates" };
  }
  return { id, label: "Today", from: today, to: today, description: formatDate(today, "long") };
}

export function buildReport(
  state: AppState,
  range: ReportRange,
  openingCash: number,
): ReportData {
  const all = hydrateTransactions(state);
  const txns = all.filter((transaction) => {
    const key = toDateKey(transaction.created_at);
    return key >= range.from && key <= range.to;
  });
  const payments = state.payments
    .filter((payment) => {
      const key = toDateKey(payment.created_at);
      return key >= range.from && key <= range.to;
    })
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  const sales = txns.filter((transaction) => transaction.type === "sale");
  const returns = txns.filter((transaction) => transaction.type === "sale_return");
  const purchases = txns.filter((transaction) => transaction.type === "purchase");
  const cashSales = sales.reduce((sum, transaction) => sum + transaction.paid_amount, 0);
  const udhaarSales = sales.reduce(
    (sum, transaction) =>
      sum + Math.max(0, transaction.total_amount - transaction.paid_amount),
    0,
  );
  const cashWasooli = payments
    .filter(
      (payment) =>
        payment.entry_type === "customer_wasooli" && payment.payment_mode === "cash",
    )
    .reduce((sum, payment) => sum + payment.amount, 0);
  const cashExpenses = payments
    .filter(
      (payment) => payment.entry_type === "shop_expense" && payment.payment_mode === "cash",
    )
    .reduce((sum, payment) => sum + payment.amount, 0);

  const sizes = new Map<string, { qty: number; amount: number }>();
  sales.forEach((transaction) => {
    transaction.items.forEach((item) => {
      const product = state.products.find((entry) => entry.id === item.product_id);
      const size = product?.attributes.size || "Other";
      const current = sizes.get(size) || { qty: 0, amount: 0 };
      sizes.set(size, {
        qty: current.qty + item.quantity,
        amount: current.amount + item.amount,
      });
    });
  });

  return {
    range,
    generatedAt: new Date().toISOString(),
    totalSales: roundMoney(sales.reduce((sum, transaction) => sum + transaction.total_amount, 0)),
    cashSales: roundMoney(cashSales),
    udhaarSales: roundMoney(udhaarSales),
    totalPurchases: roundMoney(
      purchases.reduce((sum, transaction) => sum + transaction.total_amount, 0),
    ),
    totalReturns: roundMoney(
      returns.reduce((sum, transaction) => sum + transaction.total_amount, 0),
    ),
    totalWasooli: roundMoney(
      payments
        .filter((payment) => payment.entry_type === "customer_wasooli")
        .reduce((sum, payment) => sum + payment.amount, 0),
    ),
    cashWasooli: roundMoney(cashWasooli),
    totalExpenses: roundMoney(
      payments
        .filter((payment) => payment.entry_type === "shop_expense")
        .reduce((sum, payment) => sum + payment.amount, 0),
    ),
    cashExpenses: roundMoney(cashExpenses),
    openingCash: roundMoney(openingCash),
    netCash: roundMoney(openingCash + cashSales + cashWasooli - cashExpenses),
    transactions: txns,
    payments,
    topSizes: [...sizes.entries()]
      .map(([size, value]) => ({ size, ...value }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
    lowStock: lowStockProducts(state),
    deadStock: deadStockProducts(state),
    salesCount: sales.length,
  };
}

export function findPartyByName(parties: Party[], name: string): Party | undefined {
  const query = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!query) return undefined;
  return parties.find((party) => {
    const haystack = `${party.name} ${party.area_or_shop}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    return haystack.includes(query) || query.includes(party.name.toLowerCase());
  });
}
