create or replace function public.record_pos_sale(
  p_items jsonb,
  p_payment_method public.payment_method,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_payments jsonb default null
) returns table(sale_id uuid, total_cents integer)
language plpgsql security definer set search_path = public as $$
declare
  v_total integer; v_sale_id uuid; v_customer_id uuid; v_name text := nullif(trim(coalesce(p_customer_name, '')), ''); v_phone text := nullif(trim(coalesce(p_customer_phone, '')), ''); v_paid integer;
begin
  if not public.is_front_desk() then raise exception 'No tienes permisos para registrar ventas'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un artículo a la venta'; end if;
  select coalesce(sum(item.quantity * coalesce(service.price_cents, product.price_cents)), 0) into v_total from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer) left join public.services service on service.id = item.service_id and service.active left join public.pos_products product on product.id = item.product_id and product.active where item.quantity > 0 and ((item.service_id is not null and service.id is not null) or (item.product_id is not null and product.id is not null));
  if v_total <= 0 then raise exception 'Los artículos seleccionados no están disponibles'; end if;
  if p_payments is null then p_payments := jsonb_build_array(jsonb_build_object('method', p_payment_method, 'amount_cents', v_total)); end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) not between 1 and 2 then raise exception 'Indica uno o dos métodos de pago'; end if;
  select coalesce(sum(item.amount_cents), 0) into v_paid from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer);
  if v_paid <> v_total then raise exception 'Los importes deben sumar exactamente el total'; end if;
  if exists (select 1 from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer) where item.amount_cents <= 0) then raise exception 'Cada importe debe ser mayor a cero'; end if;
  if exists (select 1 from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer) where not exists (select 1 from public.business_settings where pos_payment_methods ? item.method::text)) then raise exception 'Uno de los métodos de pago no está habilitado'; end if;
  if exists (select 1 from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer) where item.method = 'cash') and not exists (select 1 from public.cash_sessions where status = 'open') then raise exception 'Abre caja antes de registrar efectivo'; end if;
  if v_name is not null then if v_phone is not null then select id into v_customer_id from public.customers where phone = v_phone order by created_at asc limit 1; end if; if v_customer_id is null then insert into public.customers (full_name, phone) values (v_name, v_phone) returning id into v_customer_id; end if; end if;
  insert into public.sales (customer_id, status, total_cents, created_by) values (v_customer_id, 'completed', v_total, auth.uid()) returning id into v_sale_id;
  insert into public.sale_items (sale_id, service_id, product_id, description, quantity, unit_price_cents, total_cents) select v_sale_id, item.service_id, item.product_id, coalesce(service.name, product.name), item.quantity, coalesce(service.price_cents, product.price_cents), item.quantity * coalesce(service.price_cents, product.price_cents) from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer) left join public.services service on service.id = item.service_id and service.active left join public.pos_products product on product.id = item.product_id and product.active where item.quantity > 0 and ((item.service_id is not null and service.id is not null) or (item.product_id is not null and product.id is not null));
  update public.pos_products product set stock_quantity = product.stock_quantity - item.quantity, updated_at = now() from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer) where product.id = item.product_id and product.stock_quantity is not null;
  insert into public.payments (sale_id, amount_cents, method, status, paid_at) select v_sale_id, item.amount_cents, item.method, 'completed', now() from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer);
  return query select v_sale_id, v_total;
end;
$$;
grant execute on function public.record_pos_sale(jsonb, public.payment_method, text, text, jsonb) to authenticated;
