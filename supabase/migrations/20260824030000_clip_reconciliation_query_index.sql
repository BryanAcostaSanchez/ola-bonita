-- The reconciliation job prioritizes overdue Clip checkouts and then the
-- oldest active links.  This index keeps both lookups bounded as usage grows.
create index if not exists bookings_pending_clip_payment_state_idx
  on public.bookings (payment_expires_at, created_at)
  where payment_provider = 'clip' and status = 'pending';

create index if not exists rental_reservations_pending_clip_payment_state_idx
  on public.rental_reservations (payment_expires_at, created_at)
  where payment_provider = 'clip' and status = 'pending';
