-- A POS day must start with an audited cash-session, even when the first
-- customer pays by card or transfer. The trigger also protects direct RPC/API
-- calls that bypass the interface.
create or replace function public.require_open_cash_session_for_sale()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.cash_sessions where status = 'open') then
    raise exception 'Abre caja antes de registrar una venta';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_require_open_cash_session on public.sales;
create trigger sales_require_open_cash_session
  before insert on public.sales
  for each row execute function public.require_open_cash_session_for_sale();
