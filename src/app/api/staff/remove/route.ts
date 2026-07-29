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
    return NextResponse.json({ error: "Solo la administración puede eliminar accesos." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { memberId?: string } | null;
  if (!body?.memberId || !uuid.test(body.memberId)) {
    return NextResponse.json({ error: "La persona seleccionada no es válida." }, { status: 422 });
  }
  if (body.memberId === user.id) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta de administración." }, { status: 422 });
  }

  try {
    const admin = createAdminClient();
    const { data: member, error: memberError } = await admin.from("profiles").select("id, role, active").eq("id", body.memberId).maybeSingle();
    if (memberError) throw memberError;
    if (!member?.active) return NextResponse.json({ error: "Esta persona ya no tiene acceso activo." }, { status: 422 });
    if (member.role === "owner") return NextResponse.json({ error: "La cuenta de administración no se puede eliminar." }, { status: 422 });

    // Conservamos citas, ventas y auditoría; al desactivar el perfil se bloquea el acceso y deja de aparecer en reservas.
    const { error } = await admin.from("profiles").update({ active: false }).eq("id", body.memberId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No pudimos eliminar a esta persona.";
    return NextResponse.json({ error: message.includes("SUPABASE_SECRET_KEY") ? "Falta configurar la llave secreta de Supabase en el despliegue." : message }, { status: 500 });
  }
}
