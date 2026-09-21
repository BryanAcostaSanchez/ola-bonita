import { NextResponse } from "next/server";
import { cancelClipPinpadPayment, getClipPinpadPayment, readTerminalChargeState } from "@/lib/clip";
import { clipErrorMessage } from "@/lib/clip-errors";
import { reconcileClipTerminalPayment } from "@/lib/clip-payment-reconciliation";
import { logTerminalEvent, requirePosSession, type TerminalIntent } from "@/lib/terminal-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { supabase, response } = await requirePosSession();
  if (!supabase) return response;

  const body = await request.json().catch(() => null) as { intentId?: unknown } | null;
  if (!body || typeof body.intentId !== "string") {
    return NextResponse.json({ error: "Falta el cobro a cancelar." }, { status: 422 });
  }

  const { data, error } = await supabase.rpc("get_terminal_payment_intent", { p_intent_id: body.intentId }).maybeSingle();
  const intent = data as TerminalIntent | null;
  if (error || !intent) return NextResponse.json({ error: "Ese cobro ya no está disponible." }, { status: 404 });
  if (intent.state !== "pending" || !intent.provider_payment_id) return NextResponse.json({ intent });

  // Clip only cancels a charge the terminal has not picked up. If the card is
  // already in, the last word belongs to the device, so read the charge back
  // rather than telling the cashier something that is no longer true.
  try {
    await cancelClipPinpadPayment(intent.provider_payment_id);
  } catch (cause) {
    const payment = await getClipPinpadPayment(intent.provider_payment_id);
    if (payment && readTerminalChargeState(payment.status) !== "pending") {
      const { result } = await reconcileClipTerminalPayment(payment);
      const { data: settled } = await supabase.rpc("get_terminal_payment_intent", { p_intent_id: body.intentId }).maybeSingle();
      return NextResponse.json({ intent: (settled as TerminalIntent | null) ?? intent, result });
    }
    logTerminalEvent("cancel-refused", { intent: intent.id, device: intent.device_id, message: clipErrorMessage(cause) });
    return NextResponse.json({
      error: "La terminal ya tomó el cobro. Cancélalo en la pantalla del aparato y vuelve a intentarlo.",
    }, { status: 409 });
  }

  await supabase.rpc("release_terminal_payment_intent", {
    p_intent_id: intent.id,
    p_state: "cancelled",
    p_error_code: "CANCELLED_BY_STAFF",
  });
  logTerminalEvent("charge-cancelled", { intent: intent.id, device: intent.device_id });
  return NextResponse.json({ intent: { ...intent, state: "cancelled" } });
}
