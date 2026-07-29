import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

const roles = ["manager", "reception", "specialist"] as const;
type StaffRole = (typeof roles)[number];

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });

  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (caller?.role !== "owner") return NextResponse.json({ error: "Solo la administración puede invitar al equipo." }, { status: 403 });

  const body = await request.json().catch(() => null) as { fullName?: string; email?: string; role?: StaffRole } | null;
  const fullName = body?.fullName?.trim();
  const email = body?.email?.trim().toLowerCase();
  if (!fullName || !email || !body?.role || !roles.includes(body.role)) {
    return NextResponse.json({ error: "Nombre, correo y rol son obligatorios." }, { status: 422 });
  }

  try {
    const admin = createAdminClient();
    const { count, error: countError } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("active", true);
    if (countError) throw countError;
    if ((count ?? 0) >= 10) return NextResponse.json({ error: "El equipo ya alcanzó el límite de 10 accesos activos." }, { status: 422 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.olabonita.shop";
    const activationUrl = new URL("/auth/callback", appUrl);
    activationUrl.searchParams.set("next", "/app/acceso?flow=invite");
    const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: activationUrl.toString(),
    });
    if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 422 });

    const { error: profileError } = await admin.from("profiles").update({ full_name: fullName, role: body.role, active: true }).eq("id", data.user.id);
    if (profileError) throw profileError;
    return NextResponse.json({ id: data.user.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No pudimos enviar la invitación.";
    const status = message.includes("SUPABASE_SECRET_KEY") ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? "Falta configurar la llave secreta de Supabase en el despliegue." : message }, { status });
  }
}
