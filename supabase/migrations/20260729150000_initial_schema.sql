-- Ola Bonita: production data model. Apply with the Supabase CLI or SQL editor.
create extension if not exists "pgcrypto";

create type public.user_role as enum ('owner', 'manager', 'reception', 'specialist');
create type public.booking_status as enum ('pending', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show');
create type public.payment_status as enum ('unpaid', 'deposit_due', 'deposit_paid', 'paid', 'refunded');
create type public.payment_method as enum ('cash', 'card', 'transfer', 'online');
create type public.cash_session_status as enum ('open', 'closed');

create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  business_name text not null default 'Ola Bonita Beauty Spa',
  timezone text not null default 'America/Mexico_City',
  currency text not null default 'MXN',
  booking_deposit_enabled boolean not null default false,
  booking_deposit_percent numeric(5,2) not null default 0 check (booking_deposit_percent between 0 and 100),
  booking_lead_time_minutes integer not null default 120 check (booking_lead_time_minutes >= 0),
  payment_provider text not null default 'mercadopago' check (payment_provider in ('mercadopago', 'none')),
  payment_link_expires_minutes integer not null default 30 check (payment_link_expires_minutes between 5 and 1440),
  allow_offline_checkout boolean not null default true,
  slot_interval_minutes integer not null default 15 check (slot_interval_minutes in (5, 10, 15, 20, 30)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  role public.user_role not null default 'specialist',
  phone text,
  active boolean not null default true,
  color text not null default '#0f766e',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories on delete restrict,
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents integer not null check (price_cents >= 0),
  deposit_enabled boolean,
  deposit_percent numeric(5,2) check (deposit_percent is null or deposit_percent between 0 and 100),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  active boolean not null default true,
  online_bookable boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.specialist_services (
  specialist_id uuid not null references public.profiles on delete cascade,
  service_id uuid not null references public.services on delete cascade,
  primary key (specialist_id, service_id)
);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  active boolean not null default true,
  check (closes_at > opens_at),
  unique(day_of_week)
);

insert into public.business_hours (day_of_week, opens_at, closes_at) values
  (0, '10:00', '16:00'), (1, '09:00', '18:00'), (2, '09:00', '18:00'),
  (3, '09:00', '18:00'), (4, '09:00', '18:00'), (5, '09:00', '18:00'),
  (6, '10:00', '16:00');

create table public.specialist_hours (
  id uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references public.profiles on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  active boolean not null default true,
  check (ends_at > starts_at),
  unique(specialist_id, day_of_week)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  notes text,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  customer_id uuid not null references public.customers on delete restrict,
  service_id uuid not null references public.services on delete restrict,
  specialist_id uuid references public.profiles on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'pending',
  price_cents integer not null check (price_cents >= 0),
  deposit_percent numeric(5,2) not null default 0 check (deposit_percent between 0 and 100),
  deposit_due_cents integer not null default 0 check (deposit_due_cents >= 0),
  payment_status public.payment_status not null default 'unpaid',
  source text not null default 'web' check (source in ('web', 'pos', 'phone', 'walk_in')),
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index bookings_specialist_time_idx on public.bookings(specialist_id, starts_at);
create index bookings_customer_idx on public.bookings(customer_id);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers on delete set null,
  booking_id uuid references public.bookings on delete set null,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  status text not null default 'completed' check (status in ('draft', 'completed', 'voided', 'refunded')),
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales on delete cascade,
  service_id uuid references public.services on delete set null,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer not null check (total_cents >= 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales on delete cascade,
  booking_id uuid references public.bookings on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  method public.payment_method not null,
  provider text,
  provider_reference text,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  check (sale_id is not null or booking_id is not null)
);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid references public.profiles on delete set null,
  opened_at timestamptz not null default now(),
  opening_float_cents integer not null default 0,
  closed_by uuid references public.profiles on delete set null,
  closed_at timestamptz,
  expected_cash_cents integer,
  counted_cash_cents integer,
  notes text,
  status public.cash_session_status not null default 'open'
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  expense_date date not null default current_date,
  payment_method public.payment_method not null default 'cash',
  cash_session_id uuid references public.cash_sessions on delete set null,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

alter table public.business_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.specialist_services enable row level security;
alter table public.business_hours enable row level security;
alter table public.specialist_hours enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.expenses enable row level security;

-- Public visitors may only discover catalogue and operating hours. Booking writes are
-- intentionally routed through a server action / API route using the service role.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active = true);
$$;

create policy "public can read bookable catalogue" on public.services for select using (active and online_bookable);
create policy "public can read active categories" on public.service_categories for select using (active);
create policy "public can read hours" on public.business_hours for select using (active);
create policy "staff can read profiles" on public.profiles for select to authenticated using (public.is_staff());
create policy "staff can manage profiles" on public.profiles for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage bookings" on public.bookings for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage customers" on public.customers for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage sales" on public.sales for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage sale items" on public.sale_items for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage payments" on public.payments for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage cash" on public.cash_sessions for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage expenses" on public.expenses for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage settings" on public.business_settings for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage service categories" on public.service_categories for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage services" on public.services for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage specialist services" on public.specialist_services for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage business hours" on public.business_hours for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can manage specialist hours" on public.specialist_hours for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant usage on schema public to anon, authenticated;
grant select on public.service_categories, public.services, public.business_hours to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Seed the singleton settings row after the schema is installed.
insert into public.business_settings (booking_deposit_enabled, booking_deposit_percent) values (true, 30);
