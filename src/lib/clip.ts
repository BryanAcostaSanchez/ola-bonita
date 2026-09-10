import { createAdminClient } from "@/lib/supabase/admin";

export type ClipCredentials = {
  api_key: string;
  secret_key: string;
  mode: "test" | "production";
};

type CheckoutBooking = {
  id: string;
  public_code: string;
  online_payment_cents: number;
  online_payment_kind: "deposit" | "full";
  customer: { full_name: string; email: string | null; phone: string | null };
  service: { name: string };
};

export type ClipPaymentLink = {
  payment_request_id: string;
  payment_request_url?: string;
  status: string;
  amount: number;
  receipt_no?: string;
};

export type ClipPinpadPayment = {
  pinpad_request_id: string;
  reference: string;
  amount: string | number;
  amount_paid?: string | number;
  status: string;
  receipt_no?: string;
};

const clipApi = "https://api.payclip.com/v2/checkout";
const clipPinpadApi = "https://api.payclip.io/f2f/pinpad/v1";

export async function getClipCredentials() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_clip_credentials");
  if (error || !data?.[0]) return null;
  return data[0] as ClipCredentials;
}

export async function isClipConfigured() {
  return Boolean(await getClipCredentials());
}

function authorization(credentials: ClipCredentials) {
  return `Basic ${Buffer.from(`${credentials.api_key}:${credentials.secret_key}`).toString("base64")}`;
}

function urls(path: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.olabonita.shop";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.olabonita.shop";
  return { siteUrl, appUrl, path };
}

export function getClipPaymentExpiration(expiresInMinutes: number) {
  const configuredExpiry = new Date(Date.now() + expiresInMinutes * 60_000);
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const part = (type: Intl.DateTimeFormatPartTypes) => localDate.find((item) => item.type === type)?.value;
  const year = Number(part("year"));
  const month = Number(part("month"));
  const day = Number(part("day"));
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", timeZoneName: "longOffset" }).formatToParts().find((item) => item.type === "timeZoneName")?.value ?? "GMT-06:00";
  const [, sign = "+", hours = "00", minutes = "00"] = /GMT([+-])(\d{2}):(\d{2})/.exec(offset) ?? [];
  const offsetMinutes = (Number(hours) * 60 + Number(minutes)) * (sign === "+" ? 1 : -1);
  const endOfLocalDay = new Date(Date.UTC(year, month - 1, day + 1) - offsetMinutes * 60_000 - 60_000);
  return new Date(Math.min(configuredExpiry.getTime(), endOfLocalDay.getTime())).toISOString();
}

async function createClipLink({
  amountCents,
  description,
  reference,
  customer,
  returnPath,
  expiresAt,
}: {
  amountCents: number;
  description: string;
  reference: string;
  customer: { full_name: string; email: string | null; phone: string | null };
  returnPath: string;
  expiresAt: string;
}) {
  const credentials = await getClipCredentials();
  if (!credentials) return null;
  const { siteUrl, appUrl, path } = urls(returnPath);
  const returnUrl = (result: "success" | "failed" | "pending") => `${siteUrl}${path}${path.includes("?") ? "&" : "?"}gateway=clip&result=${result}`;
  const response = await fetch(clipApi, {
    method: "POST",
    headers: {
      Authorization: authorization(credentials),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountCents / 100,
      currency: "MXN",
      expires_at: expiresAt,
      purchase_description: description.slice(0, 250),
      redirection_url: { success: returnUrl("success"), error: returnUrl("failed"), default: returnUrl("pending") },
      override_settings: { locale: "es-MX", tip_enabled: false, merchant_info: { show_contact_info: true } },
      metadata: {
        external_reference: reference,
        customer_info: {
          name: customer.full_name,
          email: customer.email || undefined,
          phone: customer.phone ? Number(customer.phone.replace(/\D/g, "")) || undefined : undefined,
        },
      },
      webhook_url: `${appUrl}/api/webhooks/clip`,
      custom_payment_options: { payment_method_types: ["debit", "credit"] },
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Clip could not create the payment link");
  const link = await response.json() as ClipPaymentLink;
  if (!link.payment_request_id || !link.payment_request_url) throw new Error("Clip returned an incomplete payment link");
  return { preferenceId: link.payment_request_id, checkoutUrl: link.payment_request_url, expiresAt };
}

export async function createClipCheckout(booking: CheckoutBooking, expiresAt: string, checkoutAttemptId: string) {
  return createClipLink({
    amountCents: booking.online_payment_cents,
    description: `${booking.online_payment_kind === "full" ? "Pago completo" : "Anticipo"} - ${booking.service.name}`,
    reference: checkoutAttemptId,
    customer: booking.customer,
    returnPath: `/reservar/resultado?booking=${booking.public_code}`,
    expiresAt,
  });
}

export async function createCabinClipCheckout(reservation: {
  id: string;
  public_code: string;
  online_payment_cents: number;
  online_payment_kind: "deposit" | "full";
  full_name: string;
  email: string | null;
  phone: string;
}, expiresAt: string, checkoutAttemptId: string) {
  return createClipLink({
    amountCents: reservation.online_payment_cents,
    description: `${reservation.online_payment_kind === "full" ? "Pago completo" : "Apartado"} - Cabina de masajes`,
    reference: checkoutAttemptId,
    customer: reservation,
    returnPath: `/cabina-masajes?reservation=${reservation.public_code}`,
    expiresAt,
  });
}

export async function getClipPaymentLink(paymentRequestId: string, existingCredentials?: ClipCredentials) {
  const credentials = existingCredentials ?? await getClipCredentials();
  if (!credentials) return null;
  const response = await fetch(`${clipApi}/${encodeURIComponent(paymentRequestId)}`, {
    headers: { Authorization: authorization(credentials) },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return await response.json() as ClipPaymentLink;
}

export async function createClipPinpadPayment({
  amountCents,
  reference,
  serialNumber,
}: {
  amountCents: number;
  reference: string;
  serialNumber: string;
}) {
  const credentials = await getClipCredentials();
  if (!credentials || credentials.mode !== "production") return null;
  const { appUrl } = urls("");
  const response = await fetch(`${clipPinpadApi}/payment`, {
    method: "POST",
    headers: { Authorization: authorization(credentials), "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: (amountCents / 100).toFixed(2),
      reference,
      serial_number_pos: serialNumber,
      webhook_url: `${appUrl}/api/webhooks/clip`,
      preferences: {
        is_tip_enabled: false,
        is_msi_enabled: false,
        is_mci_enabled: false,
        is_dcc_enabled: false,
        is_retry_enabled: true,
        is_share_enabled: false,
        is_auto_print_receipt_enabled: false,
        is_split_payment_enabled: false,
      },
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Clip could not start the terminal payment");
  const payment = await response.json() as ClipPinpadPayment;
  if (!payment.pinpad_request_id) throw new Error("Clip returned an incomplete terminal payment");
  return payment;
}

export async function getClipPinpadPayment(pinpadRequestId: string, existingCredentials?: ClipCredentials) {
  const credentials = existingCredentials ?? await getClipCredentials();
  if (!credentials || credentials.mode !== "production") return null;
  const response = await fetch(`${clipPinpadApi}/payment?pinpadRequestId=${encodeURIComponent(pinpadRequestId)}`, {
    headers: { Authorization: authorization(credentials), "Pinpad-Include-Detail": "true" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return await response.json() as ClipPinpadPayment;
}
