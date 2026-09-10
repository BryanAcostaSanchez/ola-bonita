import { NextResponse } from "next/server";
import { createClipPinpadPayment } from "@/lib/clip";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PinpadRequest = {
  items?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
};
type CreatedAttempt = { id: string; total_cents: number; reader_serial: string };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as PinpadRequest | null;
  if (!body || !Array.isArray(body.items) || !body.items.length) {
    return NextResponse.json({ error: "Agrega al menos un artículo al ticket." }, { status: 422 });
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Tu sesión expiró. Vuelve a entrar." }, { status: 401 });

  const { data: attemptData, error } = await supabase.rpc("create_clip_pinpad_attempt", {
    p_items: body.items,
    p_customer_name: typeof body.customerName === "string" ? body.customerName : null,
    p_customer_phone: typeof body.customerPhone === "string" ? body.customerPhone : null,
  }).single();
  const attempt = attemptData as CreatedAttempt | null;
  if (error || !attempt) return NextResponse.json({ error: error?.message || "No pudimos preparar el cobro en terminal." }, { status: 422 });

  try {
    const payment = await createClipPinpadPayment({
      amountCents: attempt.total_cents,
      reference: attempt.id,
      serialNumber: attempt.reader_serial,
    });
    if (!payment) throw new Error("Clip PinPad requiere credenciales de Producción conectadas.");
    const { error: finalizeError } = await supabase.rpc("attach_clip_pinpad_request", {
      p_attempt_id: attempt.id,
      p_pinpad_request_id: payment.pinpad_request_id,
    });
    if (finalizeError) throw finalizeError;
    return NextResponse.json({ attempt_id: attempt.id, pinpad_request_id: payment.pinpad_request_id, status: "pending" }, { status: 201 });
  } catch (cause) {
    await supabase.rpc("fail_clip_pinpad_attempt", { p_attempt_id: attempt.id });
    const message = cause instanceof Error ? cause.message : "No pudimos enviar el cobro a la terminal.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
