-- Granular authorization. A role is only a sensible starting template; an
-- explicit permission list on a profile replaces that template. The owner
-- always retains full access so an account can never lock itself out.
alter table public.profiles
  add column if not exists permission_overrides text[];

alter table public.profiles
  drop constraint if exists profiles_permission_overrides_valid;
alter table public.profiles
  add constraint profiles_permission_overrides_valid check (
    permission_overrides is null or permission_overrides <@ array[
      'agenda.view', 'agenda.manage', 'bookings.assign', 'bookings.complete',
      'operations.pos', 'operations.cash', 'operations.expenses',
      'analytics.view', 'settings.agenda', 'settings.catalog',
      'settings.finance', 'settings.cabin', 'settings.payments',
      'team.manage', 'team.compensation', 'commissions.manage'
    ]::text[]
  );

create or replace function public.has_permission(p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_default_permissions text[];
begin
  select * into v_profile from public.profiles where id = auth.uid() and active;
  if v_profile.id is null then return false; end if;
  if v_profile.role = 'owner' then return true; end if;

  if v_profile.permission_overrides is not null then
    return p_permission = any(v_profile.permission_overrides);
  end if;

  v_default_permissions := case v_profile.role
    when 'manager' then array[
      'agenda.view', 'agenda.manage', 'bookings.assign', 'bookings.complete',
      'operations.pos', 'operations.cash', 'operations.expenses', 'analytics.view',
      'settings.agenda', 'settings.catalog', 'settings.finance', 'settings.cabin',
      'settings.payments', 'team.manage', 'team.compensation', 'commissions.manage'
    ]
    when 'reception' then array[
      'agenda.view', 'agenda.manage', 'bookings.assign', 'bookings.complete',
      'operations.pos', 'operations.cash', 'operations.expenses', 'analytics.view',
      'settings.agenda', 'settings.catalog', 'settings.finance', 'settings.payments'
    ]
    when 'specialist' then array['agenda.view']
    else array[]::text[]
  end;
  return p_permission = any(v_default_permissions);
end;
$$;

create or replace function public.my_permissions()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_agg(permission)
  from unnest(array[
    'agenda.view', 'agenda.manage', 'bookings.assign', 'bookings.complete',
    'operations.pos', 'operations.cash', 'operations.expenses', 'analytics.view',
    'settings.agenda', 'settings.catalog', 'settings.finance', 'settings.cabin',
    'settings.payments', 'team.manage', 'team.compensation', 'commissions.manage'
  ]::text[]) permission
  where public.has_permission(permission)
$$;

grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.my_permissions() to authenticated;

-- Replace broad role policies with action-specific checks. Direct profile
-- changes remain owner-only; privileges are updated through the protected API.
drop policy if exists "staff can read profiles" on public.profiles;
drop policy if exists "owners manage profiles" on public.profiles;
create policy "staff read permitted profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_permission('agenda.view') or public.has_permission('team.manage'));
create policy "owners manage profiles" on public.profiles for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "staff can read bookings" on public.bookings;
drop policy if exists "front desk manages bookings" on public.bookings;
create policy "permitted staff read bookings" on public.bookings for select to authenticated
  using (public.has_permission('agenda.view') or specialist_id = auth.uid());
create policy "permitted staff manage bookings" on public.bookings for all to authenticated
  using (public.has_permission('agenda.manage')) with check (public.has_permission('agenda.manage'));

drop policy if exists "staff can read customers" on public.customers;
drop policy if exists "front desk manages customers" on public.customers;
create policy "permitted staff read customers" on public.customers for select to authenticated
  using (public.has_permission('agenda.view') or public.has_permission('operations.pos'));
create policy "permitted staff manage customers" on public.customers for all to authenticated
  using (public.has_permission('agenda.manage') or public.has_permission('operations.pos'))
  with check (public.has_permission('agenda.manage') or public.has_permission('operations.pos'));

drop policy if exists "front desk manages sales" on public.sales;
drop policy if exists "front desk manages sale items" on public.sale_items;
drop policy if exists "front desk manages payments" on public.payments;
drop policy if exists "front desk manages cash" on public.cash_sessions;
drop policy if exists "front desk manages expenses" on public.expenses;
create policy "permitted staff manage sales" on public.sales for all to authenticated using (public.has_permission('operations.pos') or public.has_permission('analytics.view')) with check (public.has_permission('operations.pos'));
create policy "permitted staff manage sale items" on public.sale_items for all to authenticated using (public.has_permission('operations.pos') or public.has_permission('analytics.view')) with check (public.has_permission('operations.pos'));
create policy "permitted staff manage payments" on public.payments for all to authenticated using (public.has_permission('operations.pos') or public.has_permission('analytics.view')) with check (public.has_permission('operations.pos'));
create policy "permitted staff manage cash" on public.cash_sessions for all to authenticated using (public.has_permission('operations.cash')) with check (public.has_permission('operations.cash'));
create policy "permitted staff manage expenses" on public.expenses for all to authenticated using (public.has_permission('operations.expenses') or public.has_permission('analytics.view')) with check (public.has_permission('operations.expenses'));

-- Security-definer commands are the write path for configuration. Their guards
-- below are the authorization boundary, rather than a broad table policy.
create or replace function public.save_specialist_availability(p_specialist_id uuid, p_service_ids uuid[], p_hours jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('team.manage') then raise exception 'No tienes permisos para gestionar al equipo'; end if;
  if not exists (select 1 from public.profiles where id = p_specialist_id and active and role = 'specialist') then raise exception 'La especialista no está activa'; end if;
  if jsonb_typeof(p_hours) <> 'array' then raise exception 'Los horarios son inválidos'; end if;
  if exists (select 1 from jsonb_to_recordset(p_hours) as h(day_of_week smallint, starts_at time, ends_at time, active boolean) where day_of_week not between 0 and 6 or (active and (starts_at is null or ends_at is null or ends_at <= starts_at))) then raise exception 'Revisa los horarios'; end if;
  delete from public.specialist_services where specialist_id = p_specialist_id;
  insert into public.specialist_services(specialist_id, service_id) select p_specialist_id, service_id from unnest(coalesce(p_service_ids, '{}'::uuid[])) service_id where exists(select 1 from public.services where id = service_id and active) on conflict do nothing;
  delete from public.specialist_hours where specialist_id = p_specialist_id;
  insert into public.specialist_hours(specialist_id, day_of_week, starts_at, ends_at, active) select p_specialist_id, h.day_of_week, h.starts_at, h.ends_at, coalesce(h.active, false) from jsonb_to_recordset(p_hours) h(day_of_week smallint, starts_at time, ends_at time, active boolean);
end;
$$;

create or replace function public.assign_booking_specialist(p_booking_id uuid, p_specialist_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('bookings.assign') then raise exception 'No tienes permisos para asignar citas'; end if;
  if not exists (select 1 from public.profiles where id = p_specialist_id and active and role = 'specialist') then raise exception 'La especialista no está activa'; end if;
  update public.bookings set specialist_id = p_specialist_id, updated_at = now() where id = p_booking_id;
  if not found then raise exception 'La cita no existe'; end if;
end;
$$;

create or replace function public.set_booking_commission_override(p_booking_id uuid, p_commission_cents integer default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_booking public.bookings;
begin
  if not public.has_permission('commissions.manage') then raise exception 'No tienes permisos para ajustar una comisión'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'La cita no existe'; end if;
  if v_booking.status in ('completed', 'cancelled', 'no_show') or v_booking.specialist_id is null then raise exception 'La comisión ya no puede modificarse en esta cita'; end if;
  if p_commission_cents is not null and p_commission_cents < 0 then raise exception 'La comisión no puede ser negativa'; end if;
  if p_commission_cents is not null and nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Indica el motivo del ajuste'; end if;
  update public.bookings set commission_override_cents=p_commission_cents, commission_override_reason=case when p_commission_cents is null then null else trim(p_reason) end, commission_override_at=case when p_commission_cents is null then null else now() end, commission_override_by=case when p_commission_cents is null then null else auth.uid() end, updated_at=now() where id=v_booking.id;
end;
$$;

-- Configuration catalogues use module-specific policies too.
drop policy if exists "managers manage categories" on public.service_categories;
drop policy if exists "managers manage services" on public.services;
drop policy if exists "front desk manages pos products" on public.pos_products;
drop policy if exists "front desk manages finance categories" on public.finance_categories;
drop policy if exists "front desk manages finance tags" on public.finance_tags;
drop policy if exists "front desk manages expense tags" on public.expense_tags;
create policy "permitted staff manage categories" on public.service_categories for all to authenticated using (public.has_permission('settings.catalog')) with check (public.has_permission('settings.catalog'));
create policy "permitted staff manage services" on public.services for all to authenticated using (public.has_permission('settings.catalog')) with check (public.has_permission('settings.catalog'));
create policy "permitted staff manage pos products" on public.pos_products for all to authenticated using (public.has_permission('settings.catalog')) with check (public.has_permission('settings.catalog'));
create policy "permitted staff manage finance categories" on public.finance_categories for all to authenticated using (public.has_permission('settings.finance')) with check (public.has_permission('settings.finance'));
create policy "permitted staff manage finance tags" on public.finance_tags for all to authenticated using (public.has_permission('settings.finance')) with check (public.has_permission('settings.finance'));
create policy "permitted staff manage expense tags" on public.expense_tags for all to authenticated using (public.has_permission('operations.expenses')) with check (public.has_permission('operations.expenses'));

create or replace function public.save_web_booking_settings(p_slot_interval_minutes integer, p_web_booking_capacity integer, p_hours jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_settings_id uuid;
begin
  if not public.has_permission('settings.agenda') then raise exception 'No tienes permisos para configurar la agenda web'; end if;
  if p_slot_interval_minutes not in (5,10,15,20,30,60) or p_web_booking_capacity not between 1 and 50 or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) <> 7 then raise exception 'La configuración de agenda no es válida'; end if;
  select id into v_settings_id from public.business_settings order by created_at asc limit 1 for update;
  update public.business_settings set slot_interval_minutes=p_slot_interval_minutes, web_booking_capacity=p_web_booking_capacity, updated_at=now() where id=v_settings_id;
  insert into public.business_hours(day_of_week,opens_at,closes_at,active) select h.day_of_week,h.opens_at,h.closes_at,coalesce(h.active,false) from jsonb_to_recordset(p_hours) h(day_of_week smallint,opens_at time,closes_at time,active boolean) on conflict(day_of_week) do update set opens_at=excluded.opens_at,closes_at=excluded.closes_at,active=excluded.active;
end;
$$;

create or replace function public.save_category_booking_settings(p_category_id uuid, p_custom_schedule_enabled boolean, p_web_booking_capacity integer, p_hours jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('settings.agenda') then raise exception 'No tienes permisos para configurar disponibilidad'; end if;
  if not exists(select 1 from public.service_categories where id=p_category_id and active) or p_web_booking_capacity not between 1 and 50 then raise exception 'Configuración inválida'; end if;
  insert into public.category_booking_settings(category_id,custom_schedule_enabled,web_booking_capacity,updated_at) values(p_category_id,p_custom_schedule_enabled,p_web_booking_capacity,now()) on conflict(category_id) do update set custom_schedule_enabled=excluded.custom_schedule_enabled,web_booking_capacity=excluded.web_booking_capacity,updated_at=now();
  if p_custom_schedule_enabled then insert into public.category_booking_hours(category_id,day_of_week,opens_at,closes_at,active) select p_category_id,h.day_of_week,h.opens_at,h.closes_at,coalesce(h.active,false) from jsonb_to_recordset(p_hours) h(day_of_week smallint,opens_at time,closes_at time,active boolean) on conflict(category_id,day_of_week) do update set opens_at=excluded.opens_at,closes_at=excluded.closes_at,active=excluded.active; end if;
end;
$$;

create or replace function public.save_rental_space_settings(p_space_id uuid,p_active boolean,p_booking_duration_minutes integer,p_capacity_per_slot integer,p_price_cents integer,p_deposit_enabled boolean,p_deposit_percent numeric,p_hours jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('settings.cabin') then raise exception 'No tienes permisos para configurar la cabina'; end if;
  if not exists(select 1 from public.rental_spaces where id=p_space_id) or p_booking_duration_minutes not in (30,45,60,90,120) or p_capacity_per_slot not between 1 and 20 or p_price_cents < 0 or p_deposit_percent not between 0 and 100 or jsonb_typeof(p_hours) <> 'array' then raise exception 'La configuración de cabina no es válida'; end if;
  update public.rental_spaces set active=p_active,booking_duration_minutes=p_booking_duration_minutes,slot_interval_minutes=p_booking_duration_minutes,capacity_per_slot=p_capacity_per_slot,price_cents=p_price_cents,deposit_enabled=p_deposit_enabled,deposit_percent=p_deposit_percent,updated_at=now() where id=p_space_id;
  delete from public.rental_space_hours where space_id=p_space_id;
  insert into public.rental_space_hours(space_id,day_of_week,opens_at,closes_at,active) select p_space_id,h.day_of_week,h.opens_at,h.closes_at,coalesce(h.active,true) from jsonb_to_recordset(p_hours) h(day_of_week smallint,opens_at time,closes_at time,active boolean);
end;
$$;
