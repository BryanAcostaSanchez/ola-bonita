-- Ola Bonita's standard public-booking policy: 50% is paid to confirm the reservation.
update public.business_settings
set booking_deposit_enabled = true,
    booking_deposit_percent = 50,
    updated_at = now();
