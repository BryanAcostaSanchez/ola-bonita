create or replace function public.close_cash_session(
  p_counted_cash_cents integer,
  p_notes text default null
)
returns table(session_id uuid, expected_cash_cents integer, counted_cash_cents integer, variance_cents integer)
language plpgsql security definer set search_path = public as $$
declare v_session public.cash_sessions; v_expected integer;
begin
  if not public.has_permission('operations.cash') then raise exception 'No tienes permisos para cerrar caja'; end if;
  if p_counted_cash_cents < 0 then raise exception 'El efectivo contado no puede ser negativo'; end if;
  select * into v_session from public.cash_sessions where status = 'open' order by opened_at desc limit 1 for update;
  if v_session.id is null then raise exception 'No hay una caja abierta'; end if;
  select v_session.opening_float_cents + coalesce(sum(amount_cents), 0) into v_expected
  from public.payments where method = 'cash' and status = 'completed' and created_at >= v_session.opened_at;
  select v_expected - coalesce(sum(amount_cents), 0) into v_expected
  from public.expenses where payment_method = 'cash' and created_at >= v_session.opened_at;
  update public.cash_sessions set status = 'closed', closed_at = now(), closed_by = auth.uid(), expected_cash_cents = v_expected, counted_cash_cents = p_counted_cash_cents, notes = nullif(trim(coalesce(p_notes, '')), '') where id = v_session.id;
  return query select v_session.id, v_expected, p_counted_cash_cents, p_counted_cash_cents - v_expected;
end;
$$;
grant execute on function public.close_cash_session(integer, text) to authenticated;
