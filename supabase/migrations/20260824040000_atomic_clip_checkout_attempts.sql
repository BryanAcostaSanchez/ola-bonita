-- An attempt exists before talking to Clip. The checkout link is never sent
-- to the customer until this attempt, its parent reservation and its payment
-- ledger entry have been finalized in one database transaction.
create table if not exists public.clip_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings on delete cascade,
  rental_reservation_id uuid references public.rental_reservations on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  payment_request_id text unique,
  expires_at timestamptz,
  status text not null default 'creating' check (status in ('creating', 'finalized', 'failed')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  check (num_nonnulls(booking_id, rental_reservation_id) = 1)
);

create unique index if not exists payments_clip_checkout_reference_key
  on public.payments (booking_id, provider, provider_reference)
  where provider = 'clip';

alter table public.clip_checkout_attempts enable row level security;
grant all privileges on public.clip_checkout_attempts to service_role;

create or replace function public.finalize_clip_checkout_attempt(
  p_attempt_id uuid,
  p_payment_request_id text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.clip_checkout_attempts;
begin
  if auth.role() <> 'service_role' then raise exception 'Not authorized'; end if;
  select * into v_attempt from public.clip_checkout_attempts where id = p_attempt_id for update;
  if v_attempt.id is null then raise exception 'Checkout attempt not found'; end if;
  if nullif(trim(p_payment_request_id), '') is null then raise exception 'Payment request is required'; end if;

  if v_attempt.status = 'finalized' then
    if v_attempt.payment_request_id <> p_payment_request_id then raise exception 'Checkout attempt already finalized'; end if;
    return;
  end if;
  if v_attempt.status <> 'creating' then raise exception 'Checkout attempt is not active'; end if;

  if v_attempt.booking_id is not null then
    update public.bookings
      set payment_provider = 'clip', payment_preference_id = p_payment_request_id, payment_expires_at = p_expires_at
      where id = v_attempt.booking_id and status = 'pending';
    if not found then raise exception 'Booking is no longer pending'; end if;
    insert into public.payments (booking_id, amount_cents, method, provider, provider_reference, status)
      values (v_attempt.booking_id, v_attempt.amount_cents, 'online', 'clip', p_payment_request_id, 'pending')
      on conflict (booking_id, provider, provider_reference) where provider = 'clip' do nothing;
  else
    update public.rental_reservations
      set payment_provider = 'clip', payment_preference_id = p_payment_request_id, payment_expires_at = p_expires_at
      where id = v_attempt.rental_reservation_id and status = 'pending';
    if not found then raise exception 'Rental reservation is no longer pending'; end if;
  end if;

  update public.clip_checkout_attempts
    set payment_request_id = p_payment_request_id, expires_at = p_expires_at, status = 'finalized', finalized_at = now()
    where id = v_attempt.id;
end;
$$;

grant execute on function public.finalize_clip_checkout_attempt(uuid, text, timestamptz) to service_role;
revoke all on function public.finalize_clip_checkout_attempt(uuid, text, timestamptz) from anon, authenticated, public;
