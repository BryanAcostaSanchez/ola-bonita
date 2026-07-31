-- Configurable POS tender types and retail products, kept separate from bookable services.
alter table public.business_settings
  add column if not exists pos_payment_methods jsonb not null default '["cash", "card", "transfer"]'::jsonb;

create table if not exists public.pos_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  price_cents integer not null check (price_cents >= 0),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sku)
);

alter table public.sale_items add column if not exists product_id uuid references public.pos_products on delete set null;
alter table public.pos_products enable row level security;
create policy "staff can read pos products" on public.pos_products for select to authenticated using (public.is_staff());
create policy "front desk manages pos products" on public.pos_products for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
grant all privileges on public.pos_products to service_role;

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
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un artículo a la venta'; end if;
  if not exists (select 1 from public.business_settings where pos_payment_methods ? p_payment_method::text) then raise exception 'Este método de pago no está habilitado'; end if;
  if p_payment_method = 'cash' and not exists (select 1 from public.cash_sessions where status = 'open') then raise exception 'Abre caja antes de registrar pagos en efectivo'; end if;

  select coalesce(sum(item.quantity * coalesce(service.price_cents, product.price_cents)), 0) into v_total
  from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer)
  left join public.services service on service.id = item.service_id and service.active
  left join public.pos_products product on product.id = item.product_id and product.active
  where item.quantity > 0 and ((item.service_id is not null and service.id is not null) or (item.product_id is not null and product.id is not null));
  if v_total <= 0 then raise exception 'Los artículos seleccionados no están disponibles'; end if;

  if v_name is not null then
    if v_phone is not null then select id into v_customer_id from public.customers where phone = v_phone order by created_at asc limit 1; end if;
    if v_customer_id is null then insert into public.customers (full_name, phone) values (v_name, v_phone) returning id into v_customer_id; end if;
  end if;

  insert into public.sales (customer_id, status, total_cents, created_by) values (v_customer_id, 'completed', v_total, auth.uid()) returning id into v_sale_id;
  insert into public.sale_items (sale_id, service_id, product_id, description, quantity, unit_price_cents, total_cents)
  select v_sale_id, item.service_id, item.product_id, coalesce(service.name, product.name), item.quantity, coalesce(service.price_cents, product.price_cents), item.quantity * coalesce(service.price_cents, product.price_cents)
  from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer)
  left join public.services service on service.id = item.service_id and service.active
  left join public.pos_products product on product.id = item.product_id and product.active
  where item.quantity > 0 and ((item.service_id is not null and service.id is not null) or (item.product_id is not null and product.id is not null));
  update public.pos_products product set stock_quantity = product.stock_quantity - item.quantity, updated_at = now()
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
  where product.id = item.product_id and product.stock_quantity is not null;
  insert into public.payments (sale_id, amount_cents, method, status, paid_at) values (v_sale_id, v_total, p_payment_method, 'completed', now());
  return query select v_sale_id, v_total;
end;
$$;

grant execute on function public.record_pos_sale(jsonb, public.payment_method, text, text) to authenticated;
