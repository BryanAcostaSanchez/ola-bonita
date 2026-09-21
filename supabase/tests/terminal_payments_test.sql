-- Rules a card-present charge must keep, checked against a real database.
--
-- Run it against a local Supabase stack, where the auth and vault schemas
-- exist, after applying the migrations:
--
--   supabase db reset
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/terminal_payments_test.sql
--
-- It rolls back at the end, so it leaves nothing behind. It exercises only our
-- own rules: Clip has no sandbox, so the terminal itself is tested by charging
-- one peso for real.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'prueba@olabonita.shop');
insert into public.profiles (id, role, active, full_name)
  values ('11111111-1111-1111-1111-111111111111', 'owner', true, 'Prueba')
  on conflict (id) do update set role = 'owner', active = true;
insert into public.services (id, category_id, name, price_cents, duration_minutes, active)
  values ('22222222-2222-2222-2222-222222222222', (select id from public.service_categories order by name limit 1), 'Servicio de prueba', 30000, 45, true);
update public.business_settings
  set pos_payment_methods = '["cash","card","transfer"]'::jsonb,
      pos_payment_method_providers = '{"card":"clip"}'::jsonb,
      default_commission_percent = 0;
insert into public.payment_terminals (provider, device_id, label, active, setup_status)
  values ('clip', 'P8220724000042', 'Mostrador', true, 'ready_to_test');

\set ticket '[{"service_id":"22222222-2222-2222-2222-222222222222","quantity":1,"specialist_id":null,"external_provider_name":"Invitada","external_payment_method":"cash"}]'

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
set local "request.jwt.claim.role" = 'authenticated';
select public.open_cash_session(0);

\echo '1. Una cuenta dividida manda a la terminal sólo la parte con tarjeta'
select * from public.create_terminal_payment_intent(
  :'ticket'::jsonb, '[{"method":"cash","amount_cents":10000},{"method":"card","amount_cents":20000}]'::jsonb,
  'Ana', '5512345678') \gset intent_
select (:'intent_amount_cents'::integer = 20000) as solo_la_parte_con_tarjeta;

\echo '2. La terminal acepta un cobro a la vez'
do $$ begin
  perform public.create_terminal_payment_intent(
    '[{"service_id":"22222222-2222-2222-2222-222222222222","quantity":1,"specialist_id":null,"external_provider_name":"Invitada","external_payment_method":"cash"}]'::jsonb,
    '[{"method":"cash","amount_cents":10000},{"method":"card","amount_cents":20000}]'::jsonb, null, null);
  raise exception 'ESPERABA UN ERROR DE COBRO EN CURSO';
exception when others then
  if sqlerrm not like '%cobro en curso%' then raise; end if;
end $$;

\echo '3. El cajero no lee la tabla de cobros directamente, sólo por sus funciones'
do $$ begin
  perform 1 from public.terminal_payment_intents;
  raise exception 'ESPERABA PERMISO DENEGADO';
exception when insufficient_privilege then null;
end $$;

select public.attach_terminal_payment_request(:'intent_id'::uuid, 'pinpad-prueba-1', 'PENDING');

\echo '4. Tras recargar la página se retoma el mismo cobro, no se manda otro'
select (id = :'intent_id'::uuid) as mismo_cobro, state from public.get_open_terminal_payment_intent();

\echo '5. Sólo el service_role cierra una venta desde una confirmación'
do $$ begin
  perform public.finalize_terminal_payment_intent('pinpad-prueba-1', 'RCP-1', 'APPROVED');
  raise exception 'ESPERABA QUE EL CAJERO NO PUDIERA CERRAR LA VENTA';
exception
  when insufficient_privilege then null;
  when others then if sqlerrm not like '%Not authorized%' then raise; end if;
end $$;

reset role;
set local "request.jwt.claim.role" = 'service_role';

\echo '6. Clip aprueba: se crea la venta con el pago ligado'
select * from public.finalize_terminal_payment_intent('pinpad-prueba-1', 'RCP-1', 'APPROVED');

\echo '7. Confirmar dos veces no escribe una segunda venta'
select * from public.finalize_terminal_payment_intent('pinpad-prueba-1', 'RCP-1', 'APPROVED');
select (count(*) = 1) as una_sola_venta from public.sales;

\echo '8. Sólo la parte de la terminal lleva el identificador de Clip'
select method, amount_cents, provider, provider_reference from public.payments where sale_id is not null order by method;

\echo '9. Un cobro abandonado no bloquea la terminal para siempre'
insert into public.terminal_payment_intents (created_by, items, ticket_payments, amount_cents, device_id, external_reference, state, created_at)
  values ('11111111-1111-1111-1111-111111111111', :'ticket'::jsonb, '[]'::jsonb, 20000, 'P8220724000042', 'abandonado', 'creating', now() - interval '10 minutes');
set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
select * from public.create_terminal_payment_intent(
  :'ticket'::jsonb, '[{"method":"cash","amount_cents":10000},{"method":"card","amount_cents":20000}]'::jsonb,
  null, null) \gset fresh_
select (:'fresh_id' <> :'intent_id') as se_pudo_cobrar_de_nuevo;

\echo '10. El corte separa lo confirmado por Clip de lo cobrado a mano'
select jsonb_pretty(public.get_open_cash_session_summary() - 'opened_at');

\echo '11. Un provider enviado desde el navegador se descarta en una venta manual'
select * from public.record_pos_sale(
  :'ticket'::jsonb, 'cash'::public.payment_method, null, null,
  '[{"method":"cash","amount_cents":30000,"provider":"clip","provider_payment_id":"FALSO"}]'::jsonb,
  '44444444-4444-4444-4444-444444444444'::uuid) \gset manual_
reset role;
select (provider is null and provider_reference is null) as sin_provider
  from public.payments where sale_id = :'manual_sale_id'::uuid;

rollback;
