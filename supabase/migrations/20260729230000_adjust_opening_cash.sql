create or replace function public.adjust_opening_cash(p_opening_float_cents integer)
returns public.cash_sessions language plpgsql security definer set search_path = public as $$
declare v_session public.cash_sessions;
begin
  if not public.is_front_desk() then raise exception 'No tienes permisos para ajustar la caja'; end if;
  if p_opening_float_cents < 0 then raise exception 'El fondo inicial no puede ser negativo'; end if;
  select * into v_session from public.cash_sessions where status = 'open' order by opened_at desc limit 1 for update;
  if v_session.id is null then raise exception 'No hay una caja abierta'; end if;
  if exists (select 1 from public.payments where method = 'cash' and status = 'completed' and created_at >= v_session.opened_at) or exists (select 1 from public.expenses where payment_method = 'cash' and created_at >= v_session.opened_at) then raise exception 'No se puede cambiar el fondo después de registrar movimientos en efectivo'; end if;
  update public.cash_sessions set opening_float_cents = p_opening_float_cents, expected_cash_cents = p_opening_float_cents where id = v_session.id returning * into v_session;
  return v_session;
end;
$$;
grant execute on function public.adjust_opening_cash(integer) to authenticated;
