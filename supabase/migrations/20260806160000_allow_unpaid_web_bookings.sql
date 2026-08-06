alter table public.business_settings
  add column if not exists allow_booking_without_online_payment boolean not null default false;

drop function if exists public.get_public_booking_settings();
create function public.get_public_booking_settings()
returns table (timezone text, deposit_enabled boolean, deposit_percent numeric, lead_time_minutes integer, slot_interval_minutes integer, payment_ready boolean, online_payment_options text[], allow_booking_without_online_payment boolean)
language sql stable security definer set search_path = public as $$
  select settings.timezone, settings.booking_deposit_enabled, settings.booking_deposit_percent,
         settings.booking_lead_time_minutes, settings.slot_interval_minutes,
         exists (select 1 from public.payment_integrations where provider = 'mercadopago' and access_token_secret_id is not null and webhook_secret_id is not null),
         settings.online_payment_options, settings.allow_booking_without_online_payment
  from public.business_settings settings order by settings.created_at asc limit 1;
$$;
grant execute on function public.get_public_booking_settings() to anon, authenticated;
