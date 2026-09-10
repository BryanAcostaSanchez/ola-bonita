-- Recover capacity when a server interruption leaves an internal checkout
-- intention without a finalized Clip reference.
create or replace function public.expire_unfinalized_clip_attempts(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.clip_checkout_attempts;
  v_count integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'Not authorized'; end if;
  for v_attempt in
    select * from public.clip_checkout_attempts
    where status = 'creating' and expires_at <= now()
    order by expires_at asc
    limit greatest(1, least(p_limit, 500))
    for update skip locked
  loop
    if v_attempt.booking_id is not null then
      update public.bookings
        set status = 'cancelled', payment_status = 'unpaid'
        where id = v_attempt.booking_id and status = 'pending' and payment_preference_id is null;
    else
      update public.rental_reservations
        set status = 'cancelled', payment_status = 'failed'
        where id = v_attempt.rental_reservation_id and status = 'pending' and payment_preference_id is null;
    end if;
    update public.clip_checkout_attempts set status = 'failed' where id = v_attempt.id and status = 'creating';
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.expire_unfinalized_clip_attempts(integer) to service_role;
revoke all on function public.expire_unfinalized_clip_attempts(integer) from anon, authenticated, public;

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'completed', 'failed', 'refunded', 'requires_review'));

alter table public.rental_reservations drop constraint if exists rental_reservations_payment_status_check;
alter table public.rental_reservations add constraint rental_reservations_payment_status_check
  check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'review_required'));

create table if not exists public.payment_review_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings on delete set null,
  rental_reservation_id uuid references public.rental_reservations on delete set null,
  provider text not null default 'clip',
  provider_reference text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null default 'paid_after_cancellation',
  status text not null default 'open' check (status in ('open', 'resolved', 'refunded')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(booking_id, rental_reservation_id) = 1)
);

alter table public.payment_review_items enable row level security;
create policy "managers read payment reviews" on public.payment_review_items
  for select to authenticated using (public.has_permission('analytics.view'));
grant all privileges on public.payment_review_items to service_role;
