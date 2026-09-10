-- Keep the payment-link deadline with each reservation.  The business setting
-- can change later, but an already created checkout must retain its own limit.
alter table public.bookings
  add column if not exists payment_expires_at timestamptz;

alter table public.rental_reservations
  add column if not exists payment_expires_at timestamptz;

create index if not exists bookings_pending_clip_payment_expiry_idx
  on public.bookings (payment_expires_at)
  where payment_provider = 'clip' and status = 'pending';

create index if not exists rental_reservations_pending_clip_payment_expiry_idx
  on public.rental_reservations (payment_expires_at)
  where payment_provider = 'clip' and status = 'pending';
