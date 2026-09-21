import { NextResponse } from "next/server";
import { cancelClipPinpadPayment, getClipPinpadPayment } from "@/lib/clip";
import { clipErrorMessage } from "@/lib/clip-errors";
import { reconcileClipTerminalPayment } from "@/lib/clip-payment-reconciliation";
import { logTerminalEvent, requirePosSession, type TerminalIntent } from "@/lib/terminal-session";

export const runtime = "nodejs";

// The cashier's screen polls this. It never reports a result from the browser's
// own state: each call reads the charge back from Clip and lets the database
// decide, so the webhook and this path can race without closing two sales.
export async function GET(request: Request) {
  const { supabase, response } = await requirePosSession();
  if (!supabase) return response;

  const intentId = new URL(request.url).searchParams.get("intent");
  if (!intentId) return NextResponse.json({ error: "Falta el cobro a consultar." }, { status: 422 });

  const { data, error } = await supabase.rpc("get_terminal_payment_intent", { p_intent_id: intentId }).maybeSingle();
  const intent = data as TerminalIntent | null;
  if (error || !intent) return NextResponse.json({ error: "Ese cobro ya no está disponible." }, { status: 404 });

  if (intent.state !== "pending" || !intent.provider_payment_id) {
    return NextResponse.json({ intent });
  }

  // Five minutes is where we stop waiting. The charge is cleared from the
  // terminal so the next ticket is not blocked by this one.
  const expired = intent.expires_at ? Date.now() > new Date(intent.expires_at).getTime() : false;
  if (expired) {
    try {
      await cancelClipPinpadPayment(intent.provider_payment_id);
    } catch (cause) {
      logTerminalEvent("expiry-cancel-failed", { intent: intent.id, message: clipErrorMessage(cause) });
    }
    await supabase.rpc("release_terminal_payment_intent", {
      p_intent_id: intent.id,
      p_state: "cancelled",
      p_error_code: "TIMEOUT",
    });
    return NextResponse.json({
      intent: { ...intent, state: "cancelled", last_error_code: "TIMEOUT" },
      message: "El cobro se canceló porque la terminal no respondió en cinco minutos. Revisa la terminal antes de volver a cobrar.",
    });
  }

  const payment = await getClipPinpadPayment(intent.provider_payment_id);
  if (!payment) return NextResponse.json({ intent });

  const { result, saleId } = await reconcileClipTerminalPayment(payment);
  logTerminalEvent("charge-polled", {
    intent: intent.id, device: intent.device_id, status: payment.status ?? null, result,
  });

  const { data: refreshed } = await supabase.rpc("get_terminal_payment_intent", { p_intent_id: intentId }).maybeSingle();
  return NextResponse.json({ intent: (refreshed as TerminalIntent | null) ?? intent, result, sale_id: saleId ?? null });
}
