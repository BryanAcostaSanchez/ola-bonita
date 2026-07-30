-- Finance configuration is managed from the authenticated back-office app.
grant select, insert, update, delete on public.finance_categories, public.finance_tags, public.expense_tags to authenticated;

alter table public.finance_categories enable row level security;
alter table public.finance_tags enable row level security;
alter table public.expense_tags enable row level security;

drop policy if exists "front desk manages finance categories" on public.finance_categories;
drop policy if exists "front desk manages finance tags" on public.finance_tags;
drop policy if exists "front desk manages expense tags" on public.expense_tags;

create policy "front desk manages finance categories" on public.finance_categories for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "front desk manages finance tags" on public.finance_tags for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
create policy "front desk manages expense tags" on public.expense_tags for all to authenticated using (public.is_front_desk()) with check (public.is_front_desk());
