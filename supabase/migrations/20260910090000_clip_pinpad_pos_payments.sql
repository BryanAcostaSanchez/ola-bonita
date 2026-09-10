-- Card-present payments are deliberately two-phase: a POS sale is only
-- completed after Clip confirms the PinPad transaction server-to-server.
create table if not exists public.clip_pinpad_attempts (
  id uuid primary key default gen_random_uuid(),
  initiated_by uuid not null references public.profiles(id) on delete restrict,
  customer_name text,
  customer_phone text,
  items jsonb not null,
  total_cents integer not null check (total_cents > 0),
  reader_serial text not null,
  pinpad_request_id text unique,
  sale_id uuid references public.sales(id) on delete set null,
  status text not null default 'creating' check (status in ('creating', 'pending', 'completed', 'failed', 'requires_review')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index if not exists clip_pinpad_attempts_pending_idx
  on public.clip_pinpad_attempts (created_at)
  where status = 'pending';

create unique index if not exists payments_clip_pinpad_reference_key
  on public.payments (sale_id, provider, provider_reference)
  where provider = 'clip_pinpad';

alter table public.clip_pinpad_attempts enable row level security;
grant all privileges on public.clip_pinpad_attempts to service_role;

create or replace function public.create_clip_pinpad_attempt(
  p_items jsonb,
  p_customer_name text default null,
  p_customer_phone text default null
)
returns table(id uuid, total_cents integer, reader_serial text)
language plpgsql security definer set search_path = public as $$
declare
  v_total integer;
  v_serial text;
  v_status text;
  v_items jsonb;
  v_attempt_id uuid;
begin
  if not public.has_permission('operations.pos') then raise exception 'No tienes permisos para registrar ventas'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un artículo a la venta'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer, description text, unit_price_cents integer, commission_percent numeric, specialist_id uuid, external_provider_name text, external_payment_method public.payment_method)
    where coalesce(item.quantity, 0) <= 0
      or (item.service_id is null and item.product_id is null and (nullif(trim(coalesce(item.description, '')), '') is null or coalesce(item.unit_price_cents, 0) <= 0))
      or (item.commission_percent is not null and (item.commission_percent < 0 or item.commission_percent > 100))
      or (nullif(trim(coalesce(item.external_provider_name, '')), '') is not null and item.specialist_id is not null)
  ) then raise exception 'Revisa los artículos y las comisiones del ticket'; end if;

  select clip_pinpad_reader_serial, clip_pinpad_setup_status
    into v_serial, v_status
    from public.business_settings order by created_at asc limit 1;
  if nullif(trim(coalesce(v_serial, '')), '') is null or v_status <> 'ready_to_test' then
    raise exception 'Configura una terminal Clip PinPad preparada antes de cobrar';
  end if;

  select coalesce(sum(item.quantity * coalesce(service.price_cents, product.price_cents, item.unit_price_cents)), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'service_id', item.service_id,
           'product_id', item.product_id,
           'description', coalesce(service.name, product.name, trim(item.description)),
           'quantity', item.quantity,
           'unit_price_cents', coalesce(service.price_cents, product.price_cents, item.unit_price_cents),
           'specialist_id', item.specialist_id,
           'commission_percent', item.commission_percent,
           'external_provider_name', nullif(trim(coalesce(item.external_provider_name, '')), ''),
           'external_payment_method', item.external_payment_method,
           'sale_note', nullif(trim(coalesce(item.sale_note, '')), '')
         )), '[]'::jsonb)
    into v_total, v_items
    from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer, description text, unit_price_cents integer, commission_percent numeric, specialist_id uuid, external_provider_name text, external_payment_method public.payment_method, sale_note text)
    left join public.services service on service.id = item.service_id and service.active
    left join public.pos_products product on product.id = item.product_id and product.active
    where item.quantity > 0
      and ((item.service_id is not null and service.id is not null)
        or (item.product_id is not null and product.id is not null)
        or (item.service_id is null and item.product_id is null and item.unit_price_cents > 0));
  if v_total <= 0 or jsonb_array_length(v_items) <> jsonb_array_length(p_items) then raise exception 'Los artículos seleccionados no están disponibles'; end if;

  insert into public.clip_pinpad_attempts (initiated_by, customer_name, customer_phone, items, total_cents, reader_serial)
  values (auth.uid(), nullif(trim(coalesce(p_customer_name, '')), ''), nullif(trim(coalesce(p_customer_phone, '')), ''), v_items, v_total, trim(v_serial))
  returning clip_pinpad_attempts.id into v_attempt_id;
  return query select v_attempt_id, v_total, trim(v_serial);
end;
$$;

create or replace function public.attach_clip_pinpad_request(p_attempt_id uuid, p_pinpad_request_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('operations.pos') then raise exception 'No tienes permisos para registrar ventas'; end if;
  if nullif(trim(coalesce(p_pinpad_request_id, '')), '') is null then raise exception 'Clip no devolvió un identificador de cobro'; end if;
  update public.clip_pinpad_attempts
    set pinpad_request_id = trim(p_pinpad_request_id), status = 'pending'
    where id = p_attempt_id and initiated_by = auth.uid() and status = 'creating';
  if not found then raise exception 'El cobro en terminal ya no está disponible'; end if;
end;
$$;

create or replace function public.fail_clip_pinpad_attempt(p_attempt_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('operations.pos') then raise exception 'No tienes permisos para registrar ventas'; end if;
  update public.clip_pinpad_attempts set status = 'failed', finalized_at = now()
    where id = p_attempt_id and initiated_by = auth.uid() and status = 'creating';
end;
$$;

create or replace function public.finalize_clip_pinpad_attempt(
  p_pinpad_request_id text,
  p_provider_reference text default null
)
returns table(sale_id uuid, total_cents integer)
language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.clip_pinpad_attempts;
  v_customer_id uuid;
  v_sale_id uuid;
  v_default_percent numeric;
  v_notes text;
begin
  if auth.role() <> 'service_role' then raise exception 'Not authorized'; end if;
  select * into v_attempt from public.clip_pinpad_attempts
    where pinpad_request_id = p_pinpad_request_id for update;
  if v_attempt.id is null then raise exception 'PinPad attempt not found'; end if;
  if v_attempt.status = 'completed' then return query select v_attempt.sale_id, v_attempt.total_cents; return; end if;
  if v_attempt.status <> 'pending' then raise exception 'PinPad attempt is not pending'; end if;

  if v_attempt.customer_name is not null then
    if v_attempt.customer_phone is not null then
      select id into v_customer_id from public.customers where phone = v_attempt.customer_phone order by created_at asc limit 1;
    end if;
    if v_customer_id is null then
      insert into public.customers (full_name, phone) values (v_attempt.customer_name, v_attempt.customer_phone) returning id into v_customer_id;
    end if;
  end if;
  select default_commission_percent into v_default_percent from public.business_settings order by created_at asc limit 1;
  v_notes := nullif(trim(coalesce(v_attempt.items->0->>'sale_note', '')), '');
  insert into public.sales (customer_id, subtotal_cents, discount_cents, status, total_cents, created_by, notes)
  values (v_customer_id, v_attempt.total_cents, 0, 'completed', v_attempt.total_cents, v_attempt.initiated_by, v_notes)
  returning id into v_sale_id;
  insert into public.sale_items (sale_id, service_id, product_id, description, quantity, unit_price_cents, total_cents)
  select v_sale_id, item.service_id, item.product_id, item.description, item.quantity, item.unit_price_cents, item.quantity * item.unit_price_cents
  from jsonb_to_recordset(v_attempt.items) as item(service_id uuid, product_id uuid, description text, quantity integer, unit_price_cents integer);
  update public.pos_products product set stock_quantity = product.stock_quantity - item.quantity, updated_at = now()
    from jsonb_to_recordset(v_attempt.items) as item(product_id uuid, quantity integer)
    where product.id = item.product_id and product.stock_quantity is not null;
  insert into public.specialist_earnings (sale_id, specialist_id, service_id, amount_cents, paid_at, paid_by)
  select v_sale_id, item.specialist_id, null, round(item.unit_price_cents * coalesce(item.commission_percent, v_default_percent, 0) / 100.0)::integer, now(), v_attempt.initiated_by
  from jsonb_to_recordset(v_attempt.items) as item(service_id uuid, product_id uuid, specialist_id uuid, unit_price_cents integer, commission_percent numeric)
  join public.profiles specialist on specialist.id = item.specialist_id and specialist.active and specialist.role = 'specialist'
  where item.service_id is null and item.product_id is null and item.specialist_id is not null;
  insert into public.expenses (category, description, amount_cents, expense_date, payment_method, created_by, sale_id, external_provider_name)
  select 'Comisión externa', concat('Comisión de ', item.external_provider_name, ' por ', item.description), round(item.unit_price_cents * coalesce(item.commission_percent, v_default_percent, 0) / 100.0)::integer, current_date, item.external_payment_method, v_attempt.initiated_by, v_sale_id, item.external_provider_name
  from jsonb_to_recordset(v_attempt.items) as item(description text, unit_price_cents integer, commission_percent numeric, external_provider_name text, external_payment_method public.payment_method)
  where item.external_provider_name is not null and round(item.unit_price_cents * coalesce(item.commission_percent, v_default_percent, 0) / 100.0)::integer > 0;
  insert into public.payments (sale_id, amount_cents, method, provider, provider_reference, status, paid_at)
  values (v_sale_id, v_attempt.total_cents, 'card', 'clip_pinpad', coalesce(nullif(trim(coalesce(p_provider_reference, '')), ''), p_pinpad_request_id), 'completed', now());
  update public.clip_pinpad_attempts set sale_id = v_sale_id, status = 'completed', finalized_at = now() where id = v_attempt.id;
  return query select v_sale_id, v_attempt.total_cents;
end;
$$;

create or replace function public.fail_clip_pinpad_payment(p_pinpad_request_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Not authorized'; end if;
  update public.clip_pinpad_attempts set status = 'failed', finalized_at = now()
    where pinpad_request_id = p_pinpad_request_id and status = 'pending';
end;
$$;

grant execute on function public.create_clip_pinpad_attempt(jsonb, text, text) to authenticated;
grant execute on function public.attach_clip_pinpad_request(uuid, text) to authenticated;
grant execute on function public.fail_clip_pinpad_attempt(uuid) to authenticated;
grant execute on function public.finalize_clip_pinpad_attempt(text, text) to service_role;
grant execute on function public.fail_clip_pinpad_payment(text) to service_role;
