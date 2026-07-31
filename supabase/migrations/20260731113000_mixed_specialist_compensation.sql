-- A specialist may receive a guaranteed period amount plus the agreed amount
-- for every completed service.
alter type public.specialist_payment_scheme add value if not exists 'fixed_plus_commission';

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
    values (v_booking.id, v_booking.specialist_id, v_booking.service_id, v_commission)
    on conflict (booking_id) do nothing;
  end if;
  update public.bookings set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now() where id = v_booking.id;
end;
$$;
