-- Operational roles are intentionally simple:
-- Gerencia manages the business; Especialista operates Agenda and POS only.
-- The owner role remains the protected technical administrator.
update public.profiles
set role = 'specialist', permission_overrides = null
where role = 'reception';

update public.profiles
set permission_overrides = null
where role in ('manager', 'specialist');

alter table public.role_permission_templates
  drop constraint if exists role_permission_templates_role_check;
delete from public.role_permission_templates where role = 'reception';
alter table public.role_permission_templates
  add constraint role_permission_templates_role_check
  check (role in ('manager', 'specialist'));

insert into public.role_permission_templates (role, permissions) values
  ('manager', array[
    'agenda.view', 'agenda.manage', 'bookings.assign', 'bookings.complete',
    'operations.pos', 'operations.cash', 'operations.expenses', 'analytics.view',
    'settings.agenda', 'settings.catalog', 'settings.finance', 'settings.cabin',
    'settings.payments', 'team.manage', 'team.compensation', 'commissions.manage'
  ]),
  ('specialist', array[
    'agenda.view', 'agenda.manage', 'bookings.assign', 'bookings.complete',
    'operations.pos'
  ])
on conflict (role) do update set permissions = excluded.permissions, updated_at = now();
