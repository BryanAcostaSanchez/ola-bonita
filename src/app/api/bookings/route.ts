import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCheckoutPreference } from "@/lib/mercadopago";
import { createServerClient } from "@/lib/supabase/server";
import { sendBookingEmails } from "@/lib/transactional-email";

type PaymentOption = "deposit" | "full";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.serviceId !== "string" || typeof body.startsAt !== "string" || typeof body.fullName !== "string" || typeof body.phone !== "string") return NextResponse.json({ error: "Completa los datos de la reserva." }, { status: 422 });
  const paymentOption: PaymentOption = body.paymentOption === "full" ? "full" : "deposit";
  const admin = createAdminClient();
  const [{ data: settings }, { data: service }] = await Promise.all([
    admin.from("business_settings").select("online_payment_options, booking_deposit_enabled, booking_deposit_percent").limit(1).maybeSingle(),
    admin.from("services").select("price_cents, deposit_enabled, deposit_percent").eq("id", body.serviceId).eq("active", true).eq("online_bookable", true).maybeSingle(),
  ]);
  const options = settings?.online_payment_options ?? ["deposit"];
  const depositEnabled = service?.deposit_enabled === false ? false : (service?.deposit_enabled ?? settings?.booking_deposit_enabled ?? false);
  const depositPercent = service?.deposit_percent ?? settings?.booking_deposit_percent ?? 0;
  if (!service || !options.includes(paymentOption) || (paymentOption === "deposit" && (!depositEnabled || !depositPercent))) return NextResponse.json({ error: "Esa opción de pago ya no está disponible. Actualiza la página e inténtalo de nuevo." }, { status: 422 });

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_public_booking", { p_service_id: body.serviceId, p_specialist_id: null, p_starts_at: body.startsAt, p_full_name: body.fullName, p_phone: body.phone, p_email: typeof body.email === "string" ? body.email : null, p_notes: typeof body.notes === "string" ? body.notes : null });
  if (error) return NextResponse.json({ error: error.message.includes("just booked") ? "Ese horario acaba de ocuparse. Elige otro." : "No pudimos crear la reserva." }, { status: 422 });
  const booking = data?.[0];
  if (!booking) return NextResponse.json({ error: "No pudimos crear la reserva." }, { status: 422 });
  const amountCents = paymentOption === "full" ? booking.price_cents : booking.deposit_due_cents;
  if (!amountCents) return NextResponse.json({ error: "No hay un importe disponible para cobrar en línea." }, { status: 422 });
  await admin.from("bookings").update({ online_payment_kind: paymentOption, online_payment_cents: amountCents, status: "pending", payment_status: "pending" }).eq("id", booking.booking_id);
  const { data: emailBooking } = await admin.from("bookings").select("id, public_code, starts_at, price_cents, deposit_due_cents, customer:customers(full_name,email), service:services(name), specialist:profiles(full_name)").eq("id", booking.booking_id).single();
  if (emailBooking) await sendBookingEmails(emailBooking as never).catch(() => undefined);
  try {
    const { data: paymentBooking, error: bookingError } = await admin.from("bookings").select("id, public_code, online_payment_cents, online_payment_kind, customer:customers(full_name, email, phone), service:services(name)").eq("id", booking.booking_id).single();
    if (bookingError || !paymentBooking) throw new Error("Booking missing");
    const checkout = await createCheckoutPreference(paymentBooking as never);
    if (!checkout?.checkoutUrl) throw new Error("Mercado Pago is not configured");
    await Promise.all([
      admin.from("bookings").update({ payment_provider: "mercadopago", payment_preference_id: checkout.preferenceId }).eq("id", booking.booking_id),
      admin.from("payments").insert({ booking_id: booking.booking_id, amount_cents: amountCents, method: "online", provider: "mercadopago", provider_reference: checkout.preferenceId, status: "pending" }),
    ]);
    return NextResponse.json({ booking, checkout_url: checkout.checkoutUrl }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ booking, error: "La reserva quedó registrada, pero no pudimos abrir el pago. Comunícate con Ola Bonita para completar el pago." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  }
}
