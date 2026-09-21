import { createAdminClient } from "@/lib/supabase/admin";
import { ClipApiError } from "@/lib/clip-errors";

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

export type ClipTerminalDevice = {
  serial_number: string;
  status: string;
  merchant_id?: string;
  version?: string;
  expired_at?: string;
  updated_at?: string;
};

// Clip documents APPROVED/REJECTED/CANCELED in its SDK and COMPLETED/FAILED in
// its web reference. The two disagree, so anything this does not recognise is
// treated as still running: a sale is never closed on a state we cannot read.
export type TerminalChargeState = "approved" | "rejected" | "cancelled" | "pending";

const approvedStates = new Set(["APPROVED", "COMPLETED", "SUCCESS", "SUCCEEDED"]);
const rejectedStates = new Set(["REJECTED", "DECLINED", "FAILED", "ERROR", "EXPIRED"]);
const cancelledStates = new Set(["CANCELED", "CANCELLED", "VOIDED"]);

export function readTerminalChargeState(status: string | null | undefined): TerminalChargeState {
  const value = (status ?? "").trim().toUpperCase();
  if (approvedStates.has(value)) return "approved";
  if (rejectedStates.has(value)) return "rejected";
  if (cancelledStates.has(value)) return "cancelled";
  return "pending";
}

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

async function clipError(response: Response) {
  const body = await response.json().catch(() => null) as { code?: string; message?: string; name?: string } | null;
  return new ClipApiError(body?.message || response.statusText, body?.code ?? null, response.status);
}

function terminalWebhookUrl(appUrl: string) {
  const token = process.env.CLIP_WEBHOOK_TOKEN;
  // Clip documents no signature for its webhooks, so the only thing that makes
  // this URL hard to guess is a secret we put in it ourselves. The payload is
  // still never trusted: every notification is read back from Clip.
  return token ? `${appUrl}/api/webhooks/clip?token=${encodeURIComponent(token)}` : `${appUrl}/api/webhooks/clip`;
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
      webhook_url: terminalWebhookUrl(appUrl),
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

// The PinPad API has no sandbox: Clip states it runs in production only, so
// test credentials would fail with an error nobody can act on.
async function requireTerminalCredentials() {
  const credentials = await getClipCredentials();
  if (!credentials) throw new ClipApiError("Conecta Clip en Configuración → Pagos antes de cobrar en la terminal.", null, 400);
  if (credentials.mode !== "production") {
    throw new ClipApiError("La terminal Clip sólo funciona con credenciales de Producción; Clip no ofrece ambiente de pruebas.", null, 400);
  }
  return credentials;
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
  const credentials = await requireTerminalCredentials();
  const { appUrl } = urls("");
  const response = await fetch(`${clipPinpadApi}/payment`, {
    method: "POST",
    headers: { Authorization: authorization(credentials), "Content-Type": "application/json" },
    body: JSON.stringify({
      // Clip takes pesos with decimals here, not cents. Cents stay integers
      // everywhere on our side and are only converted at this boundary.
      amount: (amountCents / 100).toFixed(2),
      reference,
      serial_number_pos: serialNumber,
      webhook_url: terminalWebhookUrl(appUrl),
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
  if (!response.ok) throw await clipError(response);
  const payment = await response.json() as ClipPinpadPayment;
  if (!payment.pinpad_request_id) throw new ClipApiError("Clip no devolvió un identificador de cobro", null, response.status);
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

// Clip only cancels a charge the terminal has not picked up yet. Once the card
// is in, it has to be cancelled on the device itself.
export async function cancelClipPinpadPayment(pinpadRequestId: string) {
  const credentials = await requireTerminalCredentials();
  const response = await fetch(`${clipPinpadApi}/payment/${encodeURIComponent(pinpadRequestId)}`, {
    method: "DELETE",
    headers: { Authorization: authorization(credentials) },
    cache: "no-store",
  });
  if (!response.ok && response.status !== 404) throw await clipError(response);
  return response.ok;
}

// A charge nobody is waiting on any more blocks every following one, because a
// Clip terminal only holds one at a time. This clears whatever it still has.
export async function cancelClipPinpadPaymentsByDevice(serialNumber: string) {
  const credentials = await requireTerminalCredentials();
  const response = await fetch(`${clipPinpadApi}/payment/serial-number/${encodeURIComponent(serialNumber)}`, {
    method: "DELETE",
    headers: { Authorization: authorization(credentials) },
    cache: "no-store",
  });
  if (!response.ok && response.status !== 404) throw await clipError(response);
  return response.ok;
}

export async function getClipPinpadDevices() {
  const credentials = await requireTerminalCredentials();
  const response = await fetch(`${clipPinpadApi}/devices/status`, {
    headers: { Authorization: authorization(credentials) },
    cache: "no-store",
  });
  if (!response.ok) throw await clipError(response);
  const devices = await response.json() as ClipTerminalDevice[] | null;
  return Array.isArray(devices) ? devices : [];
}
