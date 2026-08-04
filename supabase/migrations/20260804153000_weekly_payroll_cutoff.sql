-- Internal commissions are paid in the Sunday payroll cut. External providers
-- remain immediate expenses linked to the service sale.
create or replace function public.defer_sale_specialist_earning()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sale_id is not null then new.paid_at := null; new.paid_by := null; end if;
  return new;
end;
$$;

drop trigger if exists specialist_earnings_defer_sale_payment on public.specialist_earnings;
create trigger specialist_earnings_defer_sale_payment before insert on public.specialist_earnings for each row execute function public.defer_sale_specialist_earning();

create or replace function public.pay_current_week_specialist_earnings(p_specialist_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'America/Mexico_City')::date; v_count integer;
begin
  if not public.has_permission('team.manage') then raise exception 'No tienes permisos para registrar pagos de nómina'; end if;
  if extract(dow from v_today) <> 0 then raise exception 'El corte de nómina se realiza los domingos. Las comisiones seguirán acumulándose hasta entonces.'; end if;
  update public.specialist_earnings set paid_at = now(), paid_by = auth.uid()
  where specialist_id = p_specialist_id and paid_at is null and (earned_at at time zone 'America/Mexico_City')::date between v_today - 6 and v_today;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.pay_current_week_specialist_earnings(uuid) to authenticated;
