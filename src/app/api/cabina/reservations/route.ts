import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCabinClipCheckout, getClipPaymentExpiration, isClipConfigured } from "@/lib/clip";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { startsAt?: string; fullName?: string; phone?: string; email?: string; paymentOption?: "deposit" | "full" } | null;
  if (!body?.startsAt || !body.fullName || !body.phone) return NextResponse.json({ error: "Completa nombre, teléfono y horario." }, { status: 422 });
  const option = body.paymentOption === "full" ? "full" : "deposit";
  const admin = createAdminClient();
  const [{ data: space }, { data: settings }] = await Promise.all([
    admin.from("rental_spaces").select("price_cents, deposit_enabled, deposit_percent, online_payment_options").eq("slug", "cabina-masajes").eq("active", true).maybeSingle(),
    admin.from("business_settings").select("payment_link_expires_minutes").limit(1).maybeSingle(),
  ]);
  if (!space || !space.online_payment_options.includes(option) || (option === "deposit" && (!space.deposit_enabled || !space.deposit_percent))) return NextResponse.json({ error: "Esa opción de pago ya no está disponible. Actualiza la página e inténtalo de nuevo." }, { status: 422 });
  if (!(await isClipConfigured())) return NextResponse.json({ error: "Los pagos en línea se están configurando. Comunícate con Ola Bonita para reservar." }, { status: 503 });

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_rental_reservation", { p_slug: "cabina-masajes", p_starts_at: body.startsAt, p_full_name: body.fullName, p_phone: body.phone, p_email: body.email || null });
  const reservation = data?.[0];
  if (error || !reservation) return NextResponse.json({ error: error?.message || "No pudimos crear la reserva." }, { status: 422 });
  const amountCents = option === "full" ? reservation.price_cents : reservation.deposit_due_cents;
  await admin.from("rental_reservations").update({ online_payment_kind: option, online_payment_cents: amountCents, status: "pending", payment_status: "pending" }).eq("id", reservation.reservation_id);
  const expiresAt = getClipPaymentExpiration(settings?.payment_link_expires_minutes ?? 30);
  const { data: attempt, error: attemptError } = await admin.from("clip_checkout_attempts").insert({ rental_reservation_id: reservation.reservation_id, amount_cents: amountCents, expires_at: expiresAt }).select("id").single();
  if (attemptError || !attempt) {
    await admin.from("rental_reservations").update({ status: "cancelled", payment_status: "failed" }).eq("id", reservation.reservation_id);
    return NextResponse.json({ error: "No pudimos preparar el cobro con Clip. Inténtalo de nuevo en unos minutos." }, { status: 502 });
  }

  try {
    const { data: full } = await admin.from("rental_reservations").select("id, public_code, online_payment_cents, online_payment_kind, full_name, email, phone").eq("id", reservation.reservation_id).single();
    if (!full) throw new Error("Missing reservation");
    const checkout = await createCabinClipCheckout(full as never, expiresAt, attempt.id);
    if (!checkout?.checkoutUrl) throw new Error("No payment configuration");
    const { error: finalizeError } = await admin.rpc("finalize_clip_checkout_attempt", { p_attempt_id: attempt.id, p_payment_request_id: checkout.preferenceId, p_expires_at: checkout.expiresAt });
    if (finalizeError) throw finalizeError;
    return NextResponse.json({ reservation, checkout_url: checkout.checkoutUrl }, { status: 201 });
  } catch {
    await Promise.all([
      admin.from("clip_checkout_attempts").update({ status: "failed" }).eq("id", attempt.id).eq("status", "creating"),
      admin.from("rental_reservations").update({ status: "cancelled", payment_status: "failed" }).eq("id", reservation.reservation_id),
    ]);
    return NextResponse.json({ error: "No pudimos abrir el pago con Clip. Inténtalo de nuevo en unos minutos o comunícate con Ola Bonita." }, { status: 502 });
  }
}
