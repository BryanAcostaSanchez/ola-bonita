-- Server-side admin routes use Supabase secret keys. They bypass RLS but still
-- require PostgreSQL grants for the service_role to manage operational records.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
