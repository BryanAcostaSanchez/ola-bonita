import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCabinCheckout } from "@/lib/mercadopago";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { startsAt?: string; fullName?: string; phone?: string; email?: string; paymentOption?: "deposit" | "full" } | null;
  if (!body?.startsAt || !body.fullName || !body.phone) return NextResponse.json({ error: "Completa nombre, teléfono y horario." }, { status: 422 });
  const option = body.paymentOption === "full" ? "full" : "deposit";
  const admin = createAdminClient();
  const { data: space } = await admin.from("rental_spaces").select("price_cents, deposit_enabled, deposit_percent, online_payment_options").eq("slug", "cabina-masajes").eq("active", true).maybeSingle();
  if (!space || !space.online_payment_options.includes(option) || (option === "deposit" && (!space.deposit_enabled || !space.deposit_percent))) return NextResponse.json({ error: "Esa opción de pago ya no está disponible. Actualiza la página e inténtalo de nuevo." }, { status: 422 });
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_rental_reservation", { p_slug: "cabina-masajes", p_starts_at: body.startsAt, p_full_name: body.fullName, p_phone: body.phone, p_email: body.email || null });
  const reservation = data?.[0];
  if (error || !reservation) return NextResponse.json({ error: error?.message || "No pudimos crear la reserva." }, { status: 422 });
  const amountCents = option === "full" ? reservation.price_cents : reservation.deposit_due_cents;
  await admin.from("rental_reservations").update({ online_payment_kind: option, online_payment_cents: amountCents, status: "pending", payment_status: "pending" }).eq("id", reservation.reservation_id);
  try {
    const { data: full } = await admin.from("rental_reservations").select("id, public_code, online_payment_cents, online_payment_kind, full_name, email, phone").eq("id", reservation.reservation_id).single();
    if (!full) throw new Error("Missing reservation");
    const checkout = await createCabinCheckout(full as never);
    if (!checkout?.checkoutUrl) throw new Error("No payment configuration");
    await admin.from("rental_reservations").update({ payment_provider: "mercadopago", payment_preference_id: checkout.preferenceId }).eq("id", full.id);
    return NextResponse.json({ reservation, checkout_url: checkout.checkoutUrl }, { status: 201 });
  } catch { return NextResponse.json({ reservation, error: "La reserva quedó pendiente. Comunícate con Ola Bonita para completar el pago." }, { status: 201 }); }
}
