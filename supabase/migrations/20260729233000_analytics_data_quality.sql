-- Data points required for reliable operational and financial analytics.
alter table public.bookings
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists balance_paid_at timestamptz;

alter table public.payments
  add column if not exists paid_at timestamptz,
  add column if not exists processor_fee_cents integer not null default 0 check (processor_fee_cents >= 0);

alter table public.services
  add column if not exists estimated_cost_cents integer not null default 0 check (estimated_cost_cents >= 0);

create index if not exists bookings_analytics_status_time_idx on public.bookings (status, starts_at);
create index if not exists payments_analytics_time_idx on public.payments (status, created_at);
create index if not exists expenses_analytics_date_idx on public.expenses (expense_date);

comment on column public.bookings.completed_at is 'Actual completion time for performance analytics.';
comment on column public.bookings.cancellation_reason is 'Reason supplied for cancellation or no-show.';
comment on column public.bookings.balance_paid_at is 'Time when the outstanding balance was settled.';
comment on column public.payments.processor_fee_cents is 'Commission charged by Mercado Pago or card processor.';
comment on column public.services.estimated_cost_cents is 'Estimated supplies cost for margin reporting.';
