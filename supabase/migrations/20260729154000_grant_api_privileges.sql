-- RLS is the authorization layer; these grants allow PostgREST to reach the
-- tables so each policy can be evaluated.
grant usage on schema public to anon, authenticated;
grant select on public.service_categories, public.services, public.business_hours to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
