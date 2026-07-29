-- A POS sale should attach to a previously registered client when reception uses their phone.
create or replace function public.record_pos_sale(
  p_items jsonb,
  p_payment_method public.payment_method,
  p_customer_name text default null,
  p_customer_phone text default null
) returns table(sale_id uuid, total_cents integer)
language plpgsql security definer set search_path = public as $$
declare
  v_total integer;
  v_sale_id uuid;
  v_customer_id uuid;
  v_name text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_phone text := nullif(trim(coalesce(p_customer_phone, '')), '');
begin
  if not public.is_front_desk() then raise exception 'No tienes permisos para registrar ventas'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un servicio a la venta'; end if;
  if p_payment_method = 'cash' and not exists (select 1 from public.cash_sessions where status = 'open') then raise exception 'Abre caja antes de registrar pagos en efectivo'; end if;

  select coalesce(sum(service.price_cents * item.quantity), 0) into v_total
  from jsonb_to_recordset(p_items) as item(service_id uuid, quantity integer)
  join public.services service on service.id = item.service_id and service.active
  where item.quantity > 0;
  if v_total <= 0 then raise exception 'Los servicios seleccionados no están disponibles'; end if;

  if v_name is not null then
    if v_phone is not null then
      select id into v_customer_id from public.customers where phone = v_phone order by created_at asc limit 1;
    end if;
    if v_customer_id is null then
      insert into public.customers (full_name, phone) values (v_name, v_phone) returning id into v_customer_id;
    end if;
  end if;

  insert into public.sales (customer_id, status, total_cents, created_by)
  values (v_customer_id, 'completed', v_total, auth.uid()) returning id into v_sale_id;
  insert into public.sale_items (sale_id, service_id, description, quantity, unit_price_cents, total_cents)
  select v_sale_id, service.id, service.name, item.quantity, service.price_cents, service.price_cents * item.quantity
  from jsonb_to_recordset(p_items) as item(service_id uuid, quantity integer)
  join public.services service on service.id = item.service_id and service.active
  where item.quantity > 0;
  insert into public.payments (sale_id, amount_cents, payment_method, status, paid_at)
  values (v_sale_id, v_total, p_payment_method, 'completed', now());
  return query select v_sale_id, v_total;
end;
$$;

grant execute on function public.record_pos_sale(jsonb, public.payment_method, text, text) to authenticated;
