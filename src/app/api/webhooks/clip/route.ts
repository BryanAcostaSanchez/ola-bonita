import { NextResponse } from "next/server";
import { getClipPaymentLink, getClipPinpadPayment } from "@/lib/clip";
import { reconcileClipPayment, reconcileClipTerminalPayment } from "@/lib/clip-payment-reconciliation";

export const runtime = "nodejs";

type ClipWebhook = { id?: string; origin?: string; event_type?: string; pinpad_request_id?: string };

export async function POST(request: Request) {
  // Clip documents no signature for its webhooks, so the URL carries a secret
  // of ours instead. It only keeps strangers out of this endpoint: the payload
  // itself is never trusted, whatever token it arrives with.
  const expected = process.env.CLIP_WEBHOOK_TOKEN;
  if (expected && new URL(request.url).searchParams.get("token") !== expected) {
    return NextResponse.json({ received: false }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as ClipWebhook;
  if (body.id && body.origin === "checkout-api") {
    // Checkout's webhook is intentionally minimal. Treat it as a signal only,
    // then verify the payment server-to-server before changing any record.
    const payment = await getClipPaymentLink(body.id);
    if (payment) await reconcileClipPayment(payment);
    return NextResponse.json({ received: true });
  }

  // A terminal notification says a charge changed and nothing else: no state,
  // no amount. Clip's own answer to a GET is the only source of truth.
  const pinpadRequestId = body.pinpad_request_id ?? body.id;
  if (pinpadRequestId) {
    const payment = await getClipPinpadPayment(pinpadRequestId);
    if (payment) await reconcileClipTerminalPayment(payment);
  }

  return NextResponse.json({ received: true });
}
