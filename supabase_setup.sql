-- Manawa Honey Inventory — Supabase setup
-- Run this in your Supabase project: SQL Editor > New query > paste > Run.

create table if not exists products (
  id text primary key,
  sku text,
  product_name text not null,
  batch text,
  jar_size text,
  original_stock numeric default 0,
  min_stock_alert numeric default 0,
  waitawa numeric default 0,
  mataatua numeric default 0,
  mgo text,
  comments text,
  blend text,
  woo_id text,
  woo_variation_id text,
  date text,
  updated_at timestamptz default now()
);

-- If the products table already existed, make sure the newer columns are present:
alter table products add column if not exists blend text;
alter table products add column if not exists woo_id text;
alter table products add column if not exists woo_variation_id text;
alter table products add column if not exists date text;

create table if not exists transactions (
  id text primary key,
  sku text,
  product_name text,
  added timestamptz default now(),
  transaction_type text,
  entered_quantity numeric default 0,
  quantity numeric default 0,
  location text,
  team_member text,
  comments text
);

create table if not exists app_users (
  id text primary key,
  username text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

-- WooCommerce pull-sales: remembers which orders have already been deducted, so a
-- repeated webhook never double-counts a sale. Written only by the Edge Function.
create table if not exists woo_processed_orders (
  order_id text primary key,
  status text,
  items_deducted integer default 0,
  processed_at timestamptz default now()
);

-- Open RLS so any logged-in app user can read/write (app handles its own login).
alter table products enable row level security;
alter table transactions enable row level security;
alter table app_users enable row level security;
-- The webhook log is written only by the Edge Function (service role bypasses RLS);
-- enabling RLS with no anon policy keeps it private from the public app key.
alter table woo_processed_orders enable row level security;
do $$ begin
  create policy anon_all_products on products for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy anon_all_txns on transactions for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy anon_all_users on app_users for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Default login: admin / admin  (CHANGE THIS after first sign-in via the Team screen)
-- password_hash below is SHA-256 of 'admin'
insert into app_users (id, username, password_hash) values
  ('u_admin','admin','8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918')
on conflict (id) do nothing;
