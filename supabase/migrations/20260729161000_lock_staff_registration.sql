-- New auth users are never staff by default. The first account can bootstrap the
-- owner role; after that, staff accounts must be created/activated by the owner.

alter table public.profiles alter column active set default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, active)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

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

  update public.profiles
  set role = 'owner', active = true
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

create or replace function public.has_bootstrapped_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where role = 'owner' and active = true);
$$;

grant execute on function public.has_bootstrapped_owner() to anon, authenticated;
