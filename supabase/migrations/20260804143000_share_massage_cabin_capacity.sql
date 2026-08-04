-- A service category can require a rentable space. This makes the public
-- service agenda and the external-cabin calendar reserve the same capacity.
alter table public.category_booking_settings
  add column if not exists rental_space_id uuid references public.rental_spaces(id) on delete set null;

create index if not exists category_booking_settings_rental_space_idx
  on public.category_booking_settings(rental_space_id)
  where rental_space_id is not null;

-- The existing massage category uses the massage cabin by default. This is a
-- setting, not a name-based rule: it can be changed from Agenda web later.
insert into public.category_booking_settings(category_id, rental_space_id)
select category.id, space.id
from public.service_categories category
join public.rental_spaces space on space.slug = 'cabina-masajes'
where category.slug = 'masajes'
on conflict (category_id) do update set rental_space_id = excluded.rental_space_id;

create or replace function public.set_category_booking_space(
  p_category_id uuid,
  p_rental_space_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('settings.agenda') then
    raise exception 'No tienes permisos para configurar la agenda';
  end if;
  if not exists (select 1 from public.service_categories where id = p_category_id and active) then
    raise exception 'La categoría no está disponible';
  end if;
  if p_rental_space_id is not null and not exists (select 1 from public.rental_spaces where id = p_rental_space_id and active) then
    raise exception 'El espacio no está disponible';
  end if;
  insert into public.category_booking_settings(category_id, rental_space_id, updated_at)
  values (p_category_id, p_rental_space_id, now())
  on conflict (category_id) do update
    set rental_space_id = excluded.rental_space_id, updated_at = now();
end;
$$;

-- Service availability now consumes the linked physical-space capacity too.
create or replace function public.get_available_slots(p_service_id uuid, p_date date, p_specialist_id uuid default null)
returns table (specialist_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  with setting as (
    select timezone, booking_lead_time_minutes, slot_interval_minutes, web_booking_capacity from public.business_settings order by created_at asc limit 1
  ), service as (
    select id, category_id, duration_minutes + buffer_after_minutes as total_minutes from public.services where id = p_service_id and active and online_bookable
  ), rule as (
    select coalesce(category_rule.custom_schedule_enabled, false) as is_custom,
      coalesce(category_rule.web_booking_capacity, setting.web_booking_capacity) as capacity,
      category_rule.rental_space_id
    from setting cross join service left join public.category_booking_settings category_rule on category_rule.category_id = service.category_id
  ), schedule as (
    select h.opens_at, h.closes_at from public.category_booking_hours h cross join rule where rule.is_custom and h.category_id = (select category_id from service) and h.active and h.day_of_week = extract(dow from p_date)::smallint
    union all
    select h.opens_at, h.closes_at from public.business_hours h cross join rule where not rule.is_custom and h.active and h.day_of_week = extract(dow from p_date)::smallint
  ), candidates as (
    select ((p_date + schedule.opens_at) at time zone setting.timezone) as candidate_start,
      ((p_date + schedule.opens_at + make_interval(mins => service.total_minutes)) at time zone setting.timezone) as candidate_end,
      ((p_date + schedule.closes_at) at time zone setting.timezone) as close_at,
      setting.booking_lead_time_minutes, rule.capacity, rule.is_custom, rule.rental_space_id
    from schedule cross join setting cross join service cross join rule
  ), slots as (
    select generate_series(candidate_start, close_at - (candidate_end - candidate_start), make_interval(mins => (select slot_interval_minutes from setting))) as starts_at,
      candidate_end - candidate_start as duration, booking_lead_time_minutes, capacity, is_custom, rental_space_id
    from candidates
  )
  select null::uuid, slots.starts_at, slots.starts_at + slots.duration from slots
  where slots.starts_at >= now() + make_interval(mins => slots.booking_lead_time_minutes)
    and (select count(*) from public.bookings b join public.services booked_service on booked_service.id = b.service_id where b.status not in ('cancelled','no_show') and b.starts_at < slots.starts_at + slots.duration and b.ends_at > slots.starts_at and (not slots.is_custom or booked_service.category_id = (select category_id from service))) < slots.capacity
    and (slots.rental_space_id is null or (
      select count(*) from public.rental_reservations reservation
      where reservation.space_id = slots.rental_space_id and reservation.status in ('pending','confirmed')
        and reservation.starts_at < slots.starts_at + slots.duration and reservation.ends_at > slots.starts_at
    ) + (
      select count(*) from public.bookings booking
      join public.services booked_service on booked_service.id = booking.service_id
      join public.category_booking_settings booked_rule on booked_rule.category_id = booked_service.category_id
      where booked_rule.rental_space_id = slots.rental_space_id and booking.status not in ('cancelled','no_show')
        and booking.starts_at < slots.starts_at + slots.duration and booking.ends_at > slots.starts_at
    ) < (select capacity_per_slot from public.rental_spaces where id = slots.rental_space_id and active)
  )
  order by slots.starts_at;
$$;

-- Re-check cabin capacity against service bookings at write time, under the
-- same advisory lock used by service bookings that require this space.
create or replace function public.create_rental_reservation(p_slug text, p_starts_at timestamptz, p_full_name text, p_phone text, p_email text default null)
returns table(reservation_id uuid, public_code text, price_cents integer, deposit_due_cents integer)
language plpgsql security definer set search_path = public as $$
declare v_space public.rental_spaces; v_end timestamptz; v_count integer; v_reservation public.rental_reservations;
begin
  select * into v_space from public.rental_spaces where slug = p_slug and active for update;
  if v_space.id is null then raise exception 'La cabina no está disponible'; end if;
  perform pg_advisory_xact_lock(hashtext('rental-space:' || v_space.id::text));
  if p_starts_at <= now() then raise exception 'Elige un horario futuro'; end if;
  if nullif(trim(coalesce(p_full_name,'')), '') is null or nullif(trim(coalesce(p_phone,'')), '') is null then raise exception 'Nombre y teléfono son obligatorios'; end if;
  v_end := p_starts_at + (v_space.booking_duration_minutes || ' minutes')::interval;
  if not exists (select 1 from public.rental_space_hours where space_id = v_space.id and day_of_week = extract(dow from (p_starts_at at time zone v_space.timezone))::smallint and active and (p_starts_at at time zone v_space.timezone)::time >= opens_at and (v_end at time zone v_space.timezone)::time <= closes_at) then raise exception 'Este horario no está disponible'; end if;
  select count(*) into v_count from public.rental_reservations where space_id = v_space.id and status in ('pending','confirmed') and starts_at < v_end and ends_at > p_starts_at;
  select v_count + count(*) into v_count from public.bookings booking join public.services service on service.id = booking.service_id join public.category_booking_settings rule on rule.category_id = service.category_id where rule.rental_space_id = v_space.id and booking.status not in ('cancelled','no_show') and booking.starts_at < v_end and booking.ends_at > p_starts_at;
  if v_count >= v_space.capacity_per_slot then raise exception 'Este horario acaba de ocuparse'; end if;
  insert into public.rental_reservations (space_id, full_name, phone, email, starts_at, ends_at, price_cents, deposit_due_cents, status, payment_status) values (v_space.id, trim(p_full_name), trim(p_phone), nullif(trim(coalesce(p_email,'')), ''), p_starts_at, v_end, v_space.price_cents, case when v_space.deposit_enabled then round(v_space.price_cents * v_space.deposit_percent / 100.0)::integer else 0 end, case when v_space.deposit_enabled then 'pending' else 'confirmed' end, case when v_space.deposit_enabled then 'pending' else 'unpaid' end) returning * into v_reservation;
  return query select v_reservation.id, v_reservation.public_code, v_reservation.price_cents, v_reservation.deposit_due_cents;
end;
$$;

create or replace function public.get_rental_slots(p_slug text, p_date date)
returns table(starts_at timestamptz, ends_at timestamptz, remaining_capacity integer)
language sql stable security definer set search_path = public as $$
  with space as (select * from public.rental_spaces where slug = p_slug and active), hours as (select h.* from public.rental_space_hours h join space s on s.id = h.space_id where h.day_of_week = extract(dow from p_date)::smallint and h.active), candidates as (
    select s.id space_id, generate_series((p_date + h.opens_at) at time zone s.timezone, ((p_date + h.closes_at) at time zone s.timezone) - (s.booking_duration_minutes || ' minutes')::interval, (s.slot_interval_minutes || ' minutes')::interval) start_at, s.booking_duration_minutes, s.capacity_per_slot
    from space s join hours h on h.space_id = s.id
  )
  select candidate.start_at, candidate.start_at + (candidate.booking_duration_minutes || ' minutes')::interval,
    candidate.capacity_per_slot - (
      (select count(*) from public.rental_reservations reservation where reservation.space_id = candidate.space_id and reservation.status in ('pending','confirmed') and reservation.starts_at < candidate.start_at + (candidate.booking_duration_minutes || ' minutes')::interval and reservation.ends_at > candidate.start_at)
      +
      (select count(*) from public.bookings booking join public.services service on service.id = booking.service_id join public.category_booking_settings rule on rule.category_id = service.category_id where rule.rental_space_id = candidate.space_id and booking.status not in ('cancelled','no_show') and booking.starts_at < candidate.start_at + (candidate.booking_duration_minutes || ' minutes')::interval and booking.ends_at > candidate.start_at)
    )::integer
  from candidates candidate
  where (
    (select count(*) from public.rental_reservations reservation where reservation.space_id = candidate.space_id and reservation.status in ('pending','confirmed') and reservation.starts_at < candidate.start_at + (candidate.booking_duration_minutes || ' minutes')::interval and reservation.ends_at > candidate.start_at)
    +
    (select count(*) from public.bookings booking join public.services service on service.id = booking.service_id join public.category_booking_settings rule on rule.category_id = service.category_id where rule.rental_space_id = candidate.space_id and booking.status not in ('cancelled','no_show') and booking.starts_at < candidate.start_at + (candidate.booking_duration_minutes || ' minutes')::interval and booking.ends_at > candidate.start_at)
  ) < candidate.capacity_per_slot
  order by candidate.start_at;
$$;

-- Keep the resource lock when a public service booking is inserted.
create or replace function public.create_public_booking(p_service_id uuid, p_specialist_id uuid, p_starts_at timestamptz, p_full_name text, p_phone text, p_email text default null, p_notes text default null)
returns table (booking_id uuid, public_code text, price_cents integer, deposit_due_cents integer, deposit_percent numeric, payment_status public.payment_status)
language plpgsql security definer set search_path = public as $$
declare v_customer_id uuid; v_service record; v_setting record; v_ends_at timestamptz; v_deposit_percent numeric; v_deposit_due integer; v_booking public.bookings; v_rental_space_id uuid;
begin
  if nullif(trim(p_full_name), '') is null or nullif(trim(p_phone), '') is null then raise exception 'Name and phone are required'; end if;
  if p_starts_at <= now() then raise exception 'This time is no longer available'; end if;
  select * into v_service from public.services where id = p_service_id and active and online_bookable;
  if not found then raise exception 'Service is not available'; end if;
  select * into v_setting from public.business_settings order by created_at asc limit 1;
  if not found then raise exception 'Business settings are missing'; end if;
  select rental_space_id into v_rental_space_id from public.category_booking_settings where category_id = v_service.category_id;
  perform pg_advisory_xact_lock(hashtext(p_starts_at::text));
  if v_rental_space_id is not null then perform pg_advisory_xact_lock(hashtext('rental-space:' || v_rental_space_id::text)); end if;
  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes + v_service.buffer_after_minutes);
  if not exists (select 1 from public.get_available_slots(p_service_id, (p_starts_at at time zone v_setting.timezone)::date, null) slot where slot.starts_at = p_starts_at and slot.ends_at = v_ends_at) then raise exception 'This time was just booked. Please choose another.'; end if;
  if nullif(trim(coalesce(p_email, '')), '') is null then insert into public.customers (full_name, phone, notes) values (trim(p_full_name), trim(p_phone), nullif(trim(coalesce(p_notes, '')), '')) returning id into v_customer_id;
  else insert into public.customers (full_name, phone, email, notes) values (trim(p_full_name), trim(p_phone), lower(trim(p_email)), nullif(trim(coalesce(p_notes, '')), '')) on conflict (email) do update set full_name = excluded.full_name, phone = excluded.phone, notes = coalesce(excluded.notes, public.customers.notes), updated_at = now() returning id into v_customer_id; end if;
  v_deposit_percent := case when coalesce(v_service.deposit_enabled, v_setting.booking_deposit_enabled) then coalesce(v_service.deposit_percent, v_setting.booking_deposit_percent) else 0 end;
  v_deposit_due := round(v_service.price_cents * v_deposit_percent / 100.0)::integer;
  insert into public.bookings (customer_id, service_id, specialist_id, starts_at, ends_at, price_cents, deposit_percent, deposit_due_cents, payment_status, source) values (v_customer_id, v_service.id, null, p_starts_at, v_ends_at, v_service.price_cents, v_deposit_percent, v_deposit_due, case when v_deposit_due > 0 then 'deposit_due'::public.payment_status else 'unpaid'::public.payment_status end, 'web') returning * into v_booking;
  return query select v_booking.id, v_booking.public_code, v_booking.price_cents, v_booking.deposit_due_cents, v_booking.deposit_percent, v_booking.payment_status;
end;
$$;

grant execute on function public.set_category_booking_space(uuid, uuid) to authenticated;
