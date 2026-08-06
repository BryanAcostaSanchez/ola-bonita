-- Reservation policies stay in business_settings; gateway credentials remain
-- isolated by provider so switching processors never changes booking rules.
alter table public.business_settings
  add column if not exists web_payments_enabled boolean not null default true,
  add column if not exists web_payment_provider text not null default 'mercadopago';
alter table public.business_settings drop constraint if exists business_settings_web_payment_provider_check;
alter table public.business_settings add constraint business_settings_web_payment_provider_check check (web_payment_provider in ('mercadopago', 'getnet', 'none'));

alter table public.payment_integrations drop constraint if exists payment_integrations_provider_check;
alter table public.payment_integrations add constraint payment_integrations_provider_check check (provider in ('mercadopago', 'getnet'));

create or replace function public.save_getnet_credentials(p_merchant_id text, p_api_key text, p_webhook_secret text, p_mode text default 'production')
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_existing public.payment_integrations; v_key_id uuid; v_webhook_id uuid;
begin
  if not public.is_owner() then raise exception 'Not authorized'; end if;
  if p_mode not in ('test','production') then raise exception 'Invalid mode'; end if;
  select * into v_existing from public.payment_integrations where provider='getnet';
  if nullif(trim(p_api_key),'') is null and found then v_key_id:=v_existing.access_token_secret_id;
  elsif found and v_existing.access_token_secret_id is not null then perform vault.update_secret(v_existing.access_token_secret_id,trim(p_api_key),'olabonita_getnet_api_key','Getnet API key'); v_key_id:=v_existing.access_token_secret_id;
  else select vault.create_secret(trim(p_api_key),'olabonita_getnet_api_key','Getnet API key') into v_key_id; end if;
  if nullif(trim(p_webhook_secret),'') is null and found then v_webhook_id:=v_existing.webhook_secret_id;
  elsif found and v_existing.webhook_secret_id is not null then perform vault.update_secret(v_existing.webhook_secret_id,trim(p_webhook_secret),'olabonita_getnet_webhook_secret','Getnet webhook secret'); v_webhook_id:=v_existing.webhook_secret_id;
  else select vault.create_secret(trim(p_webhook_secret),'olabonita_getnet_webhook_secret','Getnet webhook secret') into v_webhook_id; end if;
  if v_key_id is null or v_webhook_id is null then raise exception 'API key and webhook secret are required'; end if;
  insert into public.payment_integrations(provider,public_key,access_token_secret_id,webhook_secret_id,mode,configured_at,configured_by) values('getnet',nullif(trim(p_merchant_id),''),v_key_id,v_webhook_id,p_mode,now(),auth.uid()) on conflict(provider) do update set public_key=excluded.public_key,access_token_secret_id=excluded.access_token_secret_id,webhook_secret_id=excluded.webhook_secret_id,mode=excluded.mode,configured_at=now(),configured_by=auth.uid(),updated_at=now();
end;
$$;
grant execute on function public.save_getnet_credentials(text,text,text,text) to authenticated;
