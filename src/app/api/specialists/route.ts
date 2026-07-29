import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const serviceId = request.nextUrl.searchParams.get("serviceId") || "";
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("get_bookable_specialists", { p_service_id: serviceId });
  if (error) return NextResponse.json({ error: "No pudimos consultar al equipo." }, { status: 500 });
  return NextResponse.json({ specialists: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
