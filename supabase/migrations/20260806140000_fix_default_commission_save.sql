-- business_settings can contain more than one historical row. PostgREST rejects
-- unrestricted updates, so update the canonical settings record explicitly.
create or replace function public.save_default_commission_percent(p_percent numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_settings_id uuid;
begin
  if not public.has_permission('team.manage') then raise exception 'No tienes permisos para gestionar las comisiones'; end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then raise exception 'El porcentaje debe estar entre 0 y 100'; end if;
  select id into v_settings_id from public.business_settings order by created_at asc limit 1 for update;
  if v_settings_id is null then raise exception 'No encontramos la configuración del negocio'; end if;
  update public.business_settings set default_commission_percent = p_percent, updated_at = now() where id = v_settings_id;
end;
$$;
grant execute on function public.save_default_commission_percent(numeric) to authenticated;
