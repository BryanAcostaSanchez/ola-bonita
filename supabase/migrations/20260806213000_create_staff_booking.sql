create or replace function public.create_staff_booking(
  p_service_id uuid,
  p_specialist_id uuid,
  p_starts_at timestamptz,
  p_full_name text,
  p_phone text,
  p_notes text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_service public.services;
  v_settings public.business_settings;
  v_customer_id uuid;
  v_booking_id uuid;
  v_ends_at timestamptz;
  v_deposit_percent numeric;
begin
  if not public.has_permission('agenda.manage') then raise exception 'No tienes permisos para crear citas'; end if;
  if nullif(trim(p_full_name), '') is null or nullif(trim(p_phone), '') is null then raise exception 'Nombre y teléfono son obligatorios'; end if;
  if p_starts_at <= now() then raise exception 'El horario debe ser futuro'; end if;
  select * into v_service from public.services where id = p_service_id and active;
  if not found then raise exception 'El servicio ya no está disponible'; end if;
  if p_specialist_id is not null and not exists (select 1 from public.profiles where id = p_specialist_id and active and role = 'specialist') then raise exception 'La especialista ya no está disponible'; end if;
  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes + v_service.buffer_after_minutes);
  if p_specialist_id is not null and exists (
    select 1 from public.bookings b
    where b.specialist_id = p_specialist_id
      and b.status not in ('cancelled', 'no_show')
      and b.starts_at < v_ends_at and b.ends_at > p_starts_at
  ) then raise exception 'La especialista ya tiene una cita en ese horario'; end if;
  insert into public.customers(full_name, phone, notes)
  values (trim(p_full_name), trim(p_phone), nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_customer_id;
  select * into v_settings from public.business_settings order by created_at asc limit 1;
  v_deposit_percent := case when coalesce(v_service.deposit_enabled, v_settings.booking_deposit_enabled, false) then coalesce(v_service.deposit_percent, v_settings.booking_deposit_percent, 0) else 0 end;
  insert into public.bookings(customer_id, service_id, specialist_id, starts_at, ends_at, status, price_cents, deposit_percent, deposit_due_cents, payment_status, source, internal_notes)
  values (v_customer_id, v_service.id, p_specialist_id, p_starts_at, v_ends_at, 'confirmed', v_service.price_cents, v_deposit_percent, round(v_service.price_cents * v_deposit_percent / 100.0)::integer, 'unpaid', 'phone', nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_booking_id;
  return v_booking_id;
end;
$$;
grant execute on function public.create_staff_booking(uuid, uuid, timestamptz, text, text, text) to authenticated;
