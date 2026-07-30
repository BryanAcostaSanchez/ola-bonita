create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#397c75',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#7287b5',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.expense_tags (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  tag_id uuid not null references public.finance_tags(id) on delete restrict,
  primary key (expense_id, tag_id)
);

alter table public.finance_categories enable row level security;
alter table public.finance_tags enable row level security;
alter table public.expense_tags enable row level security;

drop policy if exists "front desk manages finance categories" on public.finance_categories;
drop policy if exists "front desk manages finance tags" on public.finance_tags;
drop policy if exists "front desk manages expense tags" on public.expense_tags;
create policy "front desk manages finance categories" on public.finance_categories for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "front desk manages finance tags" on public.finance_tags for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "front desk manages expense tags" on public.expense_tags for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());

insert into public.finance_categories (name, color, sort_order) values
  ('Insumos', '#397c75', 1), ('Nómina', '#7287b5', 2), ('Renta y servicios', '#bd8b46', 3), ('Marketing', '#d9787b', 4), ('Mantenimiento', '#9877ad', 5), ('Otros', '#8da9a4', 6)
on conflict (name) do nothing;

insert into public.finance_tags (name, color, sort_order) values
  ('Recurrente', '#397c75', 1), ('Urgente', '#d9787b', 2), ('Deducible', '#7287b5', 3), ('Proveedor', '#bd8b46', 4)
on conflict (name) do nothing;

create or replace function public.record_expense(
  p_category text,
  p_description text,
  p_amount_cents integer,
  p_payment_method public.payment_method,
  p_expense_date date default current_date,
  p_tag_ids uuid[] default '{}'
) returns public.expenses language plpgsql security definer set search_path = public as $$
declare v_expense public.expenses;
begin
  if not public.is_front_desk() then raise exception 'No tienes permisos para registrar gastos'; end if;
  if p_amount_cents <= 0 or nullif(trim(coalesce(p_category, '')), '') is null then raise exception 'Completa la categoría y un importe válido'; end if;
  if not exists (select 1 from public.finance_categories where active and name = trim(p_category)) then raise exception 'Selecciona una categoría válida'; end if;
  if p_payment_method = 'cash' and not exists (select 1 from public.cash_sessions where status = 'open') then raise exception 'Abre caja antes de registrar un gasto en efectivo'; end if;
  insert into public.expenses (category, description, amount_cents, payment_method, expense_date, created_by)
  values (trim(p_category), nullif(trim(coalesce(p_description, '')), ''), p_amount_cents, p_payment_method, coalesce(p_expense_date, current_date), auth.uid()) returning * into v_expense;
  insert into public.expense_tags (expense_id, tag_id)
  select v_expense.id, tag_id from unnest(coalesce(p_tag_ids, '{}'::uuid[])) tag_id
  join public.finance_tags on finance_tags.id = tag_id and finance_tags.active
  on conflict do nothing;
  return v_expense;
end; $$;
grant execute on function public.record_expense(text, text, integer, public.payment_method, date, uuid[]) to authenticated;
