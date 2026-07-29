import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const serviceId = request.nextUrl.searchParams.get("serviceId") || "";
  const date = request.nextUrl.searchParams.get("date") || "";
  const specialistId = request.nextUrl.searchParams.get("specialistId") || null;
  if (!uuid.test(serviceId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (specialistId && !uuid.test(specialistId))) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 422 });
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("get_available_slots", { p_service_id: serviceId, p_date: date, p_specialist_id: specialistId });
  if (error) return NextResponse.json({ error: "No pudimos consultar los horarios." }, { status: 500 });
  return NextResponse.json({ slots: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
