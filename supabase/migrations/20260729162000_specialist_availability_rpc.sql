create or replace function public.save_specialist_availability(
  p_specialist_id uuid,
  p_service_ids uuid[],
  p_hours jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_front_desk() then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_specialist_id and active = true and role = 'specialist'
  ) then
    raise exception 'Specialist not found';
  end if;

  if jsonb_typeof(p_hours) <> 'array' then
    raise exception 'Hours must be an array';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_hours) as hour(day_of_week smallint, starts_at time, ends_at time, active boolean)
    where day_of_week not between 0 and 6 or (active and (starts_at is null or ends_at is null or ends_at <= starts_at))
  ) then
    raise exception 'Invalid hours';
  end if;

  delete from public.specialist_services where specialist_id = p_specialist_id;
  insert into public.specialist_services (specialist_id, service_id)
  select p_specialist_id, service_id
  from unnest(coalesce(p_service_ids, '{}'::uuid[])) as service_id
  where exists (select 1 from public.services where id = service_id and active = true)
  on conflict do nothing;

  delete from public.specialist_hours where specialist_id = p_specialist_id;
  insert into public.specialist_hours (specialist_id, day_of_week, starts_at, ends_at, active)
  select p_specialist_id, hour.day_of_week, hour.starts_at, hour.ends_at, coalesce(hour.active, false)
  from jsonb_to_recordset(p_hours) as hour(day_of_week smallint, starts_at time, ends_at time, active boolean);
end;
$$;

grant execute on function public.save_specialist_availability(uuid, uuid[], jsonb) to authenticated;
