import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMercadoPagoCredentials } from "@/lib/mercadopago";

export const runtime = "nodejs";

function validSignature(request: NextRequest, secret: string, dataId: string) {
  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const values = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=")).filter(([key, value]) => key && value));
  if (!values.ts || !values.v1 || !requestId) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${values.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const received = values.v1;
  return received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { data?: { id?: string | number } };
  const dataId = request.nextUrl.searchParams.get("data.id") || String(body.data?.id || "");
  if (!dataId) return NextResponse.json({ received: true });
  const credentials = await getMercadoPagoCredentials();
  if (!credentials || !validSignature(request, credentials.webhook_secret, dataId)) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });

  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${credentials.access_token}` } });
  if (!paymentResponse.ok) return NextResponse.json({ received: true });
  const payment = await paymentResponse.json() as { id: number; status: string; external_reference?: string };
  if (!payment.external_reference) return NextResponse.json({ received: true });
  const admin = createAdminClient();
  if (payment.external_reference.startsWith("cabin:")) {
    const reservationId = payment.external_reference.slice("cabin:".length);
    if (payment.status === "approved") await admin.from("rental_reservations").update({ payment_status: "paid", status: "confirmed" }).eq("id", reservationId);
    else if (["rejected", "cancelled"].includes(payment.status)) await admin.from("rental_reservations").update({ payment_status: "failed" }).eq("id", reservationId);
    return NextResponse.json({ received: true });
  }
  const { data: booking } = await admin.from("bookings").select("id, online_payment_kind").eq("id", payment.external_reference).maybeSingle();
  if (!booking) return NextResponse.json({ received: true });

  const approved = payment.status === "approved";
  await admin.from("payments").update({ status: approved ? "completed" : payment.status === "rejected" || payment.status === "cancelled" ? "failed" : "pending", provider_reference: String(payment.id) }).eq("booking_id", booking.id).eq("provider", "mercadopago");
  if (approved) await admin.from("bookings").update({ payment_status: booking.online_payment_kind === "full" ? "paid" : "deposit_paid", status: "confirmed" }).eq("id", booking.id);
  return NextResponse.json({ received: true });
}
