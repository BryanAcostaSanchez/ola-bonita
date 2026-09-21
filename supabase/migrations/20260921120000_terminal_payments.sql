-- Card-present charges are provider-agnostic: the POS sends an amount to a
-- physical terminal and the sale is only written once the provider confirms
-- it. Clip is the first provider; the shape leaves room for another beside it.
-- Everything a cashier can reach goes through SECURITY DEFINER functions, and
-- only the service role may finalize a sale from a provider confirmation.

-- Columns the POS has been writing for a while that no migration ever created,
-- so a database rebuilt from this folder alone cannot record a sale. They are
-- no-ops where they already exist.
alter table public.sales add column if not exists client_request_id uuid;
create unique index if not exists sales_client_request_key
  on public.sales (created_by, client_request_id)
  where client_request_id is not null;

-- A commission can be earned on a walk-in sale, which has no booking and no
-- catalogue service behind it.
alter table public.specialist_earnings
  add column if not exists sale_id uuid references public.sales(id) on delete cascade;
alter table public.specialist_earnings alter column booking_id drop not null;
alter table public.specialist_earnings alter column service_id drop not null;
create index if not exists specialist_earnings_sale_idx on public.specialist_earnings (sale_id) where sale_id is not null;

-- ---------------------------------------------------------------------------
-- Terminals
-- ---------------------------------------------------------------------------

create table if not exists public.payment_terminals (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'clip' check (provider in ('clip', 'mercadopago')),
  device_id text not null,
  label text,
  active boolean not null default true,
  setup_status text not null default 'not_started'
    check (setup_status in ('not_started', 'requested', 'app_installed', 'ready_to_test')),
  last_seen_state text check (last_seen_state in ('active', 'inactive', 'expired', 'unknown')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_terminals_provider_device_key
  on public.payment_terminals (provider, device_id);

-- Carry over the single serial the settings screen used to hold.
insert into public.payment_terminals (provider, device_id, setup_status)
select 'clip', trim(settings.clip_pinpad_reader_serial), coalesce(settings.clip_pinpad_setup_status, 'not_started')
from public.business_settings settings
where nullif(trim(coalesce(settings.clip_pinpad_reader_serial, '')), '') is not null
on conflict (provider, device_id) do nothing;

alter table public.business_settings
  drop column if exists clip_pinpad_reader_serial,
  drop column if exists clip_pinpad_setup_status;

-- What sends a charge to the terminal is a switch on the payment method, not
-- the method's name: {"card": "clip"} routes card payments to a Clip terminal.
alter table public.business_settings
  add column if not exists pos_payment_method_providers jsonb not null default '{}'::jsonb;

alter table public.payment_terminals enable row level security;
grant select, insert, update, delete on public.payment_terminals to authenticated;
grant all privileges on public.payment_terminals to service_role;

drop policy if exists "staff read payment terminals" on public.payment_terminals;
create policy "staff read payment terminals" on public.payment_terminals
  for select to authenticated
  using (public.has_permission('operations.pos') or public.has_permission('settings.payments'));

drop policy if exists "owners manage payment terminals" on public.payment_terminals;
create policy "owners manage payment terminals" on public.payment_terminals
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---------------------------------------------------------------------------
-- Payment intents
-- ---------------------------------------------------------------------------

-- Rename in place so the PinPad charges already recorded keep their history.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'clip_pinpad_attempts')
    and not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'terminal_payment_intents') then
    alter table public.clip_pinpad_attempts rename to terminal_payment_intents;
    alter table public.terminal_payment_intents rename column pinpad_request_id to provider_payment_id;
    alter table public.terminal_payment_intents rename column total_cents to amount_cents;
    alter table public.terminal_payment_intents rename column status to state;
    alter table public.terminal_payment_intents rename column initiated_by to created_by;
    alter table public.terminal_payment_intents rename column reader_serial to device_id;
  end if;
end $$;

create table if not exists public.terminal_payment_intents (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  customer_name text,
  customer_phone text,
  items jsonb not null,
  amount_cents integer not null check (amount_cents > 0),
  device_id text not null,
  provider_payment_id text unique,
  sale_id uuid references public.sales(id) on delete set null,
  state text not null default 'creating',
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

alter table public.terminal_payment_intents
  add column if not exists provider text not null default 'clip',
  add column if not exists terminal_id uuid references public.payment_terminals(id) on delete set null,
  add column if not exists external_reference text,
  add column if not exists provider_payment_status text,
  add column if not exists ticket_payments jsonb not null default '[]'::jsonb,
  add column if not exists last_state_at timestamptz not null default now(),
  add column if not exists last_error_code text,
  add column if not exists expires_at timestamptz;

-- A charge the cashier abandoned is distinct from one the card declined.
alter table public.terminal_payment_intents
  drop constraint if exists clip_pinpad_attempts_status_check;
alter table public.terminal_payment_intents
  drop constraint if exists terminal_payment_intents_state_check;
alter table public.terminal_payment_intents
  add constraint terminal_payment_intents_state_check
  check (state in ('creating', 'pending', 'completed', 'failed', 'cancelled', 'requires_review'));

update public.terminal_payment_intents
  set external_reference = id::text
  where external_reference is null;

alter table public.terminal_payment_intents
  alter column external_reference set not null;

create unique index if not exists terminal_payment_intents_reference_key
  on public.terminal_payment_intents (provider, external_reference);

drop index if exists public.clip_pinpad_attempts_pending_idx;
create index if not exists terminal_payment_intents_open_idx
  on public.terminal_payment_intents (created_at)
  where state in ('creating', 'pending');

-- Only one charge can be live on a terminal: Clip rejects a second one, and a
-- stale row would hide the charge the cashier is actually waiting on.
create unique index if not exists terminal_payment_intents_one_open_per_device
  on public.terminal_payment_intents (provider, device_id)
  where state in ('creating', 'pending');

alter table public.terminal_payment_intents enable row level security;
grant all privileges on public.terminal_payment_intents to service_role;

-- Terminal-confirmed sale payments are recorded under the provider's own name.
update public.payments set provider = 'clip' where provider = 'clip_pinpad';
drop index if exists public.payments_clip_pinpad_reference_key;
create unique index if not exists payments_sale_provider_reference_key
  on public.payments (sale_id, provider, provider_reference)
  where sale_id is not null and provider is not null and provider_reference is not null;

-- ---------------------------------------------------------------------------
-- One place that writes a POS sale
-- ---------------------------------------------------------------------------

-- The ticket is checked before a card is ever charged and again when the sale
-- is written, so the rules live here rather than in each caller.
create or replace function public.validate_pos_ticket(p_items jsonb)
returns integer language plpgsql stable security definer set search_path = public as $$
declare v_total integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un artículo a la venta'; end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer, description text, unit_price_cents integer, commission_percent numeric) where coalesce(item.quantity, 0) <= 0 or (item.service_id is null and item.product_id is null and (nullif(trim(coalesce(item.description, '')), '') is null or coalesce(item.unit_price_cents, 0) <= 0)) or (item.commission_percent is not null and (item.commission_percent < 0 or item.commission_percent > 100))) then raise exception 'Revisa el servicio y porcentaje de comisión'; end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as item(external_provider_name text, specialist_id uuid) where nullif(trim(coalesce(item.external_provider_name, '')), '') is not null and item.specialist_id is not null) then raise exception 'Una comisión sólo puede pertenecer al equipo o a un prestador externo'; end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, specialist_id uuid, external_provider_name text) where item.service_id is null and item.product_id is null and item.specialist_id is null and nullif(trim(coalesce(item.external_provider_name, '')), '') is null) then raise exception 'Selecciona al equipo o indica el prestador externo'; end if;
  select coalesce(sum(item.quantity * coalesce(service.price_cents, product.price_cents, item.unit_price_cents)), 0) into v_total
    from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer, unit_price_cents integer)
    left join public.services service on service.id = item.service_id and service.active
    left join public.pos_products product on product.id = item.product_id and product.active
    where item.quantity > 0 and ((item.service_id is not null and service.id is not null) or (item.product_id is not null and product.id is not null) or (item.service_id is null and item.product_id is null and item.unit_price_cents > 0));
  if v_total <= 0 then raise exception 'Los artículos seleccionados no están disponibles'; end if;
  return v_total;
end;
$$;

grant execute on function public.validate_pos_ticket(jsonb) to authenticated;

-- Both the manual checkout and a terminal confirmation end in the same sale,
-- so they share this. The caller owns the permission check and names the
-- actor, because a terminal charge is finalized by the service role on behalf
-- of the cashier who started it.
create or replace function public.create_pos_sale_record(
  p_items jsonb,
  p_payments jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_actor uuid,
  p_client_request_id uuid default null,
  p_validate_settings boolean default true,
  p_default_method public.payment_method default null
) returns table(sale_id uuid, total_cents integer)
language plpgsql security definer set search_path = public as $$
declare
  v_total integer; v_sale_id uuid; v_customer_id uuid; v_paid integer; v_notes text; v_default_percent numeric;
  v_name text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_phone text := nullif(trim(coalesce(p_customer_phone, '')), '');
begin
  if p_client_request_id is not null then
    select sale.id, sale.total_cents into v_sale_id, v_total
    from public.sales sale
    where sale.created_by = p_actor and sale.client_request_id = p_client_request_id;
    if v_sale_id is not null then return query select v_sale_id, v_total; return; end if;
  end if;

  v_total := public.validate_pos_ticket(p_items);
  select settings.default_commission_percent into v_default_percent from public.business_settings settings order by settings.created_at asc limit 1;

  if p_payments is null and p_default_method is not null then
    p_payments := jsonb_build_array(jsonb_build_object('method', p_default_method, 'amount_cents', v_total));
  end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) not between 1 and 2 then raise exception 'Indica uno o dos métodos de pago'; end if;
  select coalesce(sum(item.amount_cents), 0) into v_paid from jsonb_to_recordset(p_payments) as item(amount_cents integer);
  if v_paid <> v_total or exists (select 1 from jsonb_to_recordset(p_payments) as item(amount_cents integer) where coalesce(item.amount_cents, 0) <= 0) then raise exception 'Los importes de pago no son válidos'; end if;

  -- Settings can change while a terminal holds a card, so a confirmed charge is
  -- recorded against the rules that were in force when the cashier sent it.
  if p_validate_settings then
    if exists (select 1 from jsonb_to_recordset(p_payments) as item(method public.payment_method) where not exists (select 1 from public.business_settings settings where settings.pos_payment_methods ? item.method::text)) then raise exception 'Uno de los métodos de pago no está habilitado'; end if;
    if (exists (select 1 from jsonb_to_recordset(p_payments) as item(method public.payment_method) where item.method = 'cash')
        or exists (select 1 from jsonb_to_recordset(p_items) as item(external_provider_name text, external_payment_method public.payment_method) where nullif(trim(coalesce(item.external_provider_name, '')), '') is not null and item.external_payment_method = 'cash'))
      and not exists (select 1 from public.cash_sessions where status = 'open') then raise exception 'Abre caja antes de registrar efectivo'; end if;
  end if;

  if v_name is not null then
    if v_phone is not null then select customer.id into v_customer_id from public.customers customer where customer.phone = v_phone order by customer.created_at asc limit 1; end if;
    if v_customer_id is null then insert into public.customers(full_name, phone) values(v_name, v_phone) returning id into v_customer_id; end if;
  end if;

  v_notes := nullif(trim(coalesce(p_items->0->>'sale_note', '')), '');
  insert into public.sales(customer_id, subtotal_cents, discount_cents, status, total_cents, created_by, client_request_id, notes)
    values(v_customer_id, v_total, 0, 'completed', v_total, p_actor, p_client_request_id, v_notes)
    returning id into v_sale_id;

  insert into public.sale_items(sale_id, service_id, product_id, description, quantity, unit_price_cents, total_cents)
    select v_sale_id, item.service_id, item.product_id, coalesce(service.name, product.name, trim(item.description)), item.quantity, coalesce(service.price_cents, product.price_cents, item.unit_price_cents), item.quantity * coalesce(service.price_cents, product.price_cents, item.unit_price_cents)
    from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, quantity integer, description text, unit_price_cents integer)
    left join public.services service on service.id = item.service_id and service.active
    left join public.pos_products product on product.id = item.product_id and product.active
    where item.quantity > 0 and ((item.service_id is not null and service.id is not null) or (item.product_id is not null and product.id is not null) or (item.service_id is null and item.product_id is null and item.unit_price_cents > 0));

  update public.pos_products product set stock_quantity = product.stock_quantity - item.quantity, updated_at = now()
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    where product.id = item.product_id and product.stock_quantity is not null;

  insert into public.specialist_earnings(sale_id, specialist_id, service_id, amount_cents, paid_at, paid_by)
    select v_sale_id, item.specialist_id, null, round(item.unit_price_cents * coalesce(compensation.commission_percent, v_default_percent, 0) / 100.0)::integer, now(), p_actor
    from jsonb_to_recordset(p_items) as item(service_id uuid, product_id uuid, specialist_id uuid, unit_price_cents integer)
    join public.profiles specialist on specialist.id = item.specialist_id and specialist.active and specialist.role = 'specialist'
    left join public.specialist_compensation compensation on compensation.specialist_id = item.specialist_id
    where item.service_id is null and item.product_id is null and item.specialist_id is not null;

  insert into public.expenses(category, description, amount_cents, expense_date, payment_method, created_by, sale_id, external_provider_name)
    select 'Comisión externa', concat('Comisión de ', trim(item.external_provider_name), ' por ', trim(item.description)), round(item.unit_price_cents * coalesce(item.commission_percent, v_default_percent, 0) / 100.0)::integer, current_date, item.external_payment_method, p_actor, v_sale_id, trim(item.external_provider_name)
    from jsonb_to_recordset(p_items) as item(description text, unit_price_cents integer, commission_percent numeric, external_provider_name text, external_payment_method public.payment_method)
    where nullif(trim(coalesce(item.external_provider_name, '')), '') is not null and round(item.unit_price_cents * coalesce(item.commission_percent, v_default_percent, 0) / 100.0)::integer > 0;

  -- provider and provider_reference are only ever set from a confirmation the
  -- backend read back from the provider; a manual charge leaves them null.
  insert into public.payments(sale_id, amount_cents, method, provider, provider_reference, status, paid_at)
    select v_sale_id, item.amount_cents, item.method, nullif(trim(coalesce(item.provider, '')), ''), nullif(trim(coalesce(item.provider_payment_id, '')), ''), 'completed', now()
    from jsonb_to_recordset(p_payments) as item(method public.payment_method, amount_cents integer, provider text, provider_payment_id text);

  return query select v_sale_id, v_total;
end;
$$;

revoke all on function public.create_pos_sale_record(jsonb, jsonb, text, text, uuid, uuid, boolean, public.payment_method) from public, anon, authenticated;

create or replace function public.record_pos_sale(
  p_items jsonb, p_payment_method public.payment_method, p_customer_name text default null, p_customer_phone text default null, p_payments jsonb default null, p_client_request_id uuid default null
) returns table(sale_id uuid, total_cents integer)
language plpgsql security definer set search_path = public as $$
declare v_payments jsonb;
begin
  if not public.has_permission('operations.pos') then raise exception 'No tienes permisos para registrar ventas'; end if;
  -- A payment only carries a provider when the backend confirmed it with that
  -- provider, so the manual path drops anything the browser tried to send.
  if p_payments is not null then
    select jsonb_agg(jsonb_build_object('method', entry->>'method', 'amount_cents', (entry->>'amount_cents')::integer)) into v_payments
    from jsonb_array_elements(p_payments) as entry;
  end if;
  return query select * from public.create_pos_sale_record(p_items, v_payments, p_customer_name, p_customer_phone, auth.uid(), p_client_request_id, true, p_payment_method);
end;
$$;

grant execute on function public.record_pos_sale(jsonb, public.payment_method, text, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Terminal charges
-- ---------------------------------------------------------------------------

-- Which payment methods route to a terminal is a setting, not a method name,
-- so renaming "Tarjeta" never silently turns the terminal off.
create or replace function public.pos_method_provider(p_method public.payment_method)
returns text language sql stable security definer set search_path = public as $$
  select nullif(trim(coalesce(settings.pos_payment_method_providers->>p_method::text, '')), '')
  from public.business_settings settings order by settings.created_at asc limit 1;
$$;

grant execute on function public.pos_method_provider(public.payment_method) to authenticated;

-- The intent holds the whole ticket so the sale can be written from it after
-- the card clears, and amount_cents is only the part the terminal collects:
-- on a split ticket the rest is cash or transfer the cashier already has.
create or replace function public.create_terminal_payment_intent(
  p_items jsonb,
  p_payments jsonb,
  p_customer_name text default null,
  p_customer_phone text default null
) returns table(id uuid, amount_cents integer, device_id text, external_reference text, provider text)
language plpgsql security definer set search_path = public as $$
declare
  v_total integer; v_paid integer; v_terminal_rows integer; v_terminal_amount integer;
  v_terminal public.payment_terminals; v_intent_id uuid := gen_random_uuid(); v_payments jsonb;
begin
  if not public.has_permission('operations.pos') then raise exception 'No tienes permisos para registrar ventas'; end if;
  v_total := public.validate_pos_ticket(p_items);

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) not between 1 and 2 then raise exception 'Indica uno o dos métodos de pago'; end if;
  select jsonb_agg(jsonb_build_object(
      'method', entry->>'method',
      'amount_cents', (entry->>'amount_cents')::integer,
      'provider', public.pos_method_provider((entry->>'method')::public.payment_method)))
    into v_payments from jsonb_array_elements(p_payments) as entry;

  select coalesce(sum(item.amount_cents), 0) into v_paid from jsonb_to_recordset(v_payments) as item(amount_cents integer);
  if v_paid <> v_total or exists (select 1 from jsonb_to_recordset(v_payments) as item(amount_cents integer) where coalesce(item.amount_cents, 0) <= 0) then raise exception 'Los importes de pago no son válidos'; end if;
  if exists (select 1 from jsonb_to_recordset(v_payments) as item(method public.payment_method) where not exists (select 1 from public.business_settings settings where settings.pos_payment_methods ? item.method::text)) then raise exception 'Uno de los métodos de pago no está habilitado'; end if;
  if exists (select 1 from jsonb_to_recordset(v_payments) as item(method public.payment_method) where item.method = 'cash') and not exists (select 1 from public.cash_sessions where status = 'open') then raise exception 'Abre caja antes de registrar efectivo'; end if;

  select count(*), coalesce(max(item.amount_cents), 0) into v_terminal_rows, v_terminal_amount
    from jsonb_to_recordset(v_payments) as item(amount_cents integer, provider text) where item.provider is not null;
  if v_terminal_rows <> 1 then raise exception 'Elige exactamente un método de pago que cobre en la terminal'; end if;

  select * into v_terminal from public.payment_terminals terminal
    where terminal.provider = (select item.provider from jsonb_to_recordset(v_payments) as item(provider text) where item.provider is not null limit 1)
      and terminal.active and terminal.setup_status = 'ready_to_test'
    order by terminal.created_at asc limit 1;
  if v_terminal.id is null then raise exception 'Configura una terminal preparada antes de cobrar'; end if;

  update public.terminal_payment_intents
    set state = 'failed', last_error_code = 'ABANDONED', last_state_at = now(), finalized_at = now()
    where terminal_payment_intents.device_id = v_terminal.device_id
      and terminal_payment_intents.state = 'creating'
      and terminal_payment_intents.created_at < now() - interval '2 minutes';
  if exists (select 1 from public.terminal_payment_intents intent where intent.device_id = v_terminal.device_id and intent.state in ('creating', 'pending')) then
    raise exception 'Esa terminal ya tiene un cobro en curso. Termínalo o cancélalo antes de enviar otro.';
  end if;

  insert into public.terminal_payment_intents (
    id, provider, terminal_id, created_by, customer_name, customer_phone, items, ticket_payments,
    amount_cents, device_id, external_reference, state, expires_at
  ) values (
    v_intent_id, v_terminal.provider, v_terminal.id, auth.uid(),
    nullif(trim(coalesce(p_customer_name, '')), ''), nullif(trim(coalesce(p_customer_phone, '')), ''),
    p_items, v_payments, v_terminal_amount, v_terminal.device_id, v_intent_id::text, 'creating', now() + interval '5 minutes'
  );
  return query select v_intent_id, v_terminal_amount, v_terminal.device_id, v_intent_id::text, v_terminal.provider;
end;
$$;

create or replace function public.attach_terminal_payment_request(
  p_intent_id uuid, p_provider_payment_id text, p_provider_status text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('operations.pos') then raise exception 'No tienes permisos para registrar ventas'; end if;
  if nullif(trim(coalesce(p_provider_payment_id, '')), '') is null then raise exception 'La terminal no devolvió un identificador de cobro'; end if;
  update public.terminal_payment_intents
    set provider_payment_id = trim(p_provider_payment_id), provider_payment_status = p_provider_status,
        state = 'pending', last_state_at = now()
    where id = p_intent_id and created_by = auth.uid() and state = 'creating';
  if not found then raise exception 'El cobro en terminal ya no está disponible'; end if;
end;
$$;

create or replace function public.release_terminal_payment_intent(
  p_intent_id uuid, p_state text, p_error_code text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('operations.pos') then raise exception 'No tienes permisos para registrar ventas'; end if;
  if p_state not in ('failed', 'cancelled') then raise exception 'Estado no válido'; end if;
  update public.terminal_payment_intents
    set state = p_state, last_error_code = p_error_code, last_state_at = now(), finalized_at = now()
    where id = p_intent_id and created_by = auth.uid() and state in ('creating', 'pending');
end;
$$;

-- The cashier's browser can be reloaded or closed while the card is still in
-- the terminal, so the open charge is read back from here, never from the tab.
create or replace function public.get_open_terminal_payment_intent()
returns table(id uuid, provider text, provider_payment_id text, device_id text, amount_cents integer, state text, created_at timestamptz, expires_at timestamptz, sale_id uuid, last_error_code text)
language sql stable security definer set search_path = public as $$
  select intent.id, intent.provider, intent.provider_payment_id, intent.device_id, intent.amount_cents,
         intent.state, intent.created_at, intent.expires_at, intent.sale_id, intent.last_error_code
  from public.terminal_payment_intents intent
  where intent.created_by = auth.uid()
    and public.has_permission('operations.pos')
    and ((intent.state = 'pending')
      or (intent.state = 'creating' and intent.created_at > now() - interval '2 minutes')
      or (intent.state = 'requires_review' and intent.sale_id is null and intent.last_state_at > now() - interval '12 hours'))
  order by intent.created_at desc
  limit 1;
$$;

create or replace function public.get_terminal_payment_intent(p_intent_id uuid)
returns table(id uuid, provider text, provider_payment_id text, device_id text, amount_cents integer, state text, created_at timestamptz, expires_at timestamptz, sale_id uuid, last_error_code text)
language sql stable security definer set search_path = public as $$
  select intent.id, intent.provider, intent.provider_payment_id, intent.device_id, intent.amount_cents,
         intent.state, intent.created_at, intent.expires_at, intent.sale_id, intent.last_error_code
  from public.terminal_payment_intents intent
  where intent.id = p_intent_id and public.has_permission('operations.pos');
$$;

grant execute on function public.create_terminal_payment_intent(jsonb, jsonb, text, text) to authenticated;
grant execute on function public.attach_terminal_payment_request(uuid, text, text) to authenticated;
grant execute on function public.release_terminal_payment_intent(uuid, text, text) to authenticated;
grant execute on function public.get_open_terminal_payment_intent() to authenticated;
grant execute on function public.get_terminal_payment_intent(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Provider confirmations (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.finalize_terminal_payment_intent(
  p_provider_payment_id text,
  p_provider_reference text default null,
  p_provider_status text default null
) returns table(sale_id uuid, amount_cents integer)
language plpgsql security definer set search_path = public as $$
declare v_intent public.terminal_payment_intents; v_sale_id uuid; v_total integer; v_payments jsonb; v_reference text;
begin
  if auth.role() <> 'service_role' then raise exception 'Not authorized'; end if;
  select * into v_intent from public.terminal_payment_intents
    where provider_payment_id = p_provider_payment_id for update;
  if v_intent.id is null then raise exception 'Terminal payment intent not found'; end if;
  if v_intent.state = 'completed' then return query select v_intent.sale_id, v_intent.amount_cents; return; end if;
  if v_intent.state not in ('pending', 'requires_review') then raise exception 'Terminal payment intent is not pending'; end if;

  v_reference := coalesce(nullif(trim(coalesce(p_provider_reference, '')), ''), p_provider_payment_id);
  -- Stamp the confirmation onto the one part the terminal collected. The rest
  -- of a split ticket stays manual, with no provider reference of its own.
  select jsonb_agg(case when entry->>'provider' is null then entry
                        else entry || jsonb_build_object('provider_payment_id', v_reference) end)
    into v_payments from jsonb_array_elements(v_intent.ticket_payments) as entry;

  select created_sale.sale_id, created_sale.total_cents into v_sale_id, v_total
    from public.create_pos_sale_record(v_intent.items, v_payments, v_intent.customer_name, v_intent.customer_phone, v_intent.created_by, v_intent.id, false) as created_sale;

  update public.terminal_payment_intents
    set sale_id = v_sale_id, state = 'completed', provider_payment_status = p_provider_status,
        last_state_at = now(), finalized_at = now()
    where id = v_intent.id;
  return query select v_sale_id, v_intent.amount_cents;
end;
$$;

create or replace function public.mark_terminal_payment_intent(
  p_provider_payment_id text,
  p_state text,
  p_provider_status text default null,
  p_error_code text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Not authorized'; end if;
  if p_state not in ('pending', 'failed', 'cancelled', 'requires_review') then raise exception 'Invalid state'; end if;
  update public.terminal_payment_intents
    set state = p_state, provider_payment_status = p_provider_status, last_error_code = p_error_code,
        last_state_at = now(), finalized_at = case when p_state in ('failed', 'cancelled') then now() else finalized_at end
    where provider_payment_id = p_provider_payment_id and state in ('pending', 'requires_review');
end;
$$;

create or replace function public.record_terminal_device_state(
  p_provider text, p_device_id text, p_state text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Not authorized'; end if;
  update public.payment_terminals
    set last_seen_state = p_state, last_seen_at = now(), updated_at = now()
    where provider = p_provider and device_id = p_device_id;
end;
$$;

grant execute on function public.finalize_terminal_payment_intent(text, text, text) to service_role;
grant execute on function public.mark_terminal_payment_intent(text, text, text, text) to service_role;
grant execute on function public.record_terminal_device_state(text, text, text) to service_role;
revoke all on function public.finalize_terminal_payment_intent(text, text, text) from public, anon, authenticated;
revoke all on function public.mark_terminal_payment_intent(text, text, text, text) from public, anon, authenticated;
revoke all on function public.record_terminal_device_state(text, text, text) from public, anon, authenticated;

drop function if exists public.create_clip_pinpad_attempt(jsonb, text, text);
drop function if exists public.attach_clip_pinpad_request(uuid, text);
drop function if exists public.fail_clip_pinpad_attempt(uuid);
drop function if exists public.finalize_clip_pinpad_attempt(text, text);
drop function if exists public.fail_clip_pinpad_payment(text);

-- ---------------------------------------------------------------------------
-- Cash cut
-- ---------------------------------------------------------------------------

-- What the terminal confirmed is reconciled against Clip's own report, and
-- what the cashier keyed in by hand is not, so the cut keeps them apart and
-- counts the operations. Counted cash is never topped up with what we expect.
create or replace function public.get_open_cash_session_summary()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_session public.cash_sessions;
  v_cash integer := 0; v_card integer := 0; v_transfer integer := 0; v_online integer := 0;
  v_confirmed integer := 0; v_confirmed_count integer := 0;
  v_manual_card integer := 0; v_manual_card_count integer := 0;
  v_cash_expenses integer := 0; v_total_expenses integer := 0; v_internal_commissions integer := 0; v_external_commissions integer := 0;
begin
  if not public.has_permission('operations.cash') then raise exception 'No tienes permisos para hacer el corte'; end if;
  select * into v_session from public.cash_sessions where status = 'open' order by opened_at desc limit 1;
  if v_session.id is null then raise exception 'No hay una caja abierta'; end if;

  select coalesce(sum(amount_cents) filter (where method = 'cash'), 0),
         coalesce(sum(amount_cents) filter (where method = 'card'), 0),
         coalesce(sum(amount_cents) filter (where method = 'transfer'), 0),
         coalesce(sum(amount_cents) filter (where method = 'online'), 0),
         coalesce(sum(amount_cents) filter (where sale_id is not null and provider is not null and provider_reference is not null), 0),
         count(*) filter (where sale_id is not null and provider is not null and provider_reference is not null),
         coalesce(sum(amount_cents) filter (where sale_id is not null and method = 'card' and provider is null), 0),
         count(*) filter (where sale_id is not null and method = 'card' and provider is null)
  into v_cash, v_card, v_transfer, v_online, v_confirmed, v_confirmed_count, v_manual_card, v_manual_card_count
  from public.payments where status = 'completed' and created_at >= v_session.opened_at;

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
    'terminal_confirmed_cents', v_confirmed,
    'terminal_confirmed_count', v_confirmed_count,
    'manual_card_cents', v_manual_card,
    'manual_card_count', v_manual_card_count,
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
