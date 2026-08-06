create or replace function public.get_open_cash_session_summary()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_session public.cash_sessions;
  v_cash integer := 0; v_card integer := 0; v_transfer integer := 0; v_online integer := 0;
  v_cash_expenses integer := 0; v_total_expenses integer := 0; v_internal_commissions integer := 0; v_external_commissions integer := 0;
begin
  if not public.has_permission('operations.cash') then raise exception 'No tienes permisos para hacer el corte'; end if;
  select * into v_session from public.cash_sessions where status = 'open' order by opened_at desc limit 1;
  if v_session.id is null then raise exception 'No hay una caja abierta'; end if;
  select coalesce(sum(amount_cents) filter (where method = 'cash'), 0), coalesce(sum(amount_cents) filter (where method = 'card'), 0), coalesce(sum(amount_cents) filter (where method = 'transfer'), 0), coalesce(sum(amount_cents) filter (where method = 'online'), 0)
  into v_cash, v_card, v_transfer, v_online from public.payments where status = 'completed' and created_at >= v_session.opened_at;
  select coalesce(sum(amount_cents) filter (where payment_method = 'cash'), 0), coalesce(sum(amount_cents), 0)
  into v_cash_expenses, v_total_expenses from public.expenses where created_at >= v_session.opened_at;
  select coalesce(sum(amount_cents), 0) into v_internal_commissions from public.specialist_earnings where earned_at >= v_session.opened_at;
  select coalesce(sum(amount_cents), 0) into v_external_commissions from public.expenses where created_at >= v_session.opened_at and category = 'Comisión externa';
  return jsonb_build_object(
    'opened_at', v_session.opened_at,
    'opening_float_cents', v_session.opening_float_cents,
    'cash_sales_cents', v_cash,
    'card_sales_cents', v_card,
    'transfer_sales_cents', v_transfer,
    'online_sales_cents', v_online,
    'total_sales_cents', v_cash + v_card + v_transfer + v_online,
    'cash_expenses_cents', v_cash_expenses,
    'total_expenses_cents', v_total_expenses,
    'internal_commissions_cents', v_internal_commissions,
    'external_commissions_cents', v_external_commissions,
    'expected_cash_cents', v_session.opening_float_cents + v_cash - v_cash_expenses
  );
end;
$$;
grant execute on function public.get_open_cash_session_summary() to authenticated;
