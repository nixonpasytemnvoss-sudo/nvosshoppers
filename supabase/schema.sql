-- ============================================================
--  NVOS Market · esquema de base de datos para Supabase
--  Pégalo completo en: Supabase → SQL Editor → New query → Run
--  Es idempotente: puedes volver a ejecutarlo sin romper nada.
-- ============================================================

create extension if not exists "pgcrypto";

-- Ajustes generales (precios, canales, contador de pedidos)
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Productos propios (los que cargas tú: AndesFood, Tequemosh, chocolates…)
create table if not exists public.products_manual (
  id         text primary key,
  upc        text,
  name       text not null,
  brand      text,
  category   text,
  cost       numeric(12,2) not null default 0,
  stock      integer not null default 0,
  active     boolean not null default true,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_manual_upc_idx on public.products_manual (upc);
create index if not exists products_manual_category_idx on public.products_manual (category);

-- Ficha por UPC (categoría, peso, medidas, al mayor, destacado) para cualquier
-- producto, incluidos los que vienen del proveedor
create table if not exists public.product_meta (
  upc        text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Pedidos
create table if not exists public.orders (
  id         uuid primary key default gen_random_uuid(),
  number     text unique not null,
  user_id    text,
  email      text,
  status     text not null default 'pendiente_pago',
  channel    text not null default 'web',
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists orders_email_idx on public.orders (email);
create index if not exists orders_user_idx on public.orders (user_id);
create index if not exists orders_status_idx on public.orders (status);

-- Perfil de cada cliente (se crea en su primer ingreso; id = auth.users.id)
create table if not exists public.profiles (
  id          text primary key,
  email       text unique,
  name        text,
  avatar      text,
  provider    text,
  welcomed_at timestamptz,
  shipping    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- Carrito guardado por usuario
create table if not exists public.carts (
  user_id    text primary key,
  items      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Inventario comprometido por UPC y bitácora de movimientos
create table if not exists public.inventory_ledger (
  upc        text primary key,
  committed  integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.inventory_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  channel     text,
  external_id text,
  upc         text,
  qty         integer,
  kind        text,
  extra       jsonb not null default '{}'::jsonb
);
create index if not exists inventory_log_at_idx on public.inventory_log (at desc);

-- Inventario propio primero: de lo comprometido, cuánto salió de TU mercancía
alter table public.inventory_ledger
  add column if not exists committed_own integer not null default 0;

-- Códigos de referido (el admin activa un código por cliente elegido)
create table if not exists public.referral_codes (
  code       text primary key,
  user_id    text,
  email      text,
  name       text,
  enabled    boolean not null default true,
  buyer_pct  numeric(6,2),          -- descuento del comprador; null = usa la regla general
  owner_pct  numeric(6,2),          -- % que gana el dueño del código; null = regla general
  balance    numeric(12,2) not null default 0,   -- saldo disponible para compras
  earned     numeric(12,2) not null default 0,   -- total ganado histórico
  uses       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists referral_codes_email_idx on public.referral_codes (email);

-- Bitácora de movimientos de saldo de referidos
create table if not exists public.referral_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  code         text,
  order_number text,
  kind         text,                -- earn | spend | reverse | refund | adjust
  amount       numeric(12,2),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists referral_log_code_idx on public.referral_log (code, at desc);

-- ------------------------------------------------------------
--  Seguridad: solo el servidor (service_role) toca las tablas.
--  Los clientes nunca hablan con PostgREST directamente; solo con
--  la API de Node, que valida su sesión.
-- ------------------------------------------------------------
alter table public.settings         enable row level security;
alter table public.products_manual  enable row level security;
alter table public.product_meta     enable row level security;
alter table public.orders           enable row level security;
alter table public.profiles         enable row level security;
alter table public.carts            enable row level security;
alter table public.inventory_ledger enable row level security;
alter table public.inventory_log    enable row level security;
alter table public.referral_codes   enable row level security;
alter table public.referral_log     enable row level security;
-- (sin políticas = anon/authenticated no pueden leer ni escribir; service_role sí)

-- ------------------------------------------------------------
--  Storage: bucket público para fotos de productos
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do update set public = true;

drop policy if exists "productos lectura publica" on storage.objects;
create policy "productos lectura publica"
  on storage.objects for select
  using (bucket_id = 'productos');
