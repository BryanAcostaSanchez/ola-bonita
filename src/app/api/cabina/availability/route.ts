import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
export async function GET(request: Request) { const date = new URL(request.url).searchParams.get("date"); if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Fecha inválida" }, { status: 422 }); const supabase = await createServerClient(); const { data, error } = await supabase.rpc("get_rental_slots", { p_slug: "cabina-masajes", p_date: date }); return NextResponse.json({ slots: data ?? [], error: error?.message }, { status: error ? 422 : 200 }); }
