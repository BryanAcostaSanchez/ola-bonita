import { NextResponse } from "next/server";
import { getClipCredentials, getClipPaymentLink, getClipPinpadPayment } from "@/lib/clip";
import { reconcileClipPayment, reconcileClipPinpadPayment } from "@/lib/clip-payment-reconciliation";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHECKS_PER_RUN = 100;
const BATCH_SIZE = 5;
type PendingCheckout = { payment_preference_id: string; payment_expires_at: string | null };
type PendingPinpad = { pinpad_request_id: string };

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
      .from("clip_pinpad_attempts")
      .select("pinpad_request_id")
      .eq("status", "pending")
      .not("pinpad_request_id", "is", null)
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
    const pinpadResults = await Promise.all((pinpadAttempts ?? []).filter((attempt): attempt is PendingPinpad => Boolean(attempt.pinpad_request_id)).map(async (attempt) => {
      try {
        const payment = await getClipPinpadPayment(attempt.pinpad_request_id, credentials);
        return payment ? await reconcileClipPinpadPayment(payment) : "unavailable";
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
