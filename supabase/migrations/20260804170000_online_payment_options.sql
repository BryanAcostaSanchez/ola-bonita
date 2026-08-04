-- Let the business choose whether clients may pay a deposit, the full amount,
-- or either option during online checkout.
alter table public.business_settings
  add column if not exists online_payment_options text[] not null default array['deposit']::text[];

alter table public.business_settings
  drop constraint if exists business_settings_online_payment_options_check;
alter table public.business_settings
  add constraint business_settings_online_payment_options_check
  check (cardinality(online_payment_options) > 0 and online_payment_options <@ array['deposit', 'full']::text[]);

alter table public.bookings
  add column if not exists online_payment_kind text check (online_payment_kind in ('deposit', 'full')),
  add column if not exists online_payment_cents integer not null default 0 check (online_payment_cents >= 0);

alter table public.rental_spaces
  add column if not exists online_payment_options text[] not null default array['deposit']::text[];

alter table public.rental_spaces
  drop constraint if exists rental_spaces_online_payment_options_check;
alter table public.rental_spaces
  add constraint rental_spaces_online_payment_options_check
  check (cardinality(online_payment_options) > 0 and online_payment_options <@ array['deposit', 'full']::text[]);

alter table public.rental_reservations
  add column if not exists online_payment_kind text check (online_payment_kind in ('deposit', 'full')),
  add column if not exists online_payment_cents integer not null default 0 check (online_payment_cents >= 0);

drop function if exists public.get_public_booking_settings();
create function public.get_public_booking_settings()
returns table (
  timezone text,
  deposit_enabled boolean,
  deposit_percent numeric,
  lead_time_minutes integer,
  slot_interval_minutes integer,
  payment_ready boolean,
  online_payment_options text[]
)
language sql stable security definer set search_path = public as $$
  select settings.timezone, settings.booking_deposit_enabled, settings.booking_deposit_percent,
         settings.booking_lead_time_minutes, settings.slot_interval_minutes,
         exists (select 1 from public.payment_integrations where provider = 'mercadopago' and access_token_secret_id is not null and webhook_secret_id is not null),
         settings.online_payment_options
  from public.business_settings settings
  order by settings.created_at asc limit 1;
$$;
grant execute on function public.get_public_booking_settings() to anon, authenticated;

drop function if exists public.save_rental_space_settings(uuid, boolean, integer, integer, integer, boolean, numeric, jsonb);
create function public.save_rental_space_settings(
  p_space_id uuid, p_active boolean, p_booking_duration_minutes integer,
  p_capacity_per_slot integer, p_price_cents integer, p_deposit_enabled boolean,
  p_deposit_percent numeric, p_online_payment_options text[], p_hours jsonb
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('settings.cabin') then raise exception 'No tienes permisos para configurar la cabina'; end if;
  if not exists(select 1 from public.rental_spaces where id=p_space_id)
    or p_booking_duration_minutes not in (30,45,60,90,120)
    or p_capacity_per_slot not between 1 and 20 or p_price_cents < 0
    or p_deposit_percent not between 0 and 100 or jsonb_typeof(p_hours) <> 'array'
    or cardinality(p_online_payment_options) = 0
    or not (p_online_payment_options <@ array['deposit','full']::text[]) then
    raise exception 'La configuración de cabina no es válida';
  end if;
  update public.rental_spaces set active=p_active, booking_duration_minutes=p_booking_duration_minutes,
    slot_interval_minutes=p_booking_duration_minutes, capacity_per_slot=p_capacity_per_slot,
    price_cents=p_price_cents, deposit_enabled=p_deposit_enabled, deposit_percent=p_deposit_percent,
    online_payment_options=p_online_payment_options, updated_at=now() where id=p_space_id;
  delete from public.rental_space_hours where space_id=p_space_id;
  insert into public.rental_space_hours(space_id,day_of_week,opens_at,closes_at,active)
  select p_space_id,h.day_of_week,h.opens_at,h.closes_at,coalesce(h.active,true)
  from jsonb_to_recordset(p_hours) h(day_of_week smallint,opens_at time,closes_at time,active boolean);
end;
$$;
grant execute on function public.save_rental_space_settings(uuid, boolean, integer, integer, integer, boolean, numeric, text[], jsonb) to authenticated;
