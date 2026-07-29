create extension if not exists supabase_vault with schema vault;

create table if not exists public.payment_integrations (
  provider text primary key check (provider in ('mercadopago')),
  public_key text,
  access_token_secret_id uuid,
  webhook_secret_id uuid,
  mode text not null default 'production' check (mode in ('test', 'production')),
  configured_at timestamptz,
  configured_by uuid references public.profiles on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.payment_integrations enable row level security;
create policy "owners read payment integration state" on public.payment_integrations
  for select to authenticated using (public.is_owner());

alter table public.bookings add column if not exists payment_provider text;
alter table public.bookings add column if not exists payment_preference_id text;
create unique index if not exists bookings_payment_preference_id_key
  on public.bookings(payment_preference_id) where payment_preference_id is not null;

create or replace function public.save_mercadopago_credentials(
  p_public_key text,
  p_access_token text,
  p_webhook_secret text,
  p_mode text default 'production'
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing public.payment_integrations;
  v_access_id uuid;
  v_webhook_id uuid;
begin
  if not public.is_owner() then raise exception 'Not authorized'; end if;
  if p_mode not in ('test', 'production') then raise exception 'Invalid mode'; end if;

  select * into v_existing from public.payment_integrations where provider = 'mercadopago';
  if nullif(trim(p_access_token), '') is null and found then
    v_access_id := v_existing.access_token_secret_id;
  elsif found and v_existing.access_token_secret_id is not null then
    perform vault.update_secret(v_existing.access_token_secret_id, trim(p_access_token), 'olabonita_mercadopago_access_token', 'Mercado Pago access token');
    v_access_id := v_existing.access_token_secret_id;
  else
    select vault.create_secret(trim(p_access_token), 'olabonita_mercadopago_access_token', 'Mercado Pago access token') into v_access_id;
  end if;

  if nullif(trim(p_webhook_secret), '') is null and found then
    v_webhook_id := v_existing.webhook_secret_id;
  elsif found and v_existing.webhook_secret_id is not null then
    perform vault.update_secret(v_existing.webhook_secret_id, trim(p_webhook_secret), 'olabonita_mercadopago_webhook_secret', 'Mercado Pago webhook signature secret');
    v_webhook_id := v_existing.webhook_secret_id;
  else
    select vault.create_secret(trim(p_webhook_secret), 'olabonita_mercadopago_webhook_secret', 'Mercado Pago webhook signature secret') into v_webhook_id;
  end if;

  if v_access_id is null or v_webhook_id is null then
    raise exception 'Access token and webhook secret are required';
  end if;

  insert into public.payment_integrations (provider, public_key, access_token_secret_id, webhook_secret_id, mode, configured_at, configured_by)
  values ('mercadopago', nullif(trim(p_public_key), ''), v_access_id, v_webhook_id, p_mode, now(), auth.uid())
  on conflict (provider) do update set public_key = excluded.public_key,
    access_token_secret_id = excluded.access_token_secret_id, webhook_secret_id = excluded.webhook_secret_id,
    mode = excluded.mode, configured_at = now(), configured_by = auth.uid(), updated_at = now();
end;
$$;

create or replace function public.get_mercadopago_credentials()
returns table (access_token text, webhook_secret text, public_key text, mode text)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Not authorized'; end if;
  return query
  select access_secret.decrypted_secret, webhook_secret.decrypted_secret, integration.public_key, integration.mode
  from public.payment_integrations integration
  join vault.decrypted_secrets access_secret on access_secret.id = integration.access_token_secret_id
  join vault.decrypted_secrets webhook_secret on webhook_secret.id = integration.webhook_secret_id
  where integration.provider = 'mercadopago';
end;
$$;

grant execute on function public.save_mercadopago_credentials(text, text, text, text) to authenticated;
grant execute on function public.get_mercadopago_credentials() to service_role;
revoke all on function public.get_mercadopago_credentials() from anon, authenticated, public;
