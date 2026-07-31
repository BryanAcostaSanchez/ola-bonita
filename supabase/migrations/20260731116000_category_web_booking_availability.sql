-- Categories inherit the business schedule by default. A category can opt into
-- its own schedule and concurrent-booking capacity when it uses a different area.
alter table public.business_settings
  add column if not exists web_booking_capacity integer not null default 10
  check (web_booking_capacity between 1 and 50);

create table public.category_booking_settings (
  category_id uuid primary key references public.service_categories(id) on delete cascade,
  custom_schedule_enabled boolean not null default false,
  web_booking_capacity integer not null default 1 check (web_booking_capacity between 1 and 50),
  updated_at timestamptz not null default now()
);

create table public.category_booking_hours (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  active boolean not null default true,
  check (closes_at > opens_at),
  unique(category_id, day_of_week)
);

alter table public.category_booking_settings enable row level security;
alter table public.category_booking_hours enable row level security;
create policy "front desk manages category booking settings" on public.category_booking_settings for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "front desk manages category booking hours" on public.category_booking_hours for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());

create or replace function public.save_category_booking_settings(
  p_category_id uuid,
  p_custom_schedule_enabled boolean,
  p_web_booking_capacity integer,
  p_hours jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_front_desk() then raise exception 'No tienes permisos para guardar disponibilidad por categoría'; end if;
  if not exists (select 1 from public.service_categories where id = p_category_id and active) then raise exception 'La categoría no está disponible'; end if;
  if p_web_booking_capacity not between 1 and 50 then raise exception 'El máximo de reservas debe estar entre 1 y 50'; end if;
  if p_custom_schedule_enabled and (jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) <> 7) then raise exception 'Completa los horarios de los siete días'; end if;
  if p_custom_schedule_enabled and exists (
    select 1 from jsonb_to_recordset(p_hours) as hour(day_of_week smallint, opens_at time, closes_at time, active boolean)
    where hour.day_of_week not between 0 and 6 or (coalesce(hour.active, false) and (hour.opens_at is null or hour.closes_at is null or hour.closes_at <= hour.opens_at))
  ) then raise exception 'Revisa los horarios activos de la categoría'; end if;

  insert into public.category_booking_settings(category_id, custom_schedule_enabled, web_booking_capacity, updated_at)
  values (p_category_id, p_custom_schedule_enabled, p_web_booking_capacity, now())
  on conflict (category_id) do update set custom_schedule_enabled = excluded.custom_schedule_enabled, web_booking_capacity = excluded.web_booking_capacity, updated_at = now();

  if p_custom_schedule_enabled then
    insert into public.category_booking_hours(category_id, day_of_week, opens_at, closes_at, active)
    select p_category_id, hour.day_of_week, hour.opens_at, hour.closes_at, coalesce(hour.active, false)
    from jsonb_to_recordset(p_hours) as hour(day_of_week smallint, opens_at time, closes_at time, active boolean)
    on conflict (category_id, day_of_week) do update set opens_at = excluded.opens_at, closes_at = excluded.closes_at, active = excluded.active;
  end if;
end;
$$;

create or replace function public.get_available_slots(p_service_id uuid, p_date date, p_specialist_id uuid default null)
returns table (specialist_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  with setting as (
    select timezone, booking_lead_time_minutes, slot_interval_minutes, web_booking_capacity from public.business_settings order by created_at asc limit 1
  ), service as (
    select id, category_id, duration_minutes + buffer_after_minutes as total_minutes from public.services where id = p_service_id and active and online_bookable
  ), rule as (
    select coalesce(category_rule.custom_schedule_enabled, false) as is_custom, coalesce(category_rule.web_booking_capacity, setting.web_booking_capacity) as capacity
    from setting cross join service left join public.category_booking_settings category_rule on category_rule.category_id = service.category_id
  ), schedule as (
    select h.opens_at, h.closes_at from public.category_booking_hours h cross join rule where rule.is_custom and h.category_id = (select category_id from service) and h.active and h.day_of_week = extract(dow from p_date)::smallint
    union all
    select h.opens_at, h.closes_at from public.business_hours h cross join rule where not rule.is_custom and h.active and h.day_of_week = extract(dow from p_date)::smallint
  ), candidates as (
    select ((p_date + schedule.opens_at) at time zone setting.timezone) as candidate_start, ((p_date + schedule.opens_at + make_interval(mins => service.total_minutes)) at time zone setting.timezone) as candidate_end, ((p_date + schedule.closes_at) at time zone setting.timezone) as close_at, setting.booking_lead_time_minutes, rule.capacity, rule.is_custom
    from schedule cross join setting cross join service cross join rule
  ), slots as (
    select generate_series(candidate_start, close_at - (candidate_end - candidate_start), make_interval(mins => (select slot_interval_minutes from setting))) as starts_at, candidate_end - candidate_start as duration, booking_lead_time_minutes, capacity, is_custom from candidates
  )
  select null::uuid, slots.starts_at, slots.starts_at + slots.duration from slots
  where slots.starts_at >= now() + make_interval(mins => slots.booking_lead_time_minutes)
    and (select count(*) from public.bookings b join public.services booked_service on booked_service.id = b.service_id where b.status not in ('cancelled','no_show') and b.starts_at < slots.starts_at + slots.duration and b.ends_at > slots.starts_at and (not slots.is_custom or booked_service.category_id = (select category_id from service))) < slots.capacity
  order by slots.starts_at;
$$;

grant select, insert, update, delete on public.category_booking_settings, public.category_booking_hours to authenticated;
grant execute on function public.save_category_booking_settings(uuid, boolean, integer, jsonb) to authenticated;
