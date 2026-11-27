import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDemoState, DEMO_BUSINESS_ID } from "@/lib/demo-data";
import type {
  AppState,
  Business,
  DayClosure,
  Party,
  PaymentExpense,
  Product,
  ProductUnit,
  Transaction,
  TransactionItem,
  TransactionType,
} from "@/lib/types";
import { BILL_IMAGE_BUCKET } from "./server";

export interface WorkspaceSnapshot {
  businessId: string;
  state: AppState;
}

export interface RemoteTransactionInput {
  party_id: string;
  parchi_number: string | null;
  type: TransactionType;
  routing_mode: "cash_sale" | "customer_khata";
  payment_mode: "cash" | "udhaar" | "bank";
  subtotal: number;
  extra_charges: number;
  total_amount: number;
  paid_amount: number;
  billImageDataUrl: string | null;
  notes?: string;
  items: Array<{
    product_id: string;
    raw_scanned_name: string;
    quantity: number;
    unit: ProductUnit;
    rate: number;
    amount: number;
  }>;
}

type Row = Record<string, unknown>;

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function iso(value: unknown, fallback = new Date().toISOString()) {
  return typeof value === "string" && value ? value : fallback;
}

function raise(
  prefix: string,
  error: { message?: string; details?: string } | null,
): never {
  throw new Error(
    `${prefix}${error?.message ? `: ${error.message}` : ""}${
      error?.details ? ` (${error.details})` : ""
    }`,
  );
}

export async function findActiveBusiness(
  client: SupabaseClient,
): Promise<Row | null> {
  const configuredId = process.env.STEELKHATA_BUSINESS_ID?.trim();
  let query = client.from("businesses").select("*");
  if (configuredId) {
    query = query.eq("id", configuredId);
  } else {
    query = query.order("created_at", { ascending: true }).limit(1);
  }
  const { data, error } = await query.maybeSingle();
  if (error) raise("Could not read business", error);
  return (data as Row | null) ?? null;
}

export async function loadWorkspaceState(
  client: SupabaseClient,
  businessId?: string,
): Promise<WorkspaceSnapshot | null> {
  let business: Row | null;
  if (businessId) {
    const result = await client
      .from("businesses")
      .select("*")
      .eq("id", businessId)
      .maybeSingle();
    if (result.error) raise("Could not read business", result.error);
    business = (result.data as Row | null) ?? null;
  } else {
    business = await findActiveBusiness(client);
  }
  if (!business) return null;

  const id = String(business.id);
  const [products, parties, transactions, items, payments, closures] =
    await Promise.all([
      client.from("products").select("*").eq("business_id", id).order("created_at"),
      client.from("parties").select("*").eq("business_id", id).order("created_at"),
      client
        .from("transactions")
        .select("*")
        .eq("business_id", id)
        .order("created_at", { ascending: false }),
      client.from("transaction_items").select("*").eq("business_id", id),
      client
        .from("payments_and_expenses")
        .select("*")
        .eq("business_id", id)
        .order("created_at", { ascending: false }),
      client.from("day_closures").select("*").eq("business_id", id),
    ]);

  for (const result of [products, parties, transactions, items, payments, closures]) {
    if (result.error) raise("Could not load workspace", result.error);
  }

  const mappedBusiness: Business = {
    id,
    owner_id: text(business.owner_id),
    business_name: text(business.business_name, "SteelKhata workspace"),
    niche: (text(business.niche, "steel_pipes") as Business["niche"]) || "steel_pipes",
    phone: text(business.phone),
    city: text(business.city),
    created_at: iso(business.created_at),
  };

  const mappedProducts: Product[] = (products.data || []).map((raw) => {
    const row = raw as Row;
    return {
      id: String(row.id),
      business_id: id,
      name: text(row.name),
      sku_code: text(row.sku_code),
      unit: (text(row.unit, "length") as ProductUnit) || "length",
      weight_per_length:
        row.weight_per_length === null || row.weight_per_length === undefined
          ? null
          : num(row.weight_per_length),
      current_stock: num(row.current_stock),
      low_stock_alert: num(row.low_stock_alert),
      purchase_rate: num(row.purchase_rate),
      sale_rate: num(row.sale_rate),
      attributes:
        row.attributes && typeof row.attributes === "object"
          ? (row.attributes as Product["attributes"])
          : {},
      aliases: Array.isArray(row.aliases)
        ? (row.aliases as unknown[]).map((alias) => String(alias))
        : [],
      last_sold_at: row.last_sold_at ? iso(row.last_sold_at) : null,
      created_at: iso(row.created_at),
    };
  });

  const mappedParties: Party[] = (parties.data || []).map((raw) => {
    const row = raw as Row;
    return {
      id: String(row.id),
      business_id: id,
      name: text(row.name),
      area_or_shop: text(row.area_or_shop),
      phone: text(row.phone),
      type: (text(row.type, "customer") as Party["type"]) || "customer",
      current_balance: num(row.current_balance),
      created_at: iso(row.created_at),
    };
  });

  const mappedTransactions: Transaction[] = (transactions.data || []).map((raw) => {
    const row = raw as Row;
    return {
      id: String(row.id),
      business_id: id,
      party_id: String(row.party_id),
      parchi_number: row.parchi_number === null ? null : text(row.parchi_number),
      type: (text(row.type, "sale") as TransactionType) || "sale",
      routing_mode:
        (text(row.routing_mode, "cash_sale") as Transaction["routing_mode"]) ||
        "cash_sale",
      payment_mode:
        (text(row.payment_mode, "cash") as Transaction["payment_mode"]) || "cash",
      subtotal: num(row.subtotal),
      extra_charges: num(row.extra_charges),
      total_amount: num(row.total_amount),
      paid_amount: num(row.paid_amount),
      bill_image_url: row.bill_image_url ? text(row.bill_image_url) : null,
      is_day_locked: Boolean(row.is_day_locked),
      created_at: iso(row.created_at),
      notes: row.notes ? text(row.notes) : undefined,
    };
  });

  const mappedItems: TransactionItem[] = (items.data || []).map((raw) => {
    const row = raw as Row;
    return {
      id: String(row.id),
      transaction_id: String(row.transaction_id),
      product_id: String(row.product_id),
      raw_scanned_name: text(row.raw_scanned_name),
      quantity: num(row.quantity),
      unit: (text(row.unit, "length") as ProductUnit) || "length",
      rate: num(row.rate),
      amount: num(row.amount),
    };
  });

  const mappedPayments: PaymentExpense[] = (payments.data || []).map((raw) => {
    const row = raw as Row;
    return {
      id: String(row.id),
      business_id: id,
      party_id: row.party_id ? String(row.party_id) : null,
      entry_type:
        (text(row.entry_type, "shop_expense") as PaymentExpense["entry_type"]) ||
        "shop_expense",
      description: text(row.description),
      amount: num(row.amount),
      payment_mode:
        (text(row.payment_mode, "cash") as PaymentExpense["payment_mode"]) || "cash",
      created_at: iso(row.created_at),
    };
  });

  const mappedClosures: DayClosure[] = (closures.data || []).map((raw) => {
    const row = raw as Row;
    return {
      date: text(row.closing_date),
      locked_at: iso(row.locked_at),
      opening_cash: num(row.opening_cash),
    };
  });

  return {
    businessId: id,
    state: {
      business: mappedBusiness,
      products: mappedProducts,
      parties: mappedParties,
      transactions: mappedTransactions,
      transactionItems: mappedItems,
      payments: mappedPayments,
      dayClosures: mappedClosures,
    },
  };
}

async function resolveOwnerId(client: SupabaseClient) {
  const configured = process.env.STEELKHATA_OWNER_ID?.trim();
  if (configured) return configured;

  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) {
    raise(
      "Cannot read Supabase auth users. Create an owner or set STEELKHATA_OWNER_ID",
      error,
    );
  }
  if (data.users[0]) return data.users[0].id;

  const { data: created, error: createError } = await client.auth.admin.createUser({
    email: `demo-owner-${Date.now()}@steelkhata.local`,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: "Malik Sahib", steelkhata_demo: true },
  });
  if (createError || !created.user) {
    raise("Could not create the demo owner account", createError);
  }
  return created.user.id;
}

export async function seedDemoWorkspace(
  client: SupabaseClient,
): Promise<WorkspaceSnapshot> {
  let business = await findActiveBusiness(client);
  let businessId = business ? String(business.id) : "";

  if (businessId) {
    const { count, error } = await client
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId);
    if (error) raise("Could not inspect workspace", error);
    if ((count || 0) > 0) {
      const snapshot = await loadWorkspaceState(client, businessId);
      if (!snapshot) throw new Error("Workspace could not be loaded.");
      return snapshot;
    }
  } else {
    const ownerId = await resolveOwnerId(client);
    const demo = createDemoState();
    businessId = process.env.STEELKHATA_BUSINESS_ID?.trim() || DEMO_BUSINESS_ID;
    const { error } = await client.from("businesses").insert({
      id: businessId,
      owner_id: ownerId,
      business_name: demo.business.business_name,
      niche: demo.business.niche,
      phone: demo.business.phone,
      city: demo.business.city,
      created_at: demo.business.created_at,
    });
    if (error) raise("Could not create demo business", error);
    business = { id: businessId };
  }

  const demo = createDemoState();
  const productIds = new Map(demo.products.map((product) => [product.id, randomUUID()]));
  const partyIds = new Map(demo.parties.map((party) => [party.id, randomUUID()]));
  const transactionIds = new Map(
    demo.transactions.map((transaction) => [transaction.id, randomUUID()]),
  );

  const productRows = demo.products.map((product) => ({
    id: productIds.get(product.id),
    business_id: businessId,
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
    created_at: product.created_at,
  }));
  const partyRows = demo.parties.map((party) => ({
    id: partyIds.get(party.id),
    business_id: businessId,
    name: party.name,
    area_or_shop: party.area_or_shop,
    phone: party.phone,
    type: party.type,
    current_balance: party.current_balance,
    created_at: party.created_at,
  }));
  const transactionRows = demo.transactions.map((transaction) => ({
    id: transactionIds.get(transaction.id),
    business_id: businessId,
    party_id: partyIds.get(transaction.party_id),
    parchi_number: transaction.parchi_number,
    type: transaction.type,
    routing_mode: transaction.routing_mode,
    payment_mode: transaction.payment_mode,
    subtotal: transaction.subtotal,
    extra_charges: transaction.extra_charges,
    total_amount: transaction.total_amount,
    paid_amount: transaction.paid_amount,
    bill_image_url: transaction.bill_image_url,
    is_day_locked: false,
    created_at: transaction.created_at,
    notes: transaction.notes,
  }));
  const itemRows = demo.transactionItems.map((item) => ({
    id: randomUUID(),
    business_id: businessId,
    transaction_id: transactionIds.get(item.transaction_id),
    product_id: productIds.get(item.product_id),
    raw_scanned_name: item.raw_scanned_name,
    quantity: item.quantity,
    unit: item.unit,
    rate: item.rate,
    amount: item.amount,
  }));
  const paymentRows = demo.payments.map((payment) => ({
    id: randomUUID(),
    business_id: businessId,
    party_id: payment.party_id ? partyIds.get(payment.party_id) : null,
    entry_type: payment.entry_type,
    description: payment.description,
    amount: payment.amount,
    payment_mode: payment.payment_mode,
    created_at: payment.created_at,
  }));

  for (const [label, rows, table] of [
    ["products", productRows, "products"],
    ["parties", partyRows, "parties"],
    ["transactions", transactionRows, "transactions"],
    ["transaction items", itemRows, "transaction_items"],
    ["payments", paymentRows, "payments_and_expenses"],
  ] as const) {
    if (!rows.length) continue;
    const { error } = await client.from(table).insert(rows as never);
    if (error) raise(`Could not seed ${label}`, error);
  }

  const snapshot = await loadWorkspaceState(client, businessId);
  if (!snapshot) throw new Error("Demo data was written but could not be reloaded.");
  return snapshot;
}

export async function uploadCompressedBill(
  client: SupabaseClient,
  businessId: string,
  dataUrl: string,
) {
  const match = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Bill image is not a supported base64 JPEG/PNG/WebP.");
  if (match[3].length > 7_000_000) throw new Error("Bill image exceeds 5 MB after decode.");

  const mime = match[1];
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${Date.now()}.${ext}`;
  const path = `${businessId}/${date}/${filename}`;
  const bytes = Buffer.from(match[3], "base64");

  const { error } = await client.storage
    .from(BILL_IMAGE_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) raise("Could not upload bill image", error);

  const { data, error: signedError } = await client.storage
    .from(BILL_IMAGE_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signedError) raise("Could not create bill image URL", signedError);
  if (!data?.signedUrl) throw new Error("Supabase returned an empty signed URL.");

  return { path, signedUrl: data.signedUrl };
}

export async function persistRemoteTransaction(
  client: SupabaseClient,
  businessId: string,
  input: RemoteTransactionInput,
) {
  let billImageUrl: string | null = null;
  let warning: string | undefined;

  if (input.billImageDataUrl) {
    try {
      const uploaded = await uploadCompressedBill(
        client,
        businessId,
        input.billImageDataUrl,
      );
      billImageUrl = uploaded.signedUrl;
    } catch (error) {
      warning = `Transaction saved, but bill image upload failed: ${
        error instanceof Error ? error.message : "unknown storage error"
      }`;
    }
  }

  const { data, error } = await client.rpc("record_scan_transaction", {
    p_business_id: businessId,
    p_party_id: input.party_id,
    p_parchi_number: input.parchi_number,
    p_type: input.type,
    p_routing_mode: input.routing_mode,
    p_payment_mode: input.payment_mode,
    p_subtotal: input.subtotal,
    p_extra_charges: input.extra_charges,
    p_total_amount: input.total_amount,
    p_paid_amount: input.paid_amount,
    p_bill_image_url: billImageUrl,
    p_created_at: new Date().toISOString(),
    p_notes: input.notes || null,
    p_items: input.items,
  });
  if (error) raise("Could not save transaction", error);

  const snapshot = await loadWorkspaceState(client, businessId);
  if (!snapshot) throw new Error("Transaction saved but workspace reload failed.");

  return {
    transactionId: String(data),
    state: snapshot.state,
    warning,
  };
}

export async function persistRemotePayment(
  client: SupabaseClient,
  businessId: string,
  input: {
    party_id: string | null;
    entry_type: PaymentExpense["entry_type"];
    description: string;
    amount: number;
    payment_mode: PaymentExpense["payment_mode"];
  },
) {
  const { error } = await client.rpc("record_payment_entry", {
    p_business_id: businessId,
    p_party_id: input.party_id,
    p_entry_type: input.entry_type,
    p_description: input.description,
    p_amount: input.amount,
    p_payment_mode: input.payment_mode,
    p_created_at: new Date().toISOString(),
  });
  if (error) raise("Could not save payment", error);
  const snapshot = await loadWorkspaceState(client, businessId);
  if (!snapshot) throw new Error("Payment saved but workspace reload failed.");
  return snapshot.state;
}

export async function persistRemoteProduct(
  client: SupabaseClient,
  businessId: string,
  product: Omit<Product, "business_id" | "created_at" | "id"> & { id?: string },
) {
  const row = {
    id: product.id || randomUUID(),
    business_id: businessId,
    name: product.name,
    sku_code: product.sku_code,
    unit: product.unit,
    weight_per_length: product.weight_per_length,
    current_stock: product.current_stock,
    low_stock_alert: product.low_stock_alert,
    purchase_rate: product.purchase_rate,
    sale_rate: product.sale_rate,
    attributes: product.attributes,
    aliases: Array.from(
      new Set(
        product.aliases
          .map((alias) => alias.toLowerCase().trim().replace(/\s+/g, " "))
          .filter(Boolean),
      ),
    ),
    last_sold_at: product.last_sold_at,
  };

  const { data, error } = await client
    .from("products")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (error) raise("Could not save product", error);

  const snapshot = await loadWorkspaceState(client, businessId);
  if (!snapshot) throw new Error("Product saved but workspace reload failed.");
  return { product: rowFromDb(data as Row), state: snapshot.state };
}

export async function persistRemoteParty(
  client: SupabaseClient,
  businessId: string,
  party: Omit<Party, "business_id" | "created_at" | "id" | "current_balance">,
) {
  const id = randomUUID();
  const row = {
    id,
    business_id: businessId,
    name: party.name,
    area_or_shop: party.area_or_shop,
    phone: party.phone,
    type: party.type,
    current_balance: 0,
  };
  const { data, error } = await client
    .from("parties")
    .insert(row)
    .select("*")
    .single();
  if (error) raise("Could not save party", error);
  const snapshot = await loadWorkspaceState(client, businessId);
  if (!snapshot) throw new Error("Party saved but workspace reload failed.");
  const saved = data as Row;
  const savedParty: Party = {
    id: String(saved.id),
    business_id: String(saved.business_id ?? businessId),
    name: text(saved.name),
    area_or_shop: text(saved.area_or_shop),
    phone: text(saved.phone),
    type: (text(saved.type, "customer") as Party["type"]) || "customer",
    current_balance: num(saved.current_balance),
    created_at: iso(saved.created_at),
  };
  return { party: savedParty, state: snapshot.state };
}

export async function persistRemoteDayLock(
  client: SupabaseClient,
  businessId: string,
  date: string,
  openingCash: number,
  unlock: boolean,
) {
  if (unlock) {
    const { error } = await client
      .from("day_closures")
      .delete()
      .eq("business_id", businessId)
      .eq("closing_date", date);
    if (error) raise("Could not reopen day", error);
  } else {
    const { error } = await client.from("day_closures").upsert(
      {
        business_id: businessId,
        closing_date: date,
        opening_cash: openingCash,
        locked_at: new Date().toISOString(),
      },
      { onConflict: "business_id,closing_date" },
    );
    if (error) raise("Could not close day", error);
  }

  const start = new Date(`${date}T00:00:00+05:00`).toISOString();
  const end = new Date(`${date}T23:59:59.999+05:00`).toISOString();
  const { error: lockError } = await client
    .from("transactions")
    .update({ is_day_locked: !unlock })
    .eq("business_id", businessId)
    .gte("created_at", start)
    .lte("created_at", end);
  if (lockError) raise("Could not update day lock", lockError);

  const snapshot = await loadWorkspaceState(client, businessId);
  if (!snapshot) throw new Error("Day lock saved but workspace reload failed.");
  return snapshot.state;
}

function rowFromDb(row: Row): Product {
  return {
    id: String(row.id),
    business_id: String(row.business_id),
    name: text(row.name),
    sku_code: text(row.sku_code),
    unit: (text(row.unit, "length") as ProductUnit) || "length",
    weight_per_length:
      row.weight_per_length === null || row.weight_per_length === undefined
        ? null
        : num(row.weight_per_length),
    current_stock: num(row.current_stock),
    low_stock_alert: num(row.low_stock_alert),
    purchase_rate: num(row.purchase_rate),
    sale_rate: num(row.sale_rate),
    attributes:
      row.attributes && typeof row.attributes === "object"
        ? (row.attributes as Product["attributes"])
        : {},
    aliases: Array.isArray(row.aliases)
      ? (row.aliases as unknown[]).map((alias) => String(alias))
      : [],
    last_sold_at: row.last_sold_at ? iso(row.last_sold_at) : null,
    created_at: iso(row.created_at),
  };
}
