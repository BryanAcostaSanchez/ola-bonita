-- Configurable role templates. Individual profile overrides still take precedence.
create table if not exists public.role_permission_templates (
  role public.user_role primary key check (role in ('manager', 'reception', 'specialist')),
  permissions text[] not null default '{}'::text[] check (permissions <@ array[
    'agenda.view', 'agenda.manage', 'bookings.assign', 'bookings.complete',
    'operations.pos', 'operations.cash', 'operations.expenses', 'analytics.view',
    'settings.agenda', 'settings.catalog', 'settings.finance', 'settings.cabin',
    'settings.payments', 'team.manage', 'team.compensation', 'commissions.manage'
  ]::text[]),
  updated_at timestamptz not null default now()
);

insert into public.role_permission_templates (role, permissions) values
  ('manager', array[
    'agenda.view', 'agenda.manage', 'bookings.assign', 'bookings.complete',
    'operations.pos', 'operations.cash', 'operations.expenses', 'analytics.view',
    'settings.agenda', 'settings.catalog', 'settings.finance', 'settings.cabin',
    'settings.payments', 'team.manage', 'team.compensation', 'commissions.manage'
  ]),
  ('reception', array[
    'agenda.view', 'agenda.manage', 'bookings.assign', 'bookings.complete',
    'operations.pos', 'operations.cash', 'operations.expenses', 'analytics.view',
    'settings.agenda', 'settings.catalog', 'settings.finance', 'settings.payments'
  ]),
  ('specialist', array['agenda.view'])
on conflict (role) do nothing;

-- Accounts that still carry the old stock template should follow their role from
-- now on. Genuine custom permission lists remain individual overrides.
update public.profiles profile
set permission_overrides = null
from public.role_permission_templates template
where profile.role = template.role
  and profile.permission_overrides is not null
  and profile.permission_overrides <@ template.permissions
  and template.permissions <@ profile.permission_overrides;

create or replace function public.has_permission(p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_permissions text[];
begin
  select * into v_profile from public.profiles where id = auth.uid() and active;
  if v_profile.id is null then return false; end if;
  if v_profile.role = 'owner' then return true; end if;

  if v_profile.permission_overrides is not null then
    return p_permission = any(v_profile.permission_overrides);
  end if;

  select permissions into v_permissions
  from public.role_permission_templates
  where role = v_profile.role;
  return p_permission = any(coalesce(v_permissions, '{}'::text[]));
end;
$$;

alter table public.role_permission_templates enable row level security;
create policy "owners manage role permission templates" on public.role_permission_templates
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

