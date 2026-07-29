import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { bookingId?:string; specialistId?:string } | null;
  if (!body?.bookingId || !body.specialistId) return NextResponse.json({ error:"Datos inválidos." }, { status:422 });
  const supabase = await createServerClient();
  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error:"Inicia sesión." }, { status:401 });
  const { error } = await supabase.rpc("assign_booking_specialist", { p_booking_id:body.bookingId, p_specialist_id:body.specialistId });
  return error ? NextResponse.json({ error:error.message }, { status:422 }) : NextResponse.json({ ok:true });
}
