-- Save all public-booking rules atomically so the website never receives a
-- partially updated capacity or schedule.
alter table public.business_settings
  drop constraint if exists business_settings_slot_interval_minutes_check;
alter table public.business_settings
  add constraint business_settings_slot_interval_minutes_check
  check (slot_interval_minutes in (5, 10, 15, 20, 30, 60));

create or replace function public.save_web_booking_settings(
  p_slot_interval_minutes integer,
  p_web_booking_capacity integer,
  p_hours jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare v_settings_id uuid;
begin
  if not public.is_front_desk() then raise exception 'No tienes permisos para guardar la agenda web'; end if;
  if p_slot_interval_minutes not in (5, 10, 15, 20, 30, 60) then raise exception 'Selecciona una separación válida'; end if;
  if p_web_booking_capacity not between 1 and 50 then raise exception 'El máximo de reservas debe estar entre 1 y 50'; end if;
  if jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) <> 7 then raise exception 'Completa los horarios de los siete días'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_hours) as hour(day_of_week smallint, opens_at time, closes_at time, active boolean)
    where hour.day_of_week not between 0 and 6 or (coalesce(hour.active, false) and (hour.opens_at is null or hour.closes_at is null or hour.closes_at <= hour.opens_at))
  ) then raise exception 'Revisa que cada día activo tenga una hora de cierre posterior a la de apertura'; end if;
  if (select count(distinct hour.day_of_week) from jsonb_to_recordset(p_hours) as hour(day_of_week smallint, opens_at time, closes_at time, active boolean)) <> 7 then raise exception 'Cada día sólo puede aparecer una vez'; end if;

  select id into v_settings_id from public.business_settings order by created_at asc limit 1 for update;
  if v_settings_id is null then raise exception 'No encontramos la configuración del negocio'; end if;
  update public.business_settings set slot_interval_minutes = p_slot_interval_minutes, web_booking_capacity = p_web_booking_capacity, updated_at = now() where id = v_settings_id;
  insert into public.business_hours(day_of_week, opens_at, closes_at, active)
  select hour.day_of_week, hour.opens_at, hour.closes_at, coalesce(hour.active, false)
  from jsonb_to_recordset(p_hours) as hour(day_of_week smallint, opens_at time, closes_at time, active boolean)
  on conflict (day_of_week) do update set opens_at = excluded.opens_at, closes_at = excluded.closes_at, active = excluded.active;
end;
$$;

grant execute on function public.save_web_booking_settings(integer, integer, jsonb) to authenticated;
