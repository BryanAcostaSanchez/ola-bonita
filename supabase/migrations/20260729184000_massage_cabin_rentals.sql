-- Independent calendar for external massage-cabin rentals.
create table if not exists public.rental_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes in (15, 30, 60)),
  booking_duration_minutes integer not null default 30 check (booking_duration_minutes >= 15),
  capacity_per_slot integer not null default 1 check (capacity_per_slot between 1 and 20),
  price_cents integer not null default 0 check (price_cents >= 0),
  deposit_enabled boolean not null default false,
  deposit_percent numeric(5,2) not null default 0 check (deposit_percent between 0 and 100),
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rental_space_hours (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.rental_spaces on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  active boolean not null default true,
  unique(space_id, day_of_week),
  check (closes_at > opens_at)
);

create table if not exists public.rental_reservations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.rental_spaces on delete restrict,
  public_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  full_name text not null,
  phone text not null,
  email text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled')),
  price_cents integer not null default 0,
  deposit_due_cents integer not null default 0,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending', 'paid', 'failed')),
  payment_provider text,
  payment_preference_id text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists rental_reservations_space_time_idx on public.rental_reservations(space_id, starts_at);

alter table public.rental_spaces enable row level security;
alter table public.rental_space_hours enable row level security;
alter table public.rental_reservations enable row level security;
create policy "staff read rental spaces" on public.rental_spaces for select to authenticated using (public.is_staff());
create policy "front desk manages rental spaces" on public.rental_spaces for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "staff read rental hours" on public.rental_space_hours for select to authenticated using (public.is_staff());
create policy "front desk manages rental hours" on public.rental_space_hours for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "front desk manages rental reservations" on public.rental_reservations for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
grant all privileges on public.rental_spaces, public.rental_space_hours, public.rental_reservations to service_role;

insert into public.rental_spaces (name, slug) values ('Cabina de masajes', 'cabina-masajes') on conflict (slug) do nothing;
insert into public.rental_space_hours (space_id, day_of_week, opens_at, closes_at, active)
select id, day, open_at, close_at, true from public.rental_spaces cross join (values (0, '10:00'::time, '16:00'::time), (1, '09:00'::time, '18:00'::time), (2, '09:00'::time, '18:00'::time), (3, '09:00'::time, '18:00'::time), (4, '09:00'::time, '18:00'::time), (5, '09:00'::time, '18:00'::time), (6, '10:00'::time, '16:00'::time)) as schedule(day, open_at, close_at)
where slug = 'cabina-masajes' on conflict (space_id, day_of_week) do nothing;

create or replace function public.get_rental_slots(p_slug text, p_date date)
returns table(starts_at timestamptz, ends_at timestamptz, remaining_capacity integer)
language sql stable security definer set search_path = public as $$
  with space as (select * from public.rental_spaces where slug = p_slug and active), hours as (select h.* from public.rental_space_hours h join space s on s.id = h.space_id where h.day_of_week = extract(dow from p_date)::smallint and h.active), candidates as (
    select s.id space_id, generate_series((p_date + h.opens_at) at time zone s.timezone, ((p_date + h.closes_at) at time zone s.timezone) - (s.booking_duration_minutes || ' minutes')::interval, (s.slot_interval_minutes || ' minutes')::interval) start_at, s.booking_duration_minutes, s.capacity_per_slot
    from space s join hours h on h.space_id = s.id
  )
  select candidate.start_at, candidate.start_at + (candidate.booking_duration_minutes || ' minutes')::interval, candidate.capacity_per_slot - count(reservation.id)::integer
  from candidates candidate left join public.rental_reservations reservation on reservation.space_id = candidate.space_id and reservation.status in ('pending','confirmed') and reservation.starts_at < candidate.start_at + (candidate.booking_duration_minutes || ' minutes')::interval and reservation.ends_at > candidate.start_at
  group by candidate.start_at, candidate.booking_duration_minutes, candidate.capacity_per_slot
  having count(reservation.id) < candidate.capacity_per_slot order by candidate.start_at;
$$;

create or replace function public.create_rental_reservation(p_slug text, p_starts_at timestamptz, p_full_name text, p_phone text, p_email text default null)
returns table(reservation_id uuid, public_code text, price_cents integer, deposit_due_cents integer)
language plpgsql security definer set search_path = public as $$
declare v_space public.rental_spaces; v_end timestamptz; v_count integer; v_reservation public.rental_reservations;
begin
  select * into v_space from public.rental_spaces where slug = p_slug and active for update;
  if v_space.id is null then raise exception 'La cabina no está disponible'; end if;
  if p_starts_at <= now() then raise exception 'Elige un horario futuro'; end if;
  if nullif(trim(coalesce(p_full_name,'')), '') is null or nullif(trim(coalesce(p_phone,'')), '') is null then raise exception 'Nombre y teléfono son obligatorios'; end if;
  v_end := p_starts_at + (v_space.booking_duration_minutes || ' minutes')::interval;
  if not exists (select 1 from public.rental_space_hours where space_id = v_space.id and day_of_week = extract(dow from (p_starts_at at time zone v_space.timezone))::smallint and active and (p_starts_at at time zone v_space.timezone)::time >= opens_at and (v_end at time zone v_space.timezone)::time <= closes_at) then raise exception 'Este horario no está disponible'; end if;
  perform pg_advisory_xact_lock(hashtext(v_space.id::text || p_starts_at::text));
  select count(*) into v_count from public.rental_reservations where space_id = v_space.id and status in ('pending','confirmed') and starts_at < v_end and ends_at > p_starts_at;
  if v_count >= v_space.capacity_per_slot then raise exception 'Este horario acaba de ocuparse'; end if;
  insert into public.rental_reservations (space_id, full_name, phone, email, starts_at, ends_at, price_cents, deposit_due_cents, status, payment_status) values (v_space.id, trim(p_full_name), trim(p_phone), nullif(trim(coalesce(p_email,'')), ''), p_starts_at, v_end, v_space.price_cents, case when v_space.deposit_enabled then round(v_space.price_cents * v_space.deposit_percent / 100.0)::integer else 0 end, case when v_space.deposit_enabled then 'pending' else 'confirmed' end, case when v_space.deposit_enabled then 'pending' else 'unpaid' end) returning * into v_reservation;
  return query select v_reservation.id, v_reservation.public_code, v_reservation.price_cents, v_reservation.deposit_due_cents;
end;
$$;
grant execute on function public.get_rental_slots(text, date) to anon, authenticated;
grant execute on function public.create_rental_reservation(text, timestamptz, text, text, text) to anon, authenticated;
