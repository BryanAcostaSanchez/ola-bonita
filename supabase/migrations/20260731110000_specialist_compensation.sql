-- Compensation belongs to the specialist/service pair: the same service can pay
-- different amounts to different specialists. Amounts are stored in cents.
create type public.specialist_payment_scheme as enum ('per_service', 'fixed_period');
create type public.specialist_payment_frequency as enum ('weekly', 'biweekly', 'monthly');

alter table public.specialist_services
  add column if not exists commission_cents integer not null default 0
  check (commission_cents >= 0);

create table public.specialist_compensation (
  specialist_id uuid primary key references public.profiles(id) on delete cascade,
  scheme public.specialist_payment_scheme not null default 'per_service',
  frequency public.specialist_payment_frequency not null default 'weekly',
  fixed_amount_cents integer not null default 0 check (fixed_amount_cents >= 0),
  updated_at timestamptz not null default now()
);

alter table public.specialist_compensation enable row level security;
create policy "owners manage specialist compensation" on public.specialist_compensation
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- A completed booking receives an immutable commission snapshot, so later rate
-- changes never alter an amount already earned.
create table public.specialist_earnings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  specialist_id uuid not null references public.profiles(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  amount_cents integer not null check (amount_cents >= 0),
  earned_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.specialist_earnings enable row level security;
create policy "owners manage specialist earnings" on public.specialist_earnings
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create index specialist_earnings_unpaid_idx on public.specialist_earnings(specialist_id, paid_at, earned_at);

create or replace function public.save_specialist_compensation(
  p_specialist_id uuid,
  p_scheme public.specialist_payment_scheme,
  p_frequency public.specialist_payment_frequency,
  p_fixed_amount_cents integer,
  p_commissions jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'No tienes permisos para modificar pagos del equipo'; end if;
  if not exists (select 1 from public.profiles where id = p_specialist_id and role = 'specialist' and active) then raise exception 'La especialista no está activa'; end if;
  if p_fixed_amount_cents < 0 then raise exception 'El importe fijo no puede ser negativo'; end if;
  if jsonb_typeof(coalesce(p_commissions, '[]'::jsonb)) <> 'array' then raise exception 'Comisiones inválidas'; end if;

  insert into public.specialist_compensation(specialist_id, scheme, frequency, fixed_amount_cents, updated_at)
  values (p_specialist_id, p_scheme, p_frequency, p_fixed_amount_cents, now())
  on conflict (specialist_id) do update set scheme = excluded.scheme, frequency = excluded.frequency, fixed_amount_cents = excluded.fixed_amount_cents, updated_at = now();

  update public.specialist_services ss set commission_cents = item.commission_cents
  from jsonb_to_recordset(p_commissions) as item(service_id uuid, commission_cents integer)
  where ss.specialist_id = p_specialist_id and ss.service_id = item.service_id and item.commission_cents >= 0;
end;
$$;

create or replace function public.complete_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_booking public.bookings; v_scheme public.specialist_payment_scheme; v_commission integer;
begin
  if not public.is_front_desk() then raise exception 'No tienes permisos para finalizar citas'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'La cita no existe'; end if;
  if v_booking.specialist_id is null then raise exception 'Asigna una especialista antes de finalizar la cita'; end if;
  if v_booking.status in ('cancelled', 'no_show') then raise exception 'No puedes finalizar una cita cancelada'; end if;
  select scheme into v_scheme from public.specialist_compensation where specialist_id = v_booking.specialist_id;
  if coalesce(v_scheme, 'per_service'::public.specialist_payment_scheme) = 'per_service' then
    select commission_cents into v_commission from public.specialist_services where specialist_id = v_booking.specialist_id and service_id = v_booking.service_id;
    if v_commission is null then raise exception 'Configura la comisión de este servicio antes de finalizar la cita'; end if;
    insert into public.specialist_earnings(booking_id, specialist_id, service_id, amount_cents)
    values (v_booking.id, v_booking.specialist_id, v_booking.service_id, v_commission)
    on conflict (booking_id) do nothing;
  end if;
  update public.bookings set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now() where id = v_booking.id;
end;
$$;

grant select, insert, update, delete on public.specialist_compensation, public.specialist_earnings to authenticated;
grant execute on function public.save_specialist_compensation(uuid, public.specialist_payment_scheme, public.specialist_payment_frequency, integer, jsonb) to authenticated;
grant execute on function public.complete_booking(uuid) to authenticated;

create or replace function public.pay_pending_specialist_earnings(p_specialist_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.is_owner() then raise exception 'No tienes permisos para registrar pagos del equipo'; end if;
  update public.specialist_earnings set paid_at = now(), paid_by = auth.uid()
  where specialist_id = p_specialist_id and paid_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.pay_pending_specialist_earnings(uuid) to authenticated;

-- Keep an existing rate when availability is edited. New service assignments
-- start at $0 until the owner enters their agreed commission.
create or replace function public.save_specialist_availability(
  p_specialist_id uuid,
  p_service_ids uuid[],
  p_hours jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_front_desk() then raise exception 'No tienes permisos para administrar especialistas'; end if;
  if not exists (select 1 from public.profiles where id = p_specialist_id and active = true and role = 'specialist') then raise exception 'Specialist not found'; end if;
  if jsonb_typeof(p_hours) <> 'array' then raise exception 'Los horarios son inválidos'; end if;

  delete from public.specialist_services
  where specialist_id = p_specialist_id
    and service_id <> all(coalesce(p_service_ids, '{}'::uuid[]));
  insert into public.specialist_services(specialist_id, service_id)
  select p_specialist_id, service_id from unnest(coalesce(p_service_ids, '{}'::uuid[])) as service_id
  where exists (select 1 from public.services where id = service_id and active = true)
  on conflict (specialist_id, service_id) do nothing;

  delete from public.specialist_hours where specialist_id = p_specialist_id;
  insert into public.specialist_hours(specialist_id, day_of_week, starts_at, ends_at, active)
  select p_specialist_id, hour.day_of_week, hour.starts_at, hour.ends_at, coalesce(hour.active, false)
  from jsonb_to_recordset(p_hours) as hour(day_of_week smallint, starts_at time, ends_at time, active boolean)
  where hour.day_of_week between 0 and 6 and hour.ends_at > hour.starts_at;
end;
$$;
