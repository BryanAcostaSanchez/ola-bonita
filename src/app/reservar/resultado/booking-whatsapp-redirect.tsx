"use client";

import { useEffect } from "react";

const bookingWhatsappKey = "ola-bonita:booking-whatsapp:v1";

export function BookingWhatsappRedirect({ paymentApproved }: { paymentApproved: boolean }) {
  useEffect(() => {
    if (!paymentApproved) return;
    const whatsappUrl = sessionStorage.getItem(bookingWhatsappKey);
    if (!whatsappUrl) return;
    sessionStorage.removeItem(bookingWhatsappKey);
    window.location.replace(whatsappUrl);
  }, [paymentApproved]);

  return null;
}
