import { NextResponse } from "next/server";
import { cancelClipPinpadPayment, cancelClipPinpadPaymentsByDevice, createClipPinpadPayment } from "@/lib/clip";
import { clipErrorMessage, isTerminalBusyError } from "@/lib/clip-errors";
import { logTerminalEvent, requirePosSession, type TerminalIntent } from "@/lib/terminal-session";

export const runtime = "nodejs";

type ChargeRequest = { items?: unknown; payments?: unknown; customerName?: unknown; customerPhone?: unknown };
type CreatedIntent = { id: string; amount_cents: number; device_id: string; external_reference: string; provider: string };

// Creating the charge is two steps on purpose: the ticket is written down
// before Clip is asked for anything, so a charge can never exist on a terminal
// without a row here to reconcile it against.
export async function POST(request: Request) {
  const { supabase, response } = await requirePosSession();
  if (!supabase) return response;

  const body = await request.json().catch(() => null) as ChargeRequest | null;
  if (!body || !Array.isArray(body.items) || !body.items.length) {
    return NextResponse.json({ error: "Agrega al menos un artículo al ticket." }, { status: 422 });
  }
  if (!Array.isArray(body.payments) || !body.payments.length) {
    return NextResponse.json({ error: "Indica cómo se paga el ticket." }, { status: 422 });
  }

  const { data: intentData, error } = await supabase.rpc("create_terminal_payment_intent", {
    p_items: body.items,
    p_payments: body.payments,
    p_customer_name: typeof body.customerName === "string" ? body.customerName : null,
    p_customer_phone: typeof body.customerPhone === "string" ? body.customerPhone : null,
  }).single();
  const intent = intentData as CreatedIntent | null;
  if (error || !intent) {
    return NextResponse.json({ error: error?.message || "No pudimos preparar el cobro en terminal." }, { status: 422 });
  }

  let providerPaymentId: string | null = null;
  try {
    const payment = await sendToTerminal(intent);
    providerPaymentId = payment.pinpad_request_id;
    const { error: attachError } = await supabase.rpc("attach_terminal_payment_request", {
      p_intent_id: intent.id,
      p_provider_payment_id: payment.pinpad_request_id,
      p_provider_status: payment.status ?? null,
    });
    if (attachError) throw attachError;
    logTerminalEvent("charge-created", {
      intent: intent.id, device: intent.device_id, amount_cents: intent.amount_cents, status: payment.status ?? null,
    });
    return NextResponse.json({
      intent_id: intent.id,
      provider_payment_id: payment.pinpad_request_id,
      amount_cents: intent.amount_cents,
      device_id: intent.device_id,
      state: "pending",
    } satisfies Partial<TerminalIntent> & Record<string, unknown>, { status: 201 });
  } catch (cause) {
    const code = cause instanceof Error && "code" in cause ? String((cause as { code?: unknown }).code ?? "") : "";
    // The charge may already be waiting on the terminal even though we could
    // not write it down. Leaving it there would take a customer's money against
    // a ticket nothing will ever close.
    if (providerPaymentId) await cancelClipPinpadPayment(providerPaymentId).catch(() => false);
    await supabase.rpc("release_terminal_payment_intent", {
      p_intent_id: intent.id,
      p_state: "failed",
      p_error_code: code || null,
    });
    logTerminalEvent("charge-failed", { intent: intent.id, device: intent.device_id, code: code || null });
    return NextResponse.json({ error: clipErrorMessage(cause) }, { status: 502 });
  }
}

// A Clip terminal holds one charge at a time. If a previous one was abandoned
// it blocks every following charge, and the only way out is to clear it and
// send this one again — once, so a real outage is not hammered.
async function sendToTerminal(intent: CreatedIntent) {
  try {
    return await createClipPinpadPayment({
      amountCents: intent.amount_cents,
      reference: intent.external_reference,
      serialNumber: intent.device_id,
    });
  } catch (cause) {
    if (!isTerminalBusyError(cause)) throw cause;
    logTerminalEvent("terminal-busy-retry", { intent: intent.id, device: intent.device_id });
    await cancelClipPinpadPaymentsByDevice(intent.device_id);
    return await createClipPinpadPayment({
      amountCents: intent.amount_cents,
      reference: intent.external_reference,
      serialNumber: intent.device_id,
    });
  }
}

// After a reload the tab has forgotten what it was waiting for, but the
// terminal has not. This is what it asks before sending anything new.
export async function GET() {
  const { supabase, response } = await requirePosSession();
  if (!supabase) return response;
  const { data, error } = await supabase.rpc("get_open_terminal_payment_intent").maybeSingle();
  if (error) return NextResponse.json({ error: "No pudimos consultar el cobro en curso." }, { status: 502 });
  return NextResponse.json({ intent: (data as TerminalIntent | null) ?? null });
}
