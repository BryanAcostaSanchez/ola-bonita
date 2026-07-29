-- Staff access is role-based. Public visitors can only read the bookable catalogue
-- and operating hours; all operational data remains behind authenticated RLS.

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role = 'owner'
  );
$$;

create or replace function public.is_front_desk()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role in ('owner', 'manager', 'reception')
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Only while there is no owner may the first signed-in staff member claim setup.
create or replace function public.bootstrap_owner()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtext('ola_bonita_bootstrap_owner'));

  if exists (select 1 from public.profiles where role = 'owner' and active = true) then
    raise exception 'An owner already exists';
  end if;

  update public.profiles set role = 'owner' where id = auth.uid() and active = true;
  if not found then
    raise exception 'Active staff profile not found';
  end if;
end;
$$;

grant execute on function public.bootstrap_owner() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger business_settings_set_updated_at before update on public.business_settings for each row execute procedure public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger services_set_updated_at before update on public.services for each row execute procedure public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers for each row execute procedure public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings for each row execute procedure public.set_updated_at();

drop policy if exists "staff can read profiles" on public.profiles;
drop policy if exists "staff can manage profiles" on public.profiles;
drop policy if exists "staff can manage bookings" on public.bookings;
drop policy if exists "staff can manage customers" on public.customers;
drop policy if exists "staff can manage sales" on public.sales;
drop policy if exists "staff can manage sale items" on public.sale_items;
drop policy if exists "staff can manage payments" on public.payments;
drop policy if exists "staff can manage cash" on public.cash_sessions;
drop policy if exists "staff can manage expenses" on public.expenses;
drop policy if exists "staff can manage settings" on public.business_settings;
drop policy if exists "staff can manage service categories" on public.service_categories;
drop policy if exists "staff can manage services" on public.services;
drop policy if exists "staff can manage specialist services" on public.specialist_services;
drop policy if exists "staff can manage business hours" on public.business_hours;
drop policy if exists "staff can manage specialist hours" on public.specialist_hours;

create policy "staff can read profiles" on public.profiles for select to authenticated using (public.is_staff());
create policy "owners manage profiles" on public.profiles for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "staff can read bookings" on public.bookings for select to authenticated using (public.is_front_desk() or specialist_id = auth.uid());
create policy "front desk manages bookings" on public.bookings for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "staff can read customers" on public.customers for select to authenticated using (public.is_staff());
create policy "front desk manages customers" on public.customers for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());

create policy "front desk manages sales" on public.sales for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "front desk manages sale items" on public.sale_items for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "front desk manages payments" on public.payments for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "front desk manages cash" on public.cash_sessions for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "front desk manages expenses" on public.expenses for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());

create policy "managers manage settings" on public.business_settings for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "managers manage categories" on public.service_categories for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "managers manage services" on public.services for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "staff can read specialist services" on public.specialist_services for select to authenticated using (public.is_staff());
create policy "managers manage specialist services" on public.specialist_services for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "staff can read specialist hours" on public.specialist_hours for select to authenticated using (public.is_staff());
create policy "managers manage specialist hours" on public.specialist_hours for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "managers manage business hours" on public.business_hours for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
