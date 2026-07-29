-- Public web availability is business-wide and independent from specialists.
alter table public.business_settings
  add column if not exists web_booking_capacity integer not null default 10
  check (web_booking_capacity between 1 and 50);

create or replace function public.get_available_slots(p_service_id uuid, p_date date, p_specialist_id uuid default null)
returns table (specialist_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  with setting as (
    select timezone, booking_lead_time_minutes, slot_interval_minutes, web_booking_capacity
    from public.business_settings order by created_at asc limit 1
  ), service as (
    select duration_minutes + buffer_after_minutes as total_minutes
    from public.services where id = p_service_id and active and online_bookable
  ), candidates as (
    select ((p_date + h.opens_at) at time zone setting.timezone) as candidate_start,
      ((p_date + h.opens_at + make_interval(mins => service.total_minutes)) at time zone setting.timezone) as candidate_end,
      ((p_date + h.closes_at) at time zone setting.timezone) as close_at,
      setting.booking_lead_time_minutes, setting.web_booking_capacity
    from public.business_hours h cross join setting cross join service
    where h.active and h.day_of_week = extract(dow from p_date)::smallint
  ), slots as (
    select generate_series(candidate_start, close_at - (candidate_end - candidate_start), make_interval(mins => (select slot_interval_minutes from setting))) as starts_at,
      candidate_end - candidate_start as duration, booking_lead_time_minutes, web_booking_capacity
    from candidates
  )
  select null::uuid, slots.starts_at, slots.starts_at + slots.duration
  from slots
  where slots.starts_at >= now() + make_interval(mins => slots.booking_lead_time_minutes)
    and (select count(*) from public.bookings b where b.status not in ('cancelled','no_show') and b.starts_at < slots.starts_at + slots.duration and b.ends_at > slots.starts_at) < slots.web_booking_capacity
  order by slots.starts_at;
$$;

create or replace function public.create_public_booking(p_service_id uuid, p_specialist_id uuid, p_starts_at timestamptz, p_full_name text, p_phone text, p_email text default null, p_notes text default null)
returns table (booking_id uuid, public_code text, price_cents integer, deposit_due_cents integer, deposit_percent numeric, payment_status public.payment_status)
language plpgsql security definer set search_path = public as $$
declare v_customer_id uuid; v_service record; v_setting record; v_ends_at timestamptz; v_deposit_percent numeric; v_deposit_due integer; v_booking public.bookings;
begin
  if nullif(trim(p_full_name), '') is null or nullif(trim(p_phone), '') is null then raise exception 'Name and phone are required'; end if;
  if p_starts_at <= now() then raise exception 'This time is no longer available'; end if;
  select * into v_service from public.services where id = p_service_id and active and online_bookable;
  if not found then raise exception 'Service is not available'; end if;
  select * into v_setting from public.business_settings order by created_at asc limit 1;
  if not found then raise exception 'Business settings are missing'; end if;
  perform pg_advisory_xact_lock(hashtext(p_starts_at::text));
  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes + v_service.buffer_after_minutes);
  if not exists (select 1 from public.get_available_slots(p_service_id, (p_starts_at at time zone v_setting.timezone)::date, null) slot where slot.starts_at = p_starts_at and slot.ends_at = v_ends_at) then raise exception 'This time was just booked. Please choose another.'; end if;
  if nullif(trim(coalesce(p_email, '')), '') is null then insert into public.customers (full_name, phone, notes) values (trim(p_full_name), trim(p_phone), nullif(trim(coalesce(p_notes, '')), '')) returning id into v_customer_id;
  else insert into public.customers (full_name, phone, email, notes) values (trim(p_full_name), trim(p_phone), lower(trim(p_email)), nullif(trim(coalesce(p_notes, '')), '')) on conflict (email) do update set full_name = excluded.full_name, phone = excluded.phone, notes = coalesce(excluded.notes, public.customers.notes), updated_at = now() returning id into v_customer_id; end if;
  v_deposit_percent := case when coalesce(v_service.deposit_enabled, v_setting.booking_deposit_enabled) then coalesce(v_service.deposit_percent, v_setting.booking_deposit_percent) else 0 end;
  v_deposit_due := round(v_service.price_cents * v_deposit_percent / 100.0)::integer;
  insert into public.bookings (customer_id, service_id, specialist_id, starts_at, ends_at, price_cents, deposit_percent, deposit_due_cents, payment_status, source) values (v_customer_id, p_service_id, null, p_starts_at, v_ends_at, v_service.price_cents, v_deposit_percent, v_deposit_due, case when v_deposit_due > 0 then 'deposit_due'::public.payment_status else 'unpaid'::public.payment_status end, 'web') returning * into v_booking;
  return query select v_booking.id, v_booking.public_code, v_booking.price_cents, v_booking.deposit_due_cents, v_booking.deposit_percent, v_booking.payment_status;
end;
$$;
