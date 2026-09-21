import { NextResponse } from "next/server";
import { cancelClipPinpadPayment, getClipCredentials, getClipPaymentLink, getClipPinpadPayment } from "@/lib/clip";
import { reconcileClipPayment, reconcileClipTerminalPayment } from "@/lib/clip-payment-reconciliation";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHECKS_PER_RUN = 100;
const BATCH_SIZE = 5;
type PendingCheckout = { payment_preference_id: string; payment_expires_at: string | null };
type PendingTerminalCharge = { provider_payment_id: string; expires_at: string | null };

async function pendingCheckouts(
  table: "bookings" | "rental_reservations",
  now: string,
  expired: boolean,
  limit: number,
) {
  let query = createAdminClient()
    .from(table)
    .select("payment_preference_id, payment_expires_at")
    .eq("payment_provider", "clip")
    .eq("status", "pending")
    .not("payment_preference_id", "is", null)
    .order("payment_expires_at", { ascending: true })
    .limit(limit);
  query = expired
    ? query.lte("payment_expires_at", now)
    : query.or(`payment_expires_at.gt.${now},payment_expires_at.is.null`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).filter((record): record is PendingCheckout => Boolean(record.payment_preference_id));
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: expiredAttempts, error: attemptsError } = await admin.rpc("expire_unfinalized_clip_attempts", { p_limit: MAX_CHECKS_PER_RUN });
  if (attemptsError) return NextResponse.json({ error: "No pudimos recuperar las intenciones de Clip." }, { status: 500 });
  const credentials = await getClipCredentials();
  if (!credentials) return NextResponse.json({ error: "Clip is not configured" }, { status: 503 });

  try {
    const now = new Date().toISOString();
    const perSourceLimit = Math.ceil(MAX_CHECKS_PER_RUN / 2);
    const [expiredBookings, expiredCabins] = await Promise.all([
      pendingCheckouts("bookings", now, true, perSourceLimit),
      pendingCheckouts("rental_reservations", now, true, perSourceLimit),
    ]);
    const expired = [...expiredBookings, ...expiredCabins]
      .sort((a, b) => (a.payment_expires_at ?? "").localeCompare(b.payment_expires_at ?? ""));
    const remaining = Math.max(0, MAX_CHECKS_PER_RUN - expired.length);
    const [activeBookings, activeCabins] = remaining > 0 ? await Promise.all([
      pendingCheckouts("bookings", now, false, Math.ceil(remaining / 2)),
      pendingCheckouts("rental_reservations", now, false, Math.floor(remaining / 2)),
    ]) : [[], []];
    const paymentIds = [...expired, ...activeBookings, ...activeCabins]
      .slice(0, MAX_CHECKS_PER_RUN)
      .map((record) => record.payment_preference_id);
    const { data: pinpadAttempts, error: pinpadError } = await admin
      .from("terminal_payment_intents")
      .select("provider_payment_id, expires_at")
      .eq("state", "pending")
      .not("provider_payment_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(MAX_CHECKS_PER_RUN);
    if (pinpadError) throw pinpadError;
    const results: string[] = [];
    for (let index = 0; index < paymentIds.length; index += BATCH_SIZE) {
      const batch = await Promise.all(paymentIds.slice(index, index + BATCH_SIZE).map(async (id) => {
        try {
          const payment = await getClipPaymentLink(id, credentials);
          return payment ? await reconcileClipPayment(payment) : "unavailable";
        } catch {
          return "error";
        }
      }));
      results.push(...batch);
    }
    const pinpadResults = await Promise.all((pinpadAttempts ?? []).filter((attempt): attempt is PendingTerminalCharge => Boolean(attempt.provider_payment_id)).map(async (attempt) => {
      try {
        const payment = await getClipPinpadPayment(attempt.provider_payment_id, credentials);
        const result = payment ? (await reconcileClipTerminalPayment(payment)).result : "unavailable";
        if (result !== "pending" && result !== "unavailable") return result;
        // A charge nobody is waiting on any more still blocks the terminal, so
        // it is cleared once its five minutes are up even if the tab is gone.
        if (!attempt.expires_at || Date.now() <= new Date(attempt.expires_at).getTime()) return result;
        await cancelClipPinpadPayment(attempt.provider_payment_id).catch(() => false);
        await admin.rpc("mark_terminal_payment_intent", {
          p_provider_payment_id: attempt.provider_payment_id,
          p_state: "cancelled",
          p_provider_status: payment?.status ?? null,
          p_error_code: "TIMEOUT",
        });
        return "expired";
      } catch {
        return "error";
      }
    }));
    const allResults = [...results, ...pinpadResults];
    return NextResponse.json({ checked: paymentIds.length + pinpadResults.length, expired_attempts_released: expiredAttempts ?? 0, expired_prioritized: expired.length, results: allResults.reduce<Record<string, number>>((summary, result) => ({ ...summary, [result]: (summary[result] ?? 0) + 1 }), {}) });
  } catch {
    return NextResponse.json({ error: "No pudimos preparar la conciliación de Clip." }, { status: 500 });
  }
}
