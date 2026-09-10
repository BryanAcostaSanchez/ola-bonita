-- Clip is the operational gateway. Legacy Mercado Pago data remains readable,
-- but all new web bookings and cabin payments are created with Clip.
alter table public.business_settings
  drop constraint if exists business_settings_payment_provider_check;
alter table public.business_settings
  add constraint business_settings_payment_provider_check
  check (payment_provider in ('clip', 'mercadopago', 'getnet', 'none'));
alter table public.business_settings
  alter column payment_provider set default 'clip';
update public.business_settings set payment_provider = 'clip' where payment_provider = 'mercadopago';

alter table public.business_settings
  drop constraint if exists business_settings_web_payment_provider_check;
alter table public.business_settings
  add constraint business_settings_web_payment_provider_check
  check (web_payment_provider in ('clip', 'mercadopago', 'getnet', 'none'));
alter table public.business_settings
  alter column web_payment_provider set default 'clip';
update public.business_settings set web_payment_provider = 'clip' where web_payment_provider = 'mercadopago';

alter table public.payment_integrations
  drop constraint if exists payment_integrations_provider_check;
alter table public.payment_integrations
  add constraint payment_integrations_provider_check
  check (provider in ('clip', 'mercadopago', 'getnet'));

create or replace function public.save_clip_credentials(
  p_api_key text,
  p_secret_key text,
  p_mode text default 'production'
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing public.payment_integrations;
  v_api_key_id uuid;
  v_secret_key_id uuid;
begin
  if not public.is_owner() then raise exception 'Not authorized'; end if;
  if p_mode not in ('test', 'production') then raise exception 'Invalid mode'; end if;

  select * into v_existing from public.payment_integrations where provider = 'clip';
  if nullif(trim(p_api_key), '') is null and found then
    v_api_key_id := v_existing.access_token_secret_id;
  elsif found and v_existing.access_token_secret_id is not null then
    perform vault.update_secret(v_existing.access_token_secret_id, trim(p_api_key), 'olabonita_clip_api_key', 'Clip API key');
    v_api_key_id := v_existing.access_token_secret_id;
  else
    select vault.create_secret(trim(p_api_key), 'olabonita_clip_api_key', 'Clip API key') into v_api_key_id;
  end if;

  if nullif(trim(p_secret_key), '') is null and found then
    v_secret_key_id := v_existing.webhook_secret_id;
  elsif found and v_existing.webhook_secret_id is not null then
    perform vault.update_secret(v_existing.webhook_secret_id, trim(p_secret_key), 'olabonita_clip_secret_key', 'Clip secret key');
    v_secret_key_id := v_existing.webhook_secret_id;
  else
    select vault.create_secret(trim(p_secret_key), 'olabonita_clip_secret_key', 'Clip secret key') into v_secret_key_id;
  end if;

  if v_api_key_id is null or v_secret_key_id is null then
    raise exception 'Clip API key and secret key are required';
  end if;

  insert into public.payment_integrations (provider, access_token_secret_id, webhook_secret_id, mode, configured_at, configured_by)
  values ('clip', v_api_key_id, v_secret_key_id, p_mode, now(), auth.uid())
  on conflict (provider) do update set
    access_token_secret_id = excluded.access_token_secret_id,
    webhook_secret_id = excluded.webhook_secret_id,
    mode = excluded.mode,
    configured_at = now(),
    configured_by = auth.uid(),
    updated_at = now();
end;
$$;

create or replace function public.get_clip_credentials()
returns table (api_key text, secret_key text, mode text)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Not authorized'; end if;
  return query
  select api_key.decrypted_secret, secret_key.decrypted_secret, integration.mode
  from public.payment_integrations integration
  join vault.decrypted_secrets api_key on api_key.id = integration.access_token_secret_id
  join vault.decrypted_secrets secret_key on secret_key.id = integration.webhook_secret_id
  where integration.provider = 'clip';
end;
$$;

grant execute on function public.save_clip_credentials(text, text, text) to authenticated;
grant execute on function public.get_clip_credentials() to service_role;
revoke all on function public.get_clip_credentials() from anon, authenticated, public;

drop function if exists public.get_public_booking_settings();
create function public.get_public_booking_settings()
returns table (timezone text, deposit_enabled boolean, deposit_percent numeric, lead_time_minutes integer, slot_interval_minutes integer, payment_ready boolean, online_payment_options text[], allow_booking_without_online_payment boolean)
language sql stable security definer set search_path = public as $$
  select settings.timezone, settings.booking_deposit_enabled, settings.booking_deposit_percent,
         settings.booking_lead_time_minutes, settings.slot_interval_minutes,
         exists (select 1 from public.payment_integrations where provider = 'clip' and access_token_secret_id is not null and webhook_secret_id is not null),
         settings.online_payment_options, settings.allow_booking_without_online_payment
  from public.business_settings settings order by settings.created_at asc limit 1;
$$;
grant execute on function public.get_public_booking_settings() to anon, authenticated;
