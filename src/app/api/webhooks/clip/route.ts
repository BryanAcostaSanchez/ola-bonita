import { NextResponse } from "next/server";
import { getClipPaymentLink, getClipPinpadPayment } from "@/lib/clip";
import { reconcileClipPayment, reconcileClipPinpadPayment } from "@/lib/clip-payment-reconciliation";

export const runtime = "nodejs";

type ClipWebhook = { id?: string; origin?: string; event_type?: "INSERT" | "UPDATE"; pinpad_request_id?: string };

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as ClipWebhook;
  if (body.id && body.origin === "checkout-api") {
    // Checkout's webhook is intentionally minimal. Treat it as a signal only,
    // then verify the payment server-to-server before changing any record.
    const payment = await getClipPaymentLink(body.id);
    if (payment) await reconcileClipPayment(payment);
    return NextResponse.json({ received: true });
  }

  // PinPad notifications can arrive as a full postback or as an id-only
  // signal. In both cases, never trust the payload: fetch Clip's source of
  // truth before finalizing a POS sale.
  const pinpadRequestId = body.pinpad_request_id ?? body.id;
  if (pinpadRequestId) {
    const payment = await getClipPinpadPayment(pinpadRequestId);
    if (payment) await reconcileClipPinpadPayment(payment);
  }

  return NextResponse.json({ received: true });
}
