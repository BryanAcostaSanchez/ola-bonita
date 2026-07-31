-- An exceptional service can receive a different commission without changing
-- the specialist's standard rate for every future booking.
alter table public.bookings
  add column if not exists commission_override_cents integer check (commission_override_cents >= 0),
  add column if not exists commission_override_reason text,
  add column if not exists commission_override_at timestamptz,
  add column if not exists commission_override_by uuid references public.profiles(id) on delete set null;

create or replace function public.set_booking_commission_override(
  p_booking_id uuid,
  p_commission_cents integer default null,
  p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_booking public.bookings;
begin
  if not public.is_owner() then raise exception 'Sólo administración puede ajustar una comisión'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'La cita no existe'; end if;
  if v_booking.status in ('completed', 'cancelled', 'no_show') then raise exception 'La comisión ya no puede modificarse en esta cita'; end if;
  if v_booking.specialist_id is null then raise exception 'Asigna una especialista antes de ajustar su comisión'; end if;
  if p_commission_cents is not null and p_commission_cents < 0 then raise exception 'La comisión no puede ser negativa'; end if;
  if p_commission_cents is not null and nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Escribe el motivo del ajuste'; end if;

  update public.bookings set
    commission_override_cents = p_commission_cents,
    commission_override_reason = case when p_commission_cents is null then null else trim(p_reason) end,
    commission_override_at = case when p_commission_cents is null then null else now() end,
    commission_override_by = case when p_commission_cents is null then null else auth.uid() end,
    updated_at = now()
  where id = v_booking.id;
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
  if coalesce(v_scheme, 'per_service'::public.specialist_payment_scheme) in ('per_service', 'fixed_plus_commission') then
    select commission_cents into v_commission from public.specialist_services where specialist_id = v_booking.specialist_id and service_id = v_booking.service_id;
    if v_commission is null then raise exception 'Configura la comisión de este servicio antes de finalizar la cita'; end if;
    insert into public.specialist_earnings(booking_id, specialist_id, service_id, amount_cents)
    values (v_booking.id, v_booking.specialist_id, v_booking.service_id, coalesce(v_booking.commission_override_cents, v_commission))
    on conflict (booking_id) do nothing;
  end if;
  update public.bookings set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now() where id = v_booking.id;
end;
$$;

grant execute on function public.set_booking_commission_override(uuid, integer, text) to authenticated;
