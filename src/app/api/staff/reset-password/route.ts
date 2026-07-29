import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });

  const { data: caller } = await supabase.from("profiles").select("role, active").eq("id", user.id).maybeSingle();
  if (caller?.role !== "owner" || !caller.active) {
    return NextResponse.json({ error: "Solo la administración puede restablecer accesos." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { memberId?: string } | null;
  if (!body?.memberId || !uuid.test(body.memberId)) {
    return NextResponse.json({ error: "La persona seleccionada no es válida." }, { status: 422 });
  }

  try {
    const admin = createAdminClient();
    const { data: member, error: memberError } = await admin.from("profiles").select("id, role, active").eq("id", body.memberId).maybeSingle();
    if (memberError) throw memberError;
    if (!member?.active || member.role === "owner") {
      return NextResponse.json({ error: "Esta persona no tiene un acceso de equipo que se pueda restablecer." }, { status: 422 });
    }

    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(member.id);
    if (authUserError) throw authUserError;
    if (!authUser.user?.email) return NextResponse.json({ error: "Este acceso no tiene correo registrado." }, { status: 422 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.olabonita.shop";
    const recoveryUrl = new URL("/auth/callback", appUrl);
    recoveryUrl.searchParams.set("next", "/app/acceso?flow=recovery");
    const { error } = await admin.auth.resetPasswordForEmail(authUser.user.email, { redirectTo: recoveryUrl.toString() });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No pudimos enviar el correo de restablecimiento.";
    return NextResponse.json({ error: message.includes("SUPABASE_SECRET_KEY") ? "Falta configurar la llave secreta de Supabase en el despliegue." : message }, { status: 500 });
  }
}
