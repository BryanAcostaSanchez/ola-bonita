-- Public booking API. All writes stay inside narrowly scoped security-definer
-- functions so anonymous visitors never receive table write permissions.

create or replace function public.get_public_booking_settings()
returns table (
  timezone text,
  deposit_enabled boolean,
  deposit_percent numeric,
  lead_time_minutes integer,
  slot_interval_minutes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select timezone, booking_deposit_enabled, booking_deposit_percent,
         booking_lead_time_minutes, slot_interval_minutes
  from public.business_settings
  order by created_at asc
  limit 1;
$$;

create or replace function public.get_available_slots(
  p_service_id uuid,
  p_date date,
  p_specialist_id uuid default null
)
returns table (specialist_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with setting as (
    select timezone, booking_lead_time_minutes, slot_interval_minutes
    from public.business_settings order by created_at asc limit 1
  ), service as (
    select id, duration_minutes + buffer_after_minutes as total_minutes
    from public.services
    where id = p_service_id and active = true and online_bookable = true
  ), candidates as (
    select sh.specialist_id,
      ((p_date + sh.starts_at) at time zone setting.timezone) as candidate_start,
      ((p_date + sh.starts_at + make_interval(mins => service.total_minutes)) at time zone setting.timezone) as candidate_end,
      ((p_date + sh.ends_at) at time zone setting.timezone) as close_at,
      setting.booking_lead_time_minutes
    from public.specialist_hours sh
    join public.profiles profile on profile.id = sh.specialist_id and profile.active = true and profile.role = 'specialist'
    join public.specialist_services ss on ss.specialist_id = sh.specialist_id and ss.service_id = p_service_id
    cross join setting
    cross join service
    where sh.active = true
      and sh.day_of_week = extract(dow from p_date)::smallint
      and (p_specialist_id is null or sh.specialist_id = p_specialist_id)
  )
  select candidate.specialist_id, candidate.candidate_start, candidate.candidate_end
  from candidates candidate
  where candidate.candidate_end <= candidate.close_at
    and candidate.candidate_start >= now() + make_interval(mins => candidate.booking_lead_time_minutes)
    and not exists (
      select 1 from public.bookings booking
      where booking.specialist_id = candidate.specialist_id
        and booking.status not in ('cancelled', 'no_show')
        and booking.starts_at < candidate.candidate_end
        and booking.ends_at > candidate.candidate_start
    )
  order by candidate.candidate_start, candidate.specialist_id;
$$;

create or replace function public.get_bookable_specialists(p_service_id uuid)
returns table (id uuid, full_name text, color text)
language sql
stable
security definer
set search_path = public
as $$
  select profile.id, profile.full_name, profile.color
  from public.profiles profile
  join public.specialist_services assignment on assignment.specialist_id = profile.id
  join public.services service on service.id = assignment.service_id
  where profile.active = true and profile.role = 'specialist'
    and service.id = p_service_id and service.active = true and service.online_bookable = true
  order by profile.full_name;
$$;

create or replace function public.create_public_booking(
  p_service_id uuid,
  p_specialist_id uuid,
  p_starts_at timestamptz,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_notes text default null
)
returns table (
  booking_id uuid,
  public_code text,
  price_cents integer,
  deposit_due_cents integer,
  deposit_percent numeric,
  payment_status public.payment_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_service record;
  v_setting record;
  v_ends_at timestamptz;
  v_deposit_percent numeric;
  v_deposit_due integer;
  v_booking public.bookings;
begin
  if nullif(trim(p_full_name), '') is null or nullif(trim(p_phone), '') is null then
    raise exception 'Name and phone are required';
  end if;

  if p_starts_at <= now() then
    raise exception 'This time is no longer available';
  end if;

  select * into v_service from public.services
  where id = p_service_id and active = true and online_bookable = true;
  if not found then raise exception 'Service is not available'; end if;

  select * into v_setting from public.business_settings order by created_at asc limit 1;
  if not found then raise exception 'Business settings are missing'; end if;

  perform pg_advisory_xact_lock(hashtext(p_specialist_id::text || p_starts_at::text));
  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes + v_service.buffer_after_minutes);

  if not exists (
    select 1 from public.get_available_slots(p_service_id, (p_starts_at at time zone v_setting.timezone)::date, p_specialist_id) slot
    where slot.starts_at = p_starts_at and slot.ends_at = v_ends_at
  ) then raise exception 'This time was just booked. Please choose another.'; end if;

  if nullif(trim(coalesce(p_email, '')), '') is null then
    insert into public.customers (full_name, phone, notes)
    values (trim(p_full_name), trim(p_phone), nullif(trim(coalesce(p_notes, '')), ''))
    returning id into v_customer_id;
  else
    insert into public.customers (full_name, phone, email, notes)
    values (trim(p_full_name), trim(p_phone), lower(trim(p_email)), nullif(trim(coalesce(p_notes, '')), ''))
    on conflict (email) do update set full_name = excluded.full_name, phone = excluded.phone,
      notes = coalesce(excluded.notes, public.customers.notes), updated_at = now()
    returning id into v_customer_id;
  end if;

  v_deposit_percent := case when coalesce(v_service.deposit_enabled, v_setting.booking_deposit_enabled)
    then coalesce(v_service.deposit_percent, v_setting.booking_deposit_percent) else 0 end;
  v_deposit_due := round(v_service.price_cents * v_deposit_percent / 100.0)::integer;

  insert into public.bookings (
    customer_id, service_id, specialist_id, starts_at, ends_at, price_cents,
    deposit_percent, deposit_due_cents, payment_status, source
  ) values (
    v_customer_id, p_service_id, p_specialist_id, p_starts_at, v_ends_at, v_service.price_cents,
    v_deposit_percent, v_deposit_due,
    case when v_deposit_due > 0 then 'deposit_due'::public.payment_status else 'unpaid'::public.payment_status end,
    'web'
  ) returning * into v_booking;

  return query select v_booking.id, v_booking.public_code, v_booking.price_cents,
    v_booking.deposit_due_cents, v_booking.deposit_percent, v_booking.payment_status;
end;
$$;

grant execute on function public.get_public_booking_settings() to anon, authenticated;
grant execute on function public.get_available_slots(uuid, date, uuid) to anon, authenticated;
grant execute on function public.get_bookable_specialists(uuid) to anon, authenticated;
grant execute on function public.create_public_booking(uuid, uuid, timestamptz, text, text, text, text) to anon, authenticated;
