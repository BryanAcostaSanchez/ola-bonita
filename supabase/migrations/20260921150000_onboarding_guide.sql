-- Guided first-run setup ("Primeros pasos"). The checklist reads the real
-- configuration to know what is already resolved; these columns only remember
-- what the owner reviewed by hand and whether she hid the reminder.
alter table public.business_settings
  add column if not exists onboarding_step_states jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_dismissed_at timestamptz;

create or replace function public.can_manage_onboarding()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner()
    or public.has_permission('settings.agenda')
    or public.has_permission('settings.catalog')
    or public.has_permission('settings.finance')
    or public.has_permission('settings.cabin')
    or public.has_permission('settings.payments')
    or public.has_permission('team.manage');
$$;

create or replace function public.set_onboarding_step(p_step text, p_state text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings_id uuid;
  v_states jsonb;
begin
  if not public.can_manage_onboarding() then
    raise exception 'No tienes permisos para editar los primeros pasos';
  end if;
  if p_step not in ('cuenta', 'agenda', 'catalogo', 'equipo', 'pagos', 'finanzas', 'cabina') then
    raise exception 'Ese paso no existe en los primeros pasos';
  end if;
  if p_state not in ('pending', 'done', 'skipped') then
    raise exception 'Estado no válido para un paso';
  end if;

  select id, onboarding_step_states into v_settings_id, v_states
  from public.business_settings order by created_at asc limit 1 for update;
  if v_settings_id is null then raise exception 'No encontramos la configuración del negocio'; end if;

  v_states := coalesce(v_states, '{}'::jsonb);
  if p_state = 'pending' then
    v_states := v_states - p_step;
  else
    v_states := v_states || jsonb_build_object(p_step, p_state);
  end if;

  update public.business_settings
    set onboarding_step_states = v_states, updated_at = now()
    where id = v_settings_id;
  return v_states;
end;
$$;

create or replace function public.set_onboarding_dismissed(p_dismissed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_settings_id uuid;
begin
  if not public.can_manage_onboarding() then
    raise exception 'No tienes permisos para editar los primeros pasos';
  end if;
  select id into v_settings_id from public.business_settings order by created_at asc limit 1 for update;
  if v_settings_id is null then raise exception 'No encontramos la configuración del negocio'; end if;
  update public.business_settings
    set onboarding_dismissed_at = case when p_dismissed then now() else null end, updated_at = now()
    where id = v_settings_id;
end;
$$;

grant execute on function public.can_manage_onboarding() to authenticated;
grant execute on function public.set_onboarding_step(text, text) to authenticated;
grant execute on function public.set_onboarding_dismissed(boolean) to authenticated;
