import { createAdminClient } from "@/lib/supabase/admin";
import { readTerminalChargeState, type ClipPaymentLink, type ClipPinpadPayment } from "@/lib/clip";

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

export type TerminalReconciliation = { result: ReconciliationResult; saleId?: string | null };

// Clip's webhook carries no state and no amount, so every path here reads the
// charge back from Clip first. A sale is written only when Clip says the card
// was approved for exactly the amount the terminal was asked to collect.
export async function reconcileClipTerminalPayment(payment: ClipPinpadPayment): Promise<TerminalReconciliation> {
  const admin = createAdminClient();
  const state = readTerminalChargeState(payment.status);
  const { data: intent } = await admin
    .from("terminal_payment_intents")
    .select("id, amount_cents, state, sale_id")
    .eq("provider_payment_id", payment.pinpad_request_id)
    .maybeSingle();
  if (!intent) return { result: "ignored" };
  if (intent.state === "completed") return { result: "completed", saleId: intent.sale_id };

  if (state === "approved") {
    const amountCents = Math.round(Number(payment.amount_paid ?? payment.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents !== intent.amount_cents) {
      await admin.rpc("mark_terminal_payment_intent", {
        p_provider_payment_id: payment.pinpad_request_id,
        p_state: "requires_review",
        p_provider_status: payment.status,
        p_error_code: "AMOUNT_MISMATCH",
      });
      return { result: "requires_review" };
    }
    const { data, error } = await admin.rpc("finalize_terminal_payment_intent", {
      p_provider_payment_id: payment.pinpad_request_id,
      p_provider_reference: payment.receipt_no ?? null,
      p_provider_status: payment.status,
    });
    if (error) {
      // The card was charged; the ticket could not be written. Park it for a
      // person instead of retrying blindly or losing the payment.
      await admin.rpc("mark_terminal_payment_intent", {
        p_provider_payment_id: payment.pinpad_request_id,
        p_state: "requires_review",
        p_provider_status: payment.status,
        p_error_code: "SALE_NOT_RECORDED",
      });
      return { result: "requires_review" };
    }
    return { result: "completed", saleId: (data as { sale_id: string }[] | null)?.[0]?.sale_id ?? null };
  }

  if (state === "rejected" || state === "cancelled") {
    await admin.rpc("mark_terminal_payment_intent", {
      p_provider_payment_id: payment.pinpad_request_id,
      p_state: state === "cancelled" ? "cancelled" : "failed",
      p_provider_status: payment.status,
      p_error_code: null,
    });
    return { result: "failed" };
  }

  return { result: "pending" };
}
