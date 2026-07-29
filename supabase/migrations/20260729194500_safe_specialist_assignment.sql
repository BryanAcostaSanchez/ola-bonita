create or replace function public.assign_booking_specialist(p_booking_id uuid, p_specialist_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_booking public.bookings; v_timezone text; v_start_time time; v_end_time time; v_day smallint;
begin
  if not public.is_front_desk() then raise exception 'No tienes permisos para asignar citas'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'La cita no existe'; end if;
  select timezone into v_timezone from public.business_settings order by created_at asc limit 1;
  v_day := extract(dow from (v_booking.starts_at at time zone coalesce(v_timezone, 'America/Mexico_City')))::smallint;
  v_start_time := (v_booking.starts_at at time zone coalesce(v_timezone, 'America/Mexico_City'))::time;
  v_end_time := (v_booking.ends_at at time zone coalesce(v_timezone, 'America/Mexico_City'))::time;
  if not exists (select 1 from public.profiles where id = p_specialist_id and active and role = 'specialist') then raise exception 'La especialista no está activa'; end if;
  if not exists (select 1 from public.specialist_services where specialist_id = p_specialist_id and service_id = v_booking.service_id) then raise exception 'Esta especialista no tiene asignado ese servicio'; end if;
  if not exists (select 1 from public.specialist_hours where specialist_id = p_specialist_id and active and day_of_week = v_day and v_start_time >= starts_at and v_end_time <= ends_at) then raise exception 'La especialista no está disponible en ese horario'; end if;
  if exists (select 1 from public.bookings where specialist_id = p_specialist_id and id <> p_booking_id and status not in ('cancelled', 'no_show') and starts_at < v_booking.ends_at and ends_at > v_booking.starts_at) then raise exception 'La especialista ya tiene una cita en ese horario'; end if;
  update public.bookings set specialist_id = p_specialist_id, updated_at = now() where id = p_booking_id;
end;
$$;
grant execute on function public.assign_booking_specialist(uuid, uuid) to authenticated;
