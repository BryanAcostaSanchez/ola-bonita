import { createAdminClient } from "@/lib/supabase/admin";
import type { ClipPaymentLink, ClipPinpadPayment } from "@/lib/clip";

type ReconciliationResult = "completed" | "failed" | "pending" | "requires_review" | "ignored";

export async function reconcileClipPayment(payment: ClipPaymentLink): Promise<ReconciliationResult> {
  const admin = createAdminClient();
  const completed = payment.status === "CHECKOUT_COMPLETED";
  const failed = ["CHECKOUT_CANCELLED", "CHECKOUT_EXPIRED"].includes(payment.status);

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, online_payment_kind, online_payment_cents")
    .eq("payment_provider", "clip")
    .eq("payment_preference_id", payment.payment_request_id)
    .maybeSingle();

  if (booking) {
    if (Math.round(payment.amount * 100) !== booking.online_payment_cents) return "ignored";
    const providerReference = payment.receipt_no || payment.payment_request_id;
    if (completed && ["cancelled", "no_show"].includes(booking.status)) {
      await Promise.all([
        admin.from("payments").update({ status: "requires_review", provider_reference: providerReference }).eq("booking_id", booking.id).eq("provider", "clip"),
        admin.from("payment_review_items").upsert({ booking_id: booking.id, provider: "clip", provider_reference: providerReference, amount_cents: booking.online_payment_cents, reason: "paid_after_cancellation" }, { onConflict: "provider_reference" }),
      ]);
      return "requires_review";
    }
    await admin
      .from("payments")
      .update({ status: completed ? "completed" : failed ? "failed" : "pending", provider_reference: providerReference })
      .eq("booking_id", booking.id)
      .eq("provider", "clip");
    if (completed && booking.status === "pending") {
      await admin
        .from("bookings")
        .update({ payment_status: booking.online_payment_kind === "full" ? "paid" : "deposit_paid", status: "confirmed" })
        .eq("id", booking.id)
        .eq("status", "pending");
      return "completed";
    }
    if (failed && booking.status === "pending") {
      await admin.from("bookings").update({ payment_status: "unpaid", status: "cancelled" }).eq("id", booking.id).eq("status", "pending");
      return "failed";
    }
    return completed ? "completed" : failed ? "failed" : "pending";
  }

  const { data: reservation } = await admin
    .from("rental_reservations")
    .select("id, status, online_payment_cents")
    .eq("payment_provider", "clip")
    .eq("payment_preference_id", payment.payment_request_id)
    .maybeSingle();
  if (!reservation || Math.round(payment.amount * 100) !== reservation.online_payment_cents) return "ignored";

  if (completed && reservation.status === "cancelled") {
    const providerReference = payment.receipt_no || payment.payment_request_id;
    await Promise.all([
      admin.from("rental_reservations").update({ payment_status: "review_required" }).eq("id", reservation.id).eq("status", "cancelled"),
      admin.from("payment_review_items").upsert({ rental_reservation_id: reservation.id, provider: "clip", provider_reference: providerReference, amount_cents: reservation.online_payment_cents, reason: "paid_after_cancellation" }, { onConflict: "provider_reference" }),
    ]);
    return "requires_review";
  }

  if (completed && reservation.status === "pending") {
    await admin.from("rental_reservations").update({ payment_status: "paid", status: "confirmed" }).eq("id", reservation.id).eq("status", "pending");
    return "completed";
  }
  if (failed && reservation.status === "pending") {
    await admin.from("rental_reservations").update({ payment_status: "failed", status: "cancelled" }).eq("id", reservation.id).eq("status", "pending");
    return "failed";
  }
  return completed ? "completed" : failed ? "failed" : "pending";
}

export async function reconcileClipPinpadPayment(payment: ClipPinpadPayment): Promise<ReconciliationResult> {
  const admin = createAdminClient();
  const amountCents = Math.round(Number(payment.amount_paid ?? payment.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return "ignored";
  const { data: attempt } = await admin
    .from("clip_pinpad_attempts")
    .select("total_cents,status")
    .eq("pinpad_request_id", payment.pinpad_request_id)
    .maybeSingle();
  if (!attempt || attempt.total_cents !== amountCents) return "ignored";

  const completed = ["COMPLETED", "APPROVED"].includes(payment.status);
  const failed = ["REJECTED", "CANCELED", "CANCELLED", "FAILED", "EXPIRED"].includes(payment.status);
  if (completed) {
    const { error } = await admin.rpc("finalize_clip_pinpad_attempt", {
      p_pinpad_request_id: payment.pinpad_request_id,
      p_provider_reference: payment.receipt_no ?? null,
    });
    return error ? "requires_review" : "completed";
  }
  if (failed) {
    await admin.rpc("fail_clip_pinpad_payment", { p_pinpad_request_id: payment.pinpad_request_id });
    return "failed";
  }
  return "pending";
}
