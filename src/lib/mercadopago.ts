import { createAdminClient } from "@/lib/supabase/admin";

type Credentials = { access_token: string; webhook_secret: string; public_key: string | null; mode: "test" | "production" };
type CheckoutBooking = { id: string; public_code: string; price_cents: number; deposit_due_cents: number; customer: { full_name: string; email: string | null; phone: string | null }; service: { name: string } };

export async function getMercadoPagoCredentials() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_mercadopago_credentials");
  if (error || !data?.[0]) return null;
  return data[0] as Credentials;
}

export async function createCheckoutPreference(booking: CheckoutBooking) {
  const credentials = await getMercadoPagoCredentials();
  if (!credentials) return null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olabonita.shop";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.olabonita.shop";
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${credentials.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ id: booking.id, title: `Anticipo · ${booking.service.name}`, quantity: 1, currency_id: "MXN", unit_price: booking.deposit_due_cents / 100 }],
      payer: { name: booking.customer.full_name, email: booking.customer.email || undefined, phone: booking.customer.phone ? { number: booking.customer.phone } : undefined },
      external_reference: booking.id,
      statement_descriptor: "OLA BONITA",
      back_urls: { success: `${siteUrl}/reservar/resultado?booking=${booking.public_code}`, pending: `${siteUrl}/reservar/resultado?booking=${booking.public_code}`, failure: `${siteUrl}/reservar/resultado?booking=${booking.public_code}` },
      notification_url: `${appUrl}/api/webhooks/mercadopago`,
      auto_return: "approved",
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: expiresAt,
    }),
  });
  if (!response.ok) throw new Error("Mercado Pago could not create the payment preference");
  const preference = await response.json() as { id: string; init_point?: string; sandbox_init_point?: string };
  return { preferenceId: preference.id, checkoutUrl: credentials.mode === "test" ? preference.sandbox_init_point || preference.init_point : preference.init_point };
}

export async function createCabinCheckout(reservation: { id: string; public_code: string; price_cents: number; deposit_due_cents: number; full_name: string; email: string | null; phone: string }) {
  const credentials = await getMercadoPagoCredentials(); if (!credentials) return null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olabonita.shop"; const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.olabonita.shop";
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", { method: "POST", headers: { Authorization: `Bearer ${credentials.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ id: reservation.id, title: "Apartado · Cabina de masajes", quantity: 1, currency_id: "MXN", unit_price: reservation.deposit_due_cents / 100 }], payer: { name: reservation.full_name, email: reservation.email || undefined, phone: { number: reservation.phone } }, external_reference: `cabin:${reservation.id}`, back_urls: { success: `${siteUrl}/cabina-masajes`, pending: `${siteUrl}/cabina-masajes`, failure: `${siteUrl}/cabina-masajes` }, notification_url: `${appUrl}/api/webhooks/mercadopago`, auto_return: "approved" }) });
  if (!response.ok) throw new Error("Mercado Pago could not create cabin preference"); const preference = await response.json() as { id: string; init_point?: string; sandbox_init_point?: string }; return { preferenceId: preference.id, checkoutUrl: credentials.mode === "test" ? preference.sandbox_init_point || preference.init_point : preference.init_point };
}
