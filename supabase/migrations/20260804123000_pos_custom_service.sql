-- A POS ticket can include an ad-hoc service without turning it into part of
-- the public catalogue. Notes live on the sale and a declared commission is
-- recorded as a paid specialist earning for auditability.
alter table public.sales add column if not exists notes text;

create or replace function public.record_pos_sale(
  p_items jsonb,
  p_payment_method public.payment_method,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_payments jsonb default null,
  p_client_request_id uuid default null
) returns table(sale_id uuid, total_cents integer)
language plpgsql security definer set search_path = public as $$
declare
  v_total integer; v_sale_id uuid; v_customer_id uuid;
  v_name text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_phone text := nullif(trim(coalesce(p_customer_phone, '')), '');
  v_paid integer; v_notes text;
begin
  if not public.has_permission('operations.pos') then raise exception 'No tienes permisos para registrar ventas'; end if;
  if p_client_request_id is not null then
    select sale.id, sale.total_cents into v_sale_id, v_total from public.sales sale where sale.created_by = auth.uid() and sale.client_request_id = p_client_request_id;
    if v_sale_id is not null then return query select v_sale_id, v_total; return; end if;
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un artículo a la venta'; end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer, description text, unit_price_cents integer) where coalesce(quantity, 0) <= 0 or (service_id is null and product_id is null and (nullif(trim(coalesce(description,'')), '') is null or coalesce(unit_price_cents, 0) <= 0))) then raise exception 'Revisa el servicio personalizado'; end if;
  select coalesce(sum(item.quantity * coalesce(service.price_cents, product.price_cents, item.unit_price_cents)), 0) into v_total
  from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer, description text, unit_price_cents integer)
  left join public.services service on service.id = item.service_id and service.active
  left join public.pos_products product on product.id = item.product_id and product.active
  where item.quantity > 0 and ((item.service_id is not null and service.id is not null) or (item.product_id is not null and product.id is not null) or (item.service_id is null and item.product_id is null and item.unit_price_cents > 0));
  if v_total <= 0 then raise exception 'Los artículos seleccionados no están disponibles'; end if;
  if p_payments is null then p_payments := jsonb_build_array(jsonb_build_object('method', p_payment_method, 'amount_cents', v_total)); end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) not between 1 and 2 then raise exception 'Indica uno o dos métodos de pago'; end if;
  select coalesce(sum(item.amount_cents), 0) into v_paid from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer);
  if v_paid <> v_total or exists (select 1 from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer) where item.amount_cents <= 0) then raise exception 'Los importes de pago no son válidos'; end if;
  if exists (select 1 from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer) where not exists (select 1 from public.business_settings where pos_payment_methods ? item.method::text)) then raise exception 'Uno de los métodos de pago no está habilitado'; end if;
  if exists (select 1 from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer) where item.method = 'cash') and not exists (select 1 from public.cash_sessions where status = 'open') then raise exception 'Abre caja antes de registrar efectivo'; end if;
  if v_name is not null then
    if v_phone is not null then select id into v_customer_id from public.customers where phone = v_phone order by created_at asc limit 1; end if;
    if v_customer_id is null then insert into public.customers(full_name, phone) values(v_name, v_phone) returning id into v_customer_id; end if;
  end if;
  v_notes := nullif(trim(coalesce(p_items->0->>'sale_note', '')), '');
  insert into public.sales(customer_id, subtotal_cents, discount_cents, status, total_cents, created_by, client_request_id, notes)
  values(v_customer_id, v_total, 0, 'completed', v_total, auth.uid(), p_client_request_id, v_notes) returning id into v_sale_id;
  insert into public.sale_items(sale_id, service_id, product_id, description, quantity, unit_price_cents, total_cents)
  select v_sale_id, item.service_id, item.product_id, coalesce(service.name, product.name, trim(item.description)), item.quantity, coalesce(service.price_cents, product.price_cents, item.unit_price_cents), item.quantity * coalesce(service.price_cents, product.price_cents, item.unit_price_cents)
  from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer, description text, unit_price_cents integer)
  left join public.services service on service.id=item.service_id and service.active left join public.pos_products product on product.id=item.product_id and product.active
  where item.quantity > 0 and ((item.service_id is not null and service.id is not null) or (item.product_id is not null and product.id is not null) or (item.service_id is null and item.product_id is null and item.unit_price_cents > 0));
  update public.pos_products product set stock_quantity=product.stock_quantity-item.quantity, updated_at=now() from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer) where product.id=item.product_id and product.stock_quantity is not null;
  insert into public.specialist_earnings(sale_id, specialist_id, service_id, amount_cents, paid_at, paid_by)
  select v_sale_id, item.specialist_id, null, item.commission_cents, now(), auth.uid()
  from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, specialist_id uuid, commission_cents integer)
  join public.profiles specialist on specialist.id=item.specialist_id and specialist.active and specialist.role='specialist'
  where item.service_id is null and item.product_id is null and coalesce(item.commission_cents, 0) > 0;
  if exists (select 1 from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, specialist_id uuid, commission_cents integer) where item.service_id is null and item.product_id is null and coalesce(item.commission_cents,0) > 0 and item.specialist_id is null) then raise exception 'Selecciona a quién se pagó la comisión'; end if;
  insert into public.payments(sale_id, amount_cents, method, status, paid_at) select v_sale_id, item.amount_cents, item.method, 'completed', now() from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer);
  return query select v_sale_id, v_total;
end;
$$;
