import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.serviceId !== "string" || typeof body.specialistId !== "string" || typeof body.startsAt !== "string" || typeof body.fullName !== "string" || typeof body.phone !== "string") {
    return NextResponse.json({ error: "Completa los datos de la reserva." }, { status: 422 });
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_public_booking", {
    p_service_id: body.serviceId,
    p_specialist_id: body.specialistId,
    p_starts_at: body.startsAt,
    p_full_name: body.fullName,
    p_phone: body.phone,
    p_email: typeof body.email === "string" ? body.email : null,
    p_notes: typeof body.notes === "string" ? body.notes : null,
  });
  if (error) return NextResponse.json({ error: error.message.includes("just booked") ? "Ese horario acaba de ocuparse. Elige otro." : "No pudimos crear la reserva." }, { status: 422 });
  return NextResponse.json({ booking: data?.[0] }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
