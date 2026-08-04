-- Commission policy: one global percentage, with an optional percentage per
-- specialist. Amounts already recorded remain immutable snapshots.
alter table public.business_settings
  add column if not exists default_commission_percent numeric(5,2) not null default 0
  check (default_commission_percent between 0 and 100);

alter table public.specialist_compensation
  add column if not exists commission_percent numeric(5,2)
  check (commission_percent is null or commission_percent between 0 and 100);

create or replace function public.save_default_commission_percent(p_percent numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('team.manage') then raise exception 'No tienes permisos para gestionar las comisiones'; end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then raise exception 'El porcentaje debe estar entre 0 y 100'; end if;
  update public.business_settings set default_commission_percent = p_percent, updated_at = now();
end;
$$;

create or replace function public.save_specialist_compensation(
  p_specialist_id uuid,
  p_scheme public.specialist_payment_scheme,
  p_frequency public.specialist_payment_frequency,
  p_fixed_amount_cents integer,
  p_commissions jsonb,
  p_commission_percent numeric default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('team.manage') then raise exception 'No tienes permisos para modificar pagos del equipo'; end if;
  if not exists (select 1 from public.profiles where id = p_specialist_id and role = 'specialist' and active) then raise exception 'La especialista no está activa'; end if;
  if p_fixed_amount_cents < 0 then raise exception 'El importe fijo no puede ser negativo'; end if;
  if p_commission_percent is not null and (p_commission_percent < 0 or p_commission_percent > 100) then raise exception 'El porcentaje debe estar entre 0 y 100'; end if;
  insert into public.specialist_compensation(specialist_id, scheme, frequency, fixed_amount_cents, commission_percent, updated_at)
  values (p_specialist_id, p_scheme, p_frequency, p_fixed_amount_cents, p_commission_percent, now())
  on conflict (specialist_id) do update set scheme = excluded.scheme, frequency = excluded.frequency, fixed_amount_cents = excluded.fixed_amount_cents, commission_percent = excluded.commission_percent, updated_at = now();
end;
$$;

create or replace function public.complete_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_booking public.bookings; v_scheme public.specialist_payment_scheme; v_percent numeric; v_commission integer;
begin
  if not public.has_permission('bookings.complete') then raise exception 'No tienes permisos para finalizar citas'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'La cita no existe'; end if;
  if v_booking.specialist_id is null then raise exception 'Asigna una especialista antes de finalizar la cita'; end if;
  if v_booking.status in ('cancelled', 'no_show') then raise exception 'No puedes finalizar una cita cancelada'; end if;
  select scheme, commission_percent into v_scheme, v_percent from public.specialist_compensation where specialist_id = v_booking.specialist_id;
  if coalesce(v_scheme, 'per_service'::public.specialist_payment_scheme) in ('per_service', 'fixed_plus_commission') then
    select coalesce(v_percent, default_commission_percent) into v_percent from public.business_settings order by created_at asc limit 1;
    v_commission := coalesce(v_booking.commission_override_cents, round(v_booking.price_cents * coalesce(v_percent, 0) / 100.0)::integer);
    insert into public.specialist_earnings(booking_id, specialist_id, service_id, amount_cents)
    values (v_booking.id, v_booking.specialist_id, v_booking.service_id, v_commission)
    on conflict (booking_id) do nothing;
  end if;
  update public.bookings set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now() where id = v_booking.id;
end;
$$;

-- Custom services resolve the chosen member's override or the global default.
-- External providers receive the global percentage unless the cashier changes it.
create or replace function public.record_pos_sale(
  p_items jsonb, p_payment_method public.payment_method, p_customer_name text default null, p_customer_phone text default null, p_payments jsonb default null, p_client_request_id uuid default null
) returns table(sale_id uuid, total_cents integer)
language plpgsql security definer set search_path = public as $$
declare v_total integer; v_sale_id uuid; v_customer_id uuid; v_name text := nullif(trim(coalesce(p_customer_name, '')), ''); v_phone text := nullif(trim(coalesce(p_customer_phone, '')), ''); v_paid integer; v_notes text; v_default_percent numeric;
begin
  if not public.has_permission('operations.pos') then raise exception 'No tienes permisos para registrar ventas'; end if;
  if p_client_request_id is not null then select sale.id, sale.total_cents into v_sale_id, v_total from public.sales sale where sale.created_by = auth.uid() and sale.client_request_id = p_client_request_id; if v_sale_id is not null then return query select v_sale_id, v_total; return; end if; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un artículo a la venta'; end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer, description text, unit_price_cents integer, commission_percent numeric) where coalesce(quantity, 0) <= 0 or (item.service_id is null and item.product_id is null and (nullif(trim(coalesce(description,'')), '') is null or coalesce(item.unit_price_cents, 0) <= 0)) or (item.commission_percent is not null and (item.commission_percent < 0 or item.commission_percent > 100))) then raise exception 'Revisa el servicio y porcentaje de comisión'; end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as item(external_provider_name text, specialist_id uuid) where nullif(trim(coalesce(item.external_provider_name, '')), '') is not null and item.specialist_id is not null) then raise exception 'Una comisión sólo puede pertenecer al equipo o a un prestador externo'; end if;
  select default_commission_percent into v_default_percent from public.business_settings order by created_at asc limit 1;
  select coalesce(sum(item.quantity * coalesce(service.price_cents, product.price_cents, item.unit_price_cents)), 0) into v_total from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer, unit_price_cents integer) left join public.services service on service.id = item.service_id and service.active left join public.pos_products product on product.id = item.product_id and product.active where item.quantity > 0 and ((item.service_id is not null and service.id is not null) or (item.product_id is not null and product.id is not null) or (item.service_id is null and item.product_id is null and item.unit_price_cents > 0));
  if v_total <= 0 then raise exception 'Los artículos seleccionados no están disponibles'; end if;
  if p_payments is null then p_payments := jsonb_build_array(jsonb_build_object('method', p_payment_method, 'amount_cents', v_total)); end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) not between 1 and 2 then raise exception 'Indica uno o dos métodos de pago'; end if;
  select coalesce(sum(item.amount_cents), 0) into v_paid from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer);
  if v_paid <> v_total or exists (select 1 from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer) where item.amount_cents <= 0) then raise exception 'Los importes de pago no son válidos'; end if;
  if exists (select 1 from jsonb_to_recordset(p_payments) as item(method public.payment_method) where not exists (select 1 from public.business_settings where pos_payment_methods ? item.method::text)) then raise exception 'Uno de los métodos de pago no está habilitado'; end if;
  if (exists (select 1 from jsonb_to_recordset(p_payments) as item(method public.payment_method) where item.method = 'cash') or exists (select 1 from jsonb_to_recordset(p_items) as item(external_provider_name text, external_payment_method public.payment_method) where nullif(trim(coalesce(item.external_provider_name, '')), '') is not null and item.external_payment_method = 'cash')) and not exists (select 1 from public.cash_sessions where status = 'open') then raise exception 'Abre caja antes de registrar efectivo'; end if;
  if v_name is not null then if v_phone is not null then select id into v_customer_id from public.customers where phone = v_phone order by created_at asc limit 1; end if; if v_customer_id is null then insert into public.customers(full_name, phone) values(v_name, v_phone) returning id into v_customer_id; end if; end if;
  v_notes := nullif(trim(coalesce(p_items->0->>'sale_note', '')), '');
  insert into public.sales(customer_id, subtotal_cents, discount_cents, status, total_cents, created_by, client_request_id, notes) values(v_customer_id, v_total, 0, 'completed', v_total, auth.uid(), p_client_request_id, v_notes) returning id into v_sale_id;
  insert into public.sale_items(sale_id, service_id, product_id, description, quantity, unit_price_cents, total_cents) select v_sale_id, item.service_id, item.product_id, coalesce(service.name, product.name, trim(item.description)), item.quantity, coalesce(service.price_cents, product.price_cents, item.unit_price_cents), item.quantity * coalesce(service.price_cents, product.price_cents, item.unit_price_cents) from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer, description text, unit_price_cents integer) left join public.services service on service.id=item.service_id and service.active left join public.pos_products product on product.id=item.product_id and product.active where item.quantity > 0 and ((item.service_id is not null and service.id is not null) or (item.product_id is not null and product.id is not null) or (item.service_id is null and item.product_id is null and item.unit_price_cents > 0));
  update public.pos_products product set stock_quantity=product.stock_quantity-item.quantity, updated_at=now() from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer) where product.id=item.product_id and product.stock_quantity is not null;
  insert into public.specialist_earnings(sale_id, specialist_id, service_id, amount_cents, paid_at, paid_by) select v_sale_id, item.specialist_id, null, round(item.unit_price_cents * coalesce(compensation.commission_percent, v_default_percent, 0) / 100.0)::integer, now(), auth.uid() from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, specialist_id uuid, unit_price_cents integer) join public.profiles specialist on specialist.id=item.specialist_id and specialist.active and specialist.role='specialist' left join public.specialist_compensation compensation on compensation.specialist_id=item.specialist_id where item.service_id is null and item.product_id is null and item.specialist_id is not null;
  if exists (select 1 from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, specialist_id uuid, external_provider_name text) where item.service_id is null and item.product_id is null and item.specialist_id is null and nullif(trim(coalesce(item.external_provider_name, '')), '') is null) then raise exception 'Selecciona al equipo o indica el prestador externo'; end if;
  insert into public.expenses(category, description, amount_cents, expense_date, payment_method, created_by, sale_id, external_provider_name) select 'Comisión externa', concat('Comisión de ', trim(item.external_provider_name), ' por ', trim(item.description)), round(item.unit_price_cents * coalesce(item.commission_percent, v_default_percent, 0) / 100.0)::integer, current_date, item.external_payment_method, auth.uid(), v_sale_id, trim(item.external_provider_name) from jsonb_to_recordset(p_items) as item(description text, unit_price_cents integer, commission_percent numeric, external_provider_name text, external_payment_method public.payment_method) where nullif(trim(coalesce(item.external_provider_name, '')), '') is not null and round(item.unit_price_cents * coalesce(item.commission_percent, v_default_percent, 0) / 100.0)::integer > 0;
  insert into public.payments(sale_id, amount_cents, method, status, paid_at) select v_sale_id, item.amount_cents, item.method, 'completed', now() from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer);
  return query select v_sale_id, v_total;
end;
$$;

grant execute on function public.save_default_commission_percent(numeric) to authenticated;
grant execute on function public.save_specialist_compensation(uuid, public.specialist_payment_scheme, public.specialist_payment_frequency, integer, jsonb, numeric) to authenticated;
