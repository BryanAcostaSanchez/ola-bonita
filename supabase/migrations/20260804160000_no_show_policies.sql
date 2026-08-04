-- No-show decisions are recorded as immutable appointment facts. Refunds stay
-- pending for staff review because a payment processor refund moves money.
alter table public.business_settings
  add column if not exists no_show_deposit_policy text not null default 'keep_deposit'
    check (no_show_deposit_policy in ('keep_deposit', 'reschedule_credit', 'refund_review')),
  add column if not exists no_show_reschedule_window_days integer not null default 30
    check (no_show_reschedule_window_days between 1 and 365);

alter table public.bookings
  add column if not exists no_show_at timestamptz,
  add column if not exists no_show_deposit_policy text
    check (no_show_deposit_policy in ('keep_deposit', 'reschedule_credit', 'refund_review')),
  add column if not exists cancellation_deposit_policy text
    check (cancellation_deposit_policy in ('keep_deposit', 'reschedule_credit', 'refund_review'));

create or replace function public.mark_booking_no_show(
  p_booking_id uuid,
  p_reason text default null
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings;
  v_policy text;
  v_window integer;
  v_detail text;
begin
  if not public.has_permission('bookings.complete') then
    raise exception 'No tienes permisos para actualizar citas';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'La cita no existe'; end if;
  if v_booking.status in ('completed', 'cancelled', 'no_show') then
    raise exception 'Esta cita ya no puede marcarse como no presentada';
  end if;

  select no_show_deposit_policy, no_show_reschedule_window_days
    into v_policy, v_window
    from public.business_settings
    order by created_at asc
    limit 1;

  v_policy := coalesce(v_policy, 'keep_deposit');
  v_detail := case v_policy
    when 'reschedule_credit' then concat('Anticipo disponible como crédito para reprogramar dentro de ', v_window, ' días.')
    when 'refund_review' then 'Reembolso del anticipo pendiente de revisión manual.'
    else 'Anticipo retenido conforme a la política de no presentación.'
  end;

  update public.bookings
    set status = 'no_show',
        no_show_at = now(),
        no_show_deposit_policy = v_policy,
        cancelled_at = now(),
        cancellation_reason = concat('No se presentó. ', v_detail, case when nullif(trim(coalesce(p_reason, '')), '') is null then '' else concat(' Nota: ', trim(p_reason)) end),
        updated_at = now()
    where id = v_booking.id;

  return v_detail;
end;
$$;

grant execute on function public.mark_booking_no_show(uuid, text) to authenticated;

create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason text default null
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings;
  v_policy text;
  v_window integer;
  v_detail text;
begin
  if not public.has_permission('bookings.complete') then
    raise exception 'No tienes permisos para actualizar citas';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'La cita no existe'; end if;
  if v_booking.status in ('completed', 'cancelled', 'no_show') then
    raise exception 'Esta cita ya no puede cancelarse';
  end if;
  select no_show_deposit_policy, no_show_reschedule_window_days into v_policy, v_window from public.business_settings order by created_at asc limit 1;
  v_policy := coalesce(v_policy, 'keep_deposit');
  v_detail := case v_policy
    when 'reschedule_credit' then concat('Anticipo disponible como crédito para reprogramar dentro de ', v_window, ' días.')
    when 'refund_review' then 'Reembolso del anticipo pendiente de revisión manual.'
    else 'Anticipo retenido conforme a la política de cancelación.'
  end;
  update public.bookings set status='cancelled', cancelled_at=now(), cancellation_deposit_policy=v_policy,
    cancellation_reason=concat('Cita cancelada. ', v_detail, case when nullif(trim(coalesce(p_reason, '')), '') is null then '' else concat(' Motivo: ', trim(p_reason)) end), updated_at=now()
  where id=v_booking.id;
  return v_detail;
end;
$$;

grant execute on function public.cancel_booking(uuid, text) to authenticated;
