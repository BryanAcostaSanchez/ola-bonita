-- Save cabin settings through one privileged, validated operation. This avoids
-- relying on table-level RLS policies that may differ on older projects.
alter table public.rental_spaces
  drop constraint if exists rental_spaces_slot_interval_minutes_check;
alter table public.rental_spaces
  add constraint rental_spaces_slot_interval_minutes_check
  check (slot_interval_minutes in (15, 30, 45, 60, 90, 120));

create or replace function public.save_rental_space_settings(
  p_space_id uuid,
  p_active boolean,
  p_booking_duration_minutes integer,
  p_capacity_per_slot integer,
  p_price_cents integer,
  p_deposit_enabled boolean,
  p_deposit_percent numeric,
  p_hours jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_front_desk() then raise exception 'No tienes permisos para guardar la cabina'; end if;
  if not exists (select 1 from public.rental_spaces where id = p_space_id) then raise exception 'La cabina no existe'; end if;
  if p_booking_duration_minutes not in (30, 45, 60, 90, 120) then raise exception 'Selecciona una duración válida'; end if;
  if p_capacity_per_slot not between 1 and 20 then raise exception 'La capacidad debe estar entre 1 y 20'; end if;
  if p_price_cents < 0 then raise exception 'El precio no puede ser negativo'; end if;
  if p_deposit_percent not between 0 and 100 then raise exception 'El apartado debe estar entre 0 y 100'; end if;
  if jsonb_typeof(p_hours) <> 'array' then raise exception 'Los horarios son inválidos'; end if;
  if exists (select 1 from jsonb_to_recordset(p_hours) as hour(day_of_week smallint, opens_at time, closes_at time, active boolean) where hour.day_of_week not between 0 and 6 or hour.opens_at is null or hour.closes_at is null or hour.closes_at <= hour.opens_at) then raise exception 'Revisa las franjas de horario'; end if;

  update public.rental_spaces set active = p_active, booking_duration_minutes = p_booking_duration_minutes, slot_interval_minutes = p_booking_duration_minutes, capacity_per_slot = p_capacity_per_slot, price_cents = p_price_cents, deposit_enabled = p_deposit_enabled, deposit_percent = p_deposit_percent, updated_at = now() where id = p_space_id;
  delete from public.rental_space_hours where space_id = p_space_id;
  insert into public.rental_space_hours(space_id, day_of_week, opens_at, closes_at, active)
  select p_space_id, hour.day_of_week, hour.opens_at, hour.closes_at, coalesce(hour.active, true)
  from jsonb_to_recordset(p_hours) as hour(day_of_week smallint, opens_at time, closes_at time, active boolean);
end;
$$;

grant execute on function public.save_rental_space_settings(uuid, boolean, integer, integer, integer, boolean, numeric, jsonb) to authenticated;
