-- ═══════════════════════════════════════════════════════════════════════════
-- SteelKhata AI — Supabase schema, RLS & Pakistani steel store demo seed
-- ───────────────────────────────────────────────────────────────────────────
-- HOW TO RUN
--   1. Create a Supabase project.
--   2. Create the owner account (Authentication → Users → Add user), or sign up.
--   3. Open SQL Editor and run this entire file once.
--   4. The demo seed attaches to the FIRST auth user (oldest account) and is
--      safe to re-run for the same user.
--
-- The local demo in the Next.js app does not require Supabase. This file is the
-- production foundation for auth-backed, multi-tenant deployments.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Shared timestamp helper ────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. BUSINESSES
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  niche text not null default 'steel_pipes',
  phone text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_niche_check check (niche in ('steel_pipes', 'general', 'hardware'))
);

create index if not exists businesses_owner_idx on public.businesses(owner_id);

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. PRODUCTS — stainless steel native attributes
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  sku_code text not null,
  unit text not null default 'length',
  weight_per_length numeric(12, 3),
  current_stock numeric(14, 3) not null default 0,
  low_stock_alert numeric(14, 3) not null default 10,
  purchase_rate numeric(14, 2) not null default 0,
  sale_rate numeric(14, 2) not null default 0,
  attributes jsonb not null default '{}'::jsonb,
  aliases text[] not null default '{}'::text[],
  last_sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_unit_check check (unit in ('length', 'kg', 'pcs')),
  constraint products_stock_nonnegative check (current_stock >= 0),
  constraint products_threshold_nonnegative check (low_stock_alert >= 0),
  constraint products_rates_nonnegative check (purchase_rate >= 0 and sale_rate >= 0),
  constraint products_business_sku_unique unique (business_id, sku_code)
);

-- Needed for tenant-safe composite foreign keys.
alter table public.products
  drop constraint if exists products_id_business_unique;
alter table public.products
  add constraint products_id_business_unique unique (id, business_id);

create index if not exists products_business_idx on public.products(business_id);
create index if not exists products_low_stock_idx
  on public.products(business_id, current_stock, low_stock_alert);
create index if not exists products_last_sold_idx on public.products(business_id, last_sold_at);
create index if not exists products_attributes_gin_idx on public.products using gin(attributes);
create index if not exists products_aliases_gin_idx on public.products using gin(aliases);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. PARTIES — customers, suppliers & the seeded walk-in cash counter
--    Positive customer balance = customer owes udhaar.
--    Negative customer balance = customer advance.
--    Negative supplier balance = shop owes supplier.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  area_or_shop text,
  phone text,
  type text not null default 'customer',
  current_balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parties_type_check check (type in ('customer', 'supplier', 'walk_in_cash'))
);

alter table public.parties
  drop constraint if exists parties_id_business_unique;
alter table public.parties
  add constraint parties_id_business_unique unique (id, business_id);

create index if not exists parties_business_idx on public.parties(business_id);
create index if not exists parties_business_type_idx on public.parties(business_id, type);
create index if not exists parties_name_idx on public.parties(business_id, lower(name));

drop trigger if exists parties_set_updated_at on public.parties;
create trigger parties_set_updated_at
before update on public.parties
for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. TRANSACTIONS
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  party_id uuid not null,
  parchi_number text,
  type text not null default 'sale',
  routing_mode text not null default 'cash_sale',
  payment_mode text not null default 'cash',
  subtotal numeric(14, 2) not null default 0,
  extra_charges numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0,
  bill_image_url text,
  is_day_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_type_check check (type in ('sale', 'purchase', 'sale_return')),
  constraint transactions_routing_check check (routing_mode in ('cash_sale', 'customer_khata')),
  constraint transactions_payment_check check (payment_mode in ('cash', 'udhaar', 'bank')),
  constraint transactions_money_nonnegative check (
    subtotal >= 0 and extra_charges >= 0 and total_amount >= 0 and paid_amount >= 0
  ),
  constraint transactions_party_business_fkey
    foreign key (party_id, business_id)
    references public.parties(id, business_id)
    on delete restrict
);

alter table public.transactions
  drop constraint if exists transactions_id_business_unique;
alter table public.transactions
  add constraint transactions_id_business_unique unique (id, business_id);

create index if not exists transactions_business_created_idx
  on public.transactions(business_id, created_at desc);
create index if not exists transactions_party_created_idx
  on public.transactions(business_id, party_id, created_at desc);
create index if not exists transactions_type_idx
  on public.transactions(business_id, type, created_at desc);
create index if not exists transactions_parchi_lookup_idx
  on public.transactions(business_id, parchi_number, created_at desc)
  where parchi_number is not null;
create index if not exists transactions_day_lock_idx
  on public.transactions(business_id, is_day_locked, created_at);

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. TRANSACTION ITEMS
--    business_id is included explicitly so RLS never needs a recursive join.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  transaction_id uuid not null,
  product_id uuid not null,
  raw_scanned_name text,
  quantity numeric(14, 3) not null default 0,
  unit text not null default 'length',
  rate numeric(14, 2) not null default 0,
  amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint transaction_items_unit_check check (unit in ('length', 'kg', 'pcs')),
  constraint transaction_items_quantity_nonnegative check (quantity >= 0),
  constraint transaction_items_money_nonnegative check (rate >= 0 and amount >= 0),
  constraint transaction_items_transaction_fkey
    foreign key (transaction_id, business_id)
    references public.transactions(id, business_id)
    on delete cascade,
  constraint transaction_items_product_fkey
    foreign key (product_id, business_id)
    references public.products(id, business_id)
    on delete restrict
);

create index if not exists transaction_items_business_idx on public.transaction_items(business_id);
create index if not exists transaction_items_transaction_idx on public.transaction_items(transaction_id);
create index if not exists transaction_items_product_idx on public.transaction_items(business_id, product_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. PAYMENTS & EXPENSES — Wasooli and Roznamcha
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.payments_and_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  party_id uuid references public.parties(id) on delete set null,
  entry_type text not null,
  description text,
  amount numeric(14, 2) not null default 0,
  payment_mode text not null default 'cash',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_entry_type_check check (
    entry_type in ('customer_wasooli', 'supplier_payment', 'shop_expense')
  ),
  constraint payments_mode_check check (payment_mode in ('cash', 'udhaar', 'bank')),
  constraint payments_amount_positive check (amount > 0)
);

create index if not exists payments_business_created_idx
  on public.payments_and_expenses(business_id, created_at desc);
create index if not exists payments_party_idx
  on public.payments_and_expenses(business_id, party_id, created_at desc);
create index if not exists payments_type_idx
  on public.payments_and_expenses(business_id, entry_type, created_at desc);

drop trigger if exists payments_set_updated_at on public.payments_and_expenses;
create trigger payments_set_updated_at
before update on public.payments_and_expenses
for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. DAY CLOSURES — supports locking a day even when it has zero transactions
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.day_closures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  closing_date date not null,
  opening_cash numeric(14, 2) not null default 0,
  locked_at timestamptz not null default now(),
  locked_by uuid references auth.users(id) on delete set null,
  constraint day_closures_unique unique (business_id, closing_date),
  constraint day_closures_opening_nonnegative check (opening_cash >= 0)
);

create index if not exists day_closures_business_date_idx
  on public.day_closures(business_id, closing_date desc);

-- Keep the denormalised flag on transactions aligned with a day closure.
create or replace function public.sync_transaction_day_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.transactions
       set is_day_locked = true
     where business_id = new.business_id
       and created_at::date = new.closing_date;
    return new;
  end if;
  if tg_op = 'DELETE' then
    update public.transactions
       set is_day_locked = false
     where business_id = old.business_id
       and created_at::date = old.closing_date;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists day_closures_sync_lock on public.day_closures;
create trigger day_closures_sync_lock
after insert or delete on public.day_closures
for each row execute function public.sync_transaction_day_lock();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.owns_business(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.businesses b
     where b.id = target_business_id
       and b.owner_id = auth.uid()
  );
$$;

revoke all on function public.owns_business(uuid) from public;
grant execute on function public.owns_business(uuid) to authenticated;

alter table public.businesses enable row level security;
alter table public.products enable row level security;
alter table public.parties enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.payments_and_expenses enable row level security;
alter table public.day_closures enable row level security;

drop policy if exists "businesses_owner_all" on public.businesses;
create policy "businesses_owner_all"
  on public.businesses
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "products_owner_all" on public.products;
create policy "products_owner_all"
  on public.products
  for all
  to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

drop policy if exists "parties_owner_all" on public.parties;
create policy "parties_owner_all"
  on public.parties
  for all
  to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

drop policy if exists "transactions_owner_all" on public.transactions;
create policy "transactions_owner_all"
  on public.transactions
  for all
  to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

drop policy if exists "transaction_items_owner_all" on public.transaction_items;
create policy "transaction_items_owner_all"
  on public.transaction_items
  for all
  to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

drop policy if exists "payments_owner_all" on public.payments_and_expenses;
create policy "payments_owner_all"
  on public.payments_and_expenses
  for all
  to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

drop policy if exists "day_closures_owner_all" on public.day_closures;
create policy "day_closures_owner_all"
  on public.day_closures
  for all
  to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. STORAGE — private parchi image bucket
--    Object path convention: <business_id>/<yyyy-mm-dd>/<uuid>.jpg
-- ═══════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bill-images',
  'bill-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "steelkhata_bill_read" on storage.objects;
create policy "steelkhata_bill_read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'bill-images'
    and public.owns_business(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "steelkhata_bill_insert" on storage.objects;
create policy "steelkhata_bill_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'bill-images'
    and public.owns_business(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "steelkhata_bill_update" on storage.objects;
create policy "steelkhata_bill_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'bill-images'
    and public.owns_business(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'bill-images'
    and public.owns_business(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "steelkhata_bill_delete" on storage.objects;
create policy "steelkhata_bill_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'bill-images'
    and public.owns_business(((storage.foldername(name))[1])::uuid)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. ATOMIC WRITE FUNCTIONS (called by the server-side workspace API)
--     These keep transaction rows, stock, khata balances and learned aliases in
--     one PostgreSQL transaction. Execute is restricted to service_role.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.record_scan_transaction(
  p_business_id uuid,
  p_party_id uuid,
  p_parchi_number text,
  p_type text,
  p_routing_mode text,
  p_payment_mode text,
  p_subtotal numeric,
  p_extra_charges numeric,
  p_total_amount numeric,
  p_paid_amount numeric,
  p_bill_image_url text,
  p_created_at timestamptz,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx uuid;
  v_created_at timestamptz := coalesce(p_created_at, now());
  v_item jsonb;
  v_product_id uuid;
  v_raw_name text;
  v_qty numeric;
  v_rate numeric;
  v_amount numeric;
  v_unit text;
  v_alias text;
  v_aliases text[];
begin
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'Unknown business %', p_business_id;
  end if;
  if p_type not in ('sale', 'purchase', 'sale_return') then
    raise exception 'Invalid transaction type %', p_type;
  end if;
  if p_routing_mode not in ('cash_sale', 'customer_khata') then
    raise exception 'Invalid routing mode %', p_routing_mode;
  end if;
  if p_payment_mode not in ('cash', 'udhaar', 'bank') then
    raise exception 'Invalid payment mode %', p_payment_mode;
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A transaction needs at least one line item';
  end if;
  if exists (
    select 1 from public.day_closures
     where business_id = p_business_id
       and closing_date = v_created_at::date
  ) then
    raise exception 'Day is locked for %', v_created_at::date;
  end if;

  insert into public.transactions
    (business_id, party_id, parchi_number, type, routing_mode, payment_mode,
     subtotal, extra_charges, total_amount, paid_amount, bill_image_url,
     is_day_locked, created_at, notes)
  values
    (p_business_id, p_party_id, p_parchi_number, p_type, p_routing_mode, p_payment_mode,
     greatest(coalesce(p_subtotal, 0), 0), greatest(coalesce(p_extra_charges, 0), 0),
     greatest(coalesce(p_total_amount, 0), 0), greatest(coalesce(p_paid_amount, 0), 0),
     p_bill_image_url, false, v_created_at, p_notes)
  returning id into v_tx;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_raw_name := coalesce(v_item ->> 'raw_scanned_name', '');
    v_qty := greatest(coalesce((v_item ->> 'quantity')::numeric, 0), 0);
    v_rate := greatest(coalesce((v_item ->> 'rate')::numeric, 0), 0);
    v_amount := greatest(coalesce((v_item ->> 'amount')::numeric, v_qty * v_rate), 0);
    v_unit := coalesce(nullif(v_item ->> 'unit', ''), 'length');

    if v_product_id is null or v_qty <= 0 then
      raise exception 'Invalid line item: product_id and quantity are required';
    end if;
    if v_unit not in ('length', 'kg', 'pcs') then
      v_unit := 'length';
    end if;

    insert into public.transaction_items
      (business_id, transaction_id, product_id, raw_scanned_name, quantity, unit, rate, amount)
    values
      (p_business_id, v_tx, v_product_id, v_raw_name, v_qty, v_unit, v_rate, v_amount);

    if p_type = 'sale' then
      update public.products
         set current_stock = greatest(current_stock - v_qty, 0),
             last_sold_at = v_created_at
       where id = v_product_id and business_id = p_business_id;
    else
      update public.products
         set current_stock = current_stock + v_qty
       where id = v_product_id and business_id = p_business_id;
    end if;

    if not found then
      raise exception 'Product % does not belong to this business', v_product_id;
    end if;

    -- Self-learning alias: remember the exact handwritten string for the
    -- matched product, case-insensitively and deduplicated.
    select coalesce(aliases, '{}'::text[]) into v_aliases
      from public.products
     where id = v_product_id and business_id = p_business_id;

    v_alias := regexp_replace(lower(btrim(coalesce(v_raw_name, ''))), '\s+', ' ', 'g');
    if v_alias <> '' and not exists (
      select 1 from unnest(v_aliases) as existing(alias)
       where lower(btrim(existing.alias)) = v_alias
    ) then
      update public.products
         set aliases = array_append(coalesce(v_aliases, '{}'::text[]), v_alias)
       where id = v_product_id and business_id = p_business_id;
    end if;
  end loop;

  if p_routing_mode = 'customer_khata' then
    if p_type = 'sale' then
      update public.parties
         set current_balance = current_balance + greatest(coalesce(p_total_amount, 0), 0)
       where id = p_party_id and business_id = p_business_id;
    elsif p_type = 'sale_return' then
      update public.parties
         set current_balance = current_balance - greatest(coalesce(p_total_amount, 0), 0)
       where id = p_party_id and business_id = p_business_id;
    end if;
  end if;

  return v_tx;
end;
$$;

revoke all on function public.record_scan_transaction(
  uuid, uuid, text, text, text, text, numeric, numeric, numeric, numeric, text, timestamptz, text, jsonb
) from public;
grant execute on function public.record_scan_transaction(
  uuid, uuid, text, text, text, text, numeric, numeric, numeric, numeric, text, timestamptz, text, jsonb
) to service_role;

create or replace function public.record_payment_entry(
  p_business_id uuid,
  p_party_id uuid,
  p_entry_type text,
  p_description text,
  p_amount numeric,
  p_payment_mode text,
  p_created_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_created_at timestamptz := coalesce(p_created_at, now());
begin
  if p_entry_type not in ('customer_wasooli', 'supplier_payment', 'shop_expense') then
    raise exception 'Invalid payment entry type';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Payment amount must be positive';
  end if;
  if exists (
    select 1 from public.day_closures
     where business_id = p_business_id
       and closing_date = v_created_at::date
  ) then
    raise exception 'Day is locked for %', v_created_at::date;
  end if;

  insert into public.payments_and_expenses
    (business_id, party_id, entry_type, description, amount, payment_mode, created_at)
  values
    (p_business_id, p_party_id, p_entry_type, p_description, p_amount,
     coalesce(p_payment_mode, 'cash'), v_created_at)
  returning id into v_id;

  if p_party_id is not null and p_entry_type = 'customer_wasooli' then
    update public.parties
       set current_balance = current_balance - p_amount
     where id = p_party_id and business_id = p_business_id;
  elsif p_party_id is not null and p_entry_type = 'supplier_payment' then
    update public.parties
       set current_balance = current_balance + p_amount
     where id = p_party_id and business_id = p_business_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_payment_entry(
  uuid, uuid, text, text, numeric, text, timestamptz
) from public;
grant execute on function public.record_payment_entry(
  uuid, uuid, text, text, numeric, text, timestamptz
) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. DEMO SEED — Malik Steel Pipe Store, Lahore
--     Attaches to the oldest auth user. Skips cleanly if no user exists.
-- ═══════════════════════════════════════════════════════════════════════════
do $seed$
declare
  v_owner uuid;
  v_business uuid := '11111111-1111-4111-8111-111111111111';
  v_walkin uuid := '22222222-2222-4222-8222-222222222222';
  v_nadeem uuid := '22222222-2222-4222-8222-222222222201';
  v_hammad uuid := '22222222-2222-4222-8222-222222222202';
  v_aslam uuid := '22222222-2222-4222-8222-222222222203';
  v_rehman uuid := '22222222-2222-4222-8222-222222222204';
  v_bilal uuid := '22222222-2222-4222-8222-222222222205';
  v_madina uuid := '22222222-2222-4222-8222-222222222206';
begin
  select id into v_owner from auth.users order by created_at asc limit 1;

  if v_owner is null then
    raise notice 'Demo seed skipped: create an auth user first, then re-run the seed block.';
    return;
  end if;

  insert into public.businesses (id, owner_id, business_name, niche, phone, city, created_at)
  values (v_business, v_owner, 'Malik Steel Pipe Store', 'steel_pipes', '0300 1234567', 'Lahore', now() - interval '420 days')
  on conflict (id) do update
    set owner_id = excluded.owner_id,
        business_name = excluded.business_name,
        phone = excluded.phone,
        city = excluded.city;

  -- ── 15 stainless steel pipe SKUs ────────────────────────────────────────
  insert into public.products
    (id, business_id, name, sku_code, unit, weight_per_length, current_stock, low_stock_alert,
     purchase_rate, sale_rate, attributes, aliases, last_sold_at, created_at)
  values
    ('33333333-3333-4333-8333-333333333301', v_business, 'Round Pipe 1/2" — SS 304', 'SP-R-050-304-18', 'length', 3.2, 140, 25, 980, 1250,
      jsonb_build_object('size', '1/2"', 'gauge', '18G', 'grade', '304', 'shape', 'round', 'length_ft', 20),
      array['aadha inch', 'half inch', '1/2 round', 'patla pipe'], now() - interval '1 day', now() - interval '400 days'),
    ('33333333-3333-4333-8333-333333333302', v_business, 'Round Pipe 3/4" — SS 304', 'SP-R-075-304-18', 'length', 4.6, 86, 20, 1380, 1680,
      jsonb_build_object('size', '3/4"', 'gauge', '18G', 'grade', '304', 'shape', 'round', 'length_ft', 20),
      array['pauna inch', 'three quarter', '3/4 round'], now() - interval '1 hour', now() - interval '398 days'),
    ('33333333-3333-4333-8333-333333333303', v_business, 'Round Pipe 1" — SS 304', 'SP-R-100-304-18', 'length', 6.1, 64, 18, 1920, 2350,
      jsonb_build_object('size', '1"', 'gauge', '18G', 'grade', '304', 'shape', 'round', 'length_ft', 20),
      array['ek inch', 'one inch', '1 inch round'], now() - interval '3 hours', now() - interval '396 days'),
    ('33333333-3333-4333-8333-333333333304', v_business, 'Round Pipe 1.25" — SS 304', 'SP-R-125-304-16', 'length', 8.4, 38, 12, 3460, 4150,
      jsonb_build_object('size', '1.25"', 'gauge', '16G', 'grade', '304', 'shape', 'round', 'length_ft', 20),
      array['sawa inch', '1-1/4', 'one and quarter'], now() - interval '8 days', now() - interval '390 days'),
    ('33333333-3333-4333-8333-333333333305', v_business, 'Round Pipe 1.5" — SS 304', 'SP-R-150-304-18', 'length', 9.7, 42, 15, 2680, 3250,
      jsonb_build_object('size', '1.5"', 'gauge', '18G', 'grade', '304', 'shape', 'round', 'length_ft', 20),
      array['dedh inch', 'one and half', '1.5 round', 'dedh nali'], now() - interval '2 hours', now() - interval '380 days'),
    ('33333333-3333-4333-8333-333333333306', v_business, 'Round Pipe 2" — SS 304', 'SP-R-200-304-16', 'length', 14.8, 28, 12, 4850, 5850,
      jsonb_build_object('size', '2"', 'gauge', '16G', 'grade', '304', 'shape', 'round', 'length_ft', 20),
      array['do inch', 'two inch', '2 inch round', 'mota pipe'], now() - interval '2 hours', now() - interval '370 days'),
    ('33333333-3333-4333-8333-333333333307', v_business, 'Round Pipe 2.5" — SS 304', 'SP-R-250-304-16', 'length', 19.2, 7, 8, 6100, 7350,
      jsonb_build_object('size', '2.5"', 'gauge', '16G', 'grade', '304', 'shape', 'round', 'length_ft', 20),
      array['dhai inch', 'two and half', '2.5 round'], now() - interval '14 days', now() - interval '350 days'),
    ('33333333-3333-4333-8333-333333333308', v_business, 'Round Pipe 3" — SS 304', 'SP-R-300-304-14', 'length', 26.5, 16, 10, 8700, 10400,
      jsonb_build_object('size', '3"', 'gauge', '14G', 'grade', '304', 'shape', 'round', 'length_ft', 20),
      array['teen inch', 'three inch', '3 inch heavy'], now() - interval '21 days', now() - interval '330 days'),
    ('33333333-3333-4333-8333-333333333309', v_business, 'Round Pipe 4" — SS 304', 'SP-R-400-304-14', 'length', 35.4, 5, 6, 11600, 13800,
      jsonb_build_object('size', '4"', 'gauge', '14G', 'grade', '304', 'shape', 'round', 'length_ft', 20),
      array['chaar inch', 'four inch', '4 inch heavy'], now() - interval '48 days', now() - interval '300 days'),
    ('33333333-3333-4333-8333-333333333310', v_business, 'Square Pipe 1" — SS 304', 'SP-S-100-304-18', 'length', 7.2, 40, 10, 2380, 2900,
      jsonb_build_object('size', '1"', 'gauge', '18G', 'grade', '304', 'shape', 'square', 'length_ft', 20),
      array['ek inch chauras', 'square one inch', '1x1 square'], now() - interval '5 days', now() - interval '290 days'),
    ('33333333-3333-4333-8333-333333333311', v_business, 'Square Pipe 1.5" — SS 201', 'SP-S-150-201-18', 'length', 9.1, 34, 12, 3010, 3650,
      jsonb_build_object('size', '1.5"', 'gauge', '18G', 'grade', '201', 'shape', 'square', 'length_ft', 20),
      array['dedh chauras', 'square 1.5', '201 square'], now() - interval '12 days', now() - interval '270 days'),
    ('33333333-3333-4333-8333-333333333312', v_business, 'Square Pipe 2" — SS 201', 'SP-S-200-201-16', 'length', 13.8, 8, 10, 3800, 4600,
      jsonb_build_object('size', '2"', 'gauge', '16G', 'grade', '201', 'shape', 'square', 'length_ft', 20),
      array['do inch chauras', 'square 2', '2x2 square'], now() - interval '4 hours', now() - interval '250 days'),
    ('33333333-3333-4333-8333-333333333313', v_business, 'Round Pipe 1" — SS 201', 'SP-R-100-201-20', 'length', 4.9, 70, 20, 1570, 1980,
      jsonb_build_object('size', '1"', 'gauge', '20G', 'grade', '201', 'shape', 'round', 'length_ft', 20),
      array['ek inch 201', 'light pipe', '20 gauge one inch'], now() - interval '2 days', now() - interval '230 days'),
    ('33333333-3333-4333-8333-333333333314', v_business, 'Round Pipe 3/4" — SS 201', 'SP-R-075-201-20', 'length', 3.7, 55, 15, 1130, 1420,
      jsonb_build_object('size', '3/4"', 'gauge', '20G', 'grade', '201', 'shape', 'round', 'length_ft', 20),
      array['pauna 201', 'three quarter light', '20 gauge'], now() - interval '6 days', now() - interval '210 days'),
    ('33333333-3333-4333-8333-333333333315', v_business, 'Round Pipe 2" — SS 201', 'SP-R-200-201-18', 'length', 12.4, 36, 12, 4230, 5100,
      jsonb_build_object('size', '2"', 'gauge', '18G', 'grade', '201', 'shape', 'round', 'length_ft', 20),
      array['do inch 201', 'two inch light', '201 2 inch'], now() - interval '35 days', now() - interval '190 days')
  on conflict (id) do nothing;

  -- ── Walk-in counter + 5 customer khatay + 1 supplier ─────────────────────
  insert into public.parties
    (id, business_id, name, area_or_shop, phone, type, current_balance, created_at)
  values
    (v_walkin, v_business, 'Cash Counter / Walk-in', 'Counter sale', '—', 'walk_in_cash', 0, now() - interval '420 days'),
    (v_nadeem, v_business, 'Nadeem Fabricators', 'Sialkot Road', '0301 7744120', 'customer', 48500, now() - interval '310 days'),
    (v_hammad, v_business, 'Hammad Steel Works', 'Adda', '0322 8819034', 'customer', 112000, now() - interval '280 days'),
    (v_aslam, v_business, 'Ch. Aslam & Sons', 'Gujranwala', '0300 5662187', 'customer', 27300, now() - interval '260 days'),
    (v_rehman, v_business, 'Rehman Engineering', 'Model Town', '0333 9091287', 'customer', 0, now() - interval '190 days'),
    (v_bilal, v_business, 'Bilal Fabrication', 'Ravi Road', '0345 7213348', 'customer', -5000, now() - interval '150 days'),
    (v_madina, v_business, 'Al-Madina Traders', 'Badami Bagh', '0304 9981200', 'supplier', -85000, now() - interval '320 days')
  on conflict (id) do nothing;

  -- ── Sample transactions (today's dashboard is intentionally alive) ──────
  insert into public.transactions
    (id, business_id, party_id, parchi_number, type, routing_mode, payment_mode,
     subtotal, extra_charges, total_amount, paid_amount, is_day_locked, created_at, notes)
  values
    ('44444444-4444-4444-8444-444444444401', v_business, v_hammad, '1041', 'sale', 'customer_khata', 'udhaar',
      31200, 800, 32000, 0, false, now() - interval '2 hours', 'Mazdoori Rs. 800 — loading by shop.'),
    ('44444444-4444-4444-8444-444444444402', v_business, v_walkin, '1043', 'sale', 'cash_sale', 'cash',
      31910, 300, 32210, 32210, false, now() - interval '5 hours', 'Walk-in customer — full cash payment.'),
    ('44444444-4444-4444-8444-444444444403', v_business, v_aslam, '1044', 'sale', 'customer_khata', 'udhaar',
      32000, 500, 32500, 0, false, now() - interval '8 hours', null),
    ('44444444-4444-4444-8444-444444444404', v_business, v_rehman, '1045', 'sale', 'cash_sale', 'cash',
      18400, 0, 18400, 18400, false, now() - interval '11 hours', null),
    ('44444444-4444-4444-8444-444444444405', v_business, v_madina, 'AP-219', 'purchase', 'cash_sale', 'udhaar',
      92000, 2000, 94000, 40000, false, now() - interval '13 hours', 'Supplier freight Rs. 2,000. Part payment made.'),
    ('44444444-4444-4444-8444-444444444406', v_business, v_nadeem, '1039-R', 'sale_return', 'customer_khata', 'udhaar',
      4700, 0, 4700, 0, false, now() - interval '1 hour', 'Customer returned 2 lengths — sizing issue.'),
    ('44444444-4444-4444-8444-444444444407', v_business, v_nadeem, '1028', 'sale', 'customer_khata', 'udhaar',
      26000, 400, 26400, 0, false, now() - interval '1 day', null),
    ('44444444-4444-4444-8444-444444444408', v_business, v_bilal, '1029', 'sale', 'cash_sale', 'cash',
      28680, 320, 29000, 29000, false, now() - interval '2 days', null)
  on conflict (id) do nothing;

  insert into public.transaction_items
    (id, business_id, transaction_id, product_id, raw_scanned_name, quantity, unit, rate, amount)
  values
    ('55555555-5555-4555-8555-555555555501', v_business, '44444444-4444-4444-8444-444444444401', '33333333-3333-4333-8333-333333333305', '6 nali 1.5" 18G 304', 6, 'length', 3250, 19500),
    ('55555555-5555-4555-8555-555555555502', v_business, '44444444-4444-4444-8444-444444444401', '33333333-3333-4333-8333-333333333306', '2 nali 2" 16G 304', 2, 'length', 5850, 11700),
    ('55555555-5555-4555-8555-555555555503', v_business, '44444444-4444-4444-8444-444444444402', '33333333-3333-4333-8333-333333333302', '12 nali 3/4" 18G 304', 12, 'length', 1680, 20160),
    ('55555555-5555-4555-8555-555555555504', v_business, '44444444-4444-4444-8444-444444444402', '33333333-3333-4333-8333-333333333303', '5 nali 1" 18G 304', 5, 'length', 2350, 11750),
    ('55555555-5555-4555-8555-555555555505', v_business, '44444444-4444-4444-8444-444444444403', '33333333-3333-4333-8333-333333333305', '10 nali 1.5" 18G 304', 10, 'length', 3200, 32000),
    ('55555555-5555-4555-8555-555555555506', v_business, '44444444-4444-4444-8444-444444444404', '33333333-3333-4333-8333-333333333312', '4 nali 2" square 201 16G', 4, 'length', 4600, 18400),
    ('55555555-5555-4555-8555-555555555507', v_business, '44444444-4444-4444-8444-444444444405', '33333333-3333-4333-8333-333333333306', '20 nali 2" 16G 304', 20, 'length', 4600, 92000),
    ('55555555-5555-4555-8555-555555555508', v_business, '44444444-4444-4444-8444-444444444406', '33333333-3333-4333-8333-333333333303', '2 nali 1" 18G 304 return', 2, 'length', 2350, 4700),
    ('55555555-5555-4555-8555-555555555509', v_business, '44444444-4444-4444-8444-444444444407', '33333333-3333-4333-8333-333333333305', '8 nali 1.5" 18G 304', 8, 'length', 3250, 26000),
    ('55555555-5555-4555-8555-555555555510', v_business, '44444444-4444-4444-8444-444444444408', '33333333-3333-4333-8333-333333333302', '10 nali 3/4" 18G 304', 10, 'length', 1680, 16800),
    ('55555555-5555-4555-8555-555555555511', v_business, '44444444-4444-4444-8444-444444444408', '33333333-3333-4333-8333-333333333313', '6 nali 1" 20G 201', 6, 'length', 1980, 11880)
  on conflict (id) do nothing;

  insert into public.payments_and_expenses
    (id, business_id, party_id, entry_type, description, amount, payment_mode, created_at)
  values
    ('66666666-6666-4666-8666-666666666601', v_business, v_nadeem, 'customer_wasooli', 'Wasooli — Nadeem Fabricators', 25000, 'cash', now() - interval '30 minutes'),
    ('66666666-6666-4666-8666-666666666602', v_business, null, 'shop_expense', 'Diesel + loading labour', 3500, 'cash', now() - interval '40 minutes'),
    ('66666666-6666-4666-8666-666666666603', v_business, null, 'shop_expense', 'Chai + misc. shop kharcha', 1200, 'cash', now() - interval '45 minutes'),
    ('66666666-6666-4666-8666-666666666604', v_business, v_hammad, 'customer_wasooli', 'Wasooli — Hammad Steel Works', 20000, 'cash', now() - interval '1 day'),
    ('66666666-6666-4666-8666-666666666605', v_business, v_madina, 'supplier_payment', 'Part payment — Al-Madina Traders', 40000, 'bank', now() - interval '1 day 3 hours')
  on conflict (id) do nothing;

  raise notice 'SteelKhata demo seed ready for business % (owner %).', v_business, v_owner;
end;
$seed$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Optional verification queries
-- ═══════════════════════════════════════════════════════════════════════════
-- select count(*) as products from public.products;
-- select count(*) as khatay from public.parties where type <> 'walk_in_cash';
-- select type, count(*), sum(total_amount) from public.transactions group by type;
