-- Allows multiple availability ranges per day for the massage cabin.
alter table public.rental_space_hours
  drop constraint if exists rental_space_hours_space_id_day_of_week_key;

create index if not exists rental_space_hours_space_day_idx
  on public.rental_space_hours (space_id, day_of_week, opens_at);
