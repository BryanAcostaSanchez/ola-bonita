import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { isPermission, type Permission } from "@/lib/permissions";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PUT(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  const { data: caller } = await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (caller?.role !== "owner" || !caller.active) return NextResponse.json({ error: "Solo la administración puede cambiar permisos." }, { status: 403 });

  const body = await request.json().catch(() => null) as { memberId?: string; permissions?: unknown } | null;
  if (!body?.memberId || !uuid.test(body.memberId) || !Array.isArray(body.permissions) || !body.permissions.every(isPermission)) {
    return NextResponse.json({ error: "Los permisos seleccionados no son válidos." }, { status: 422 });
  }
  if (body.memberId === user.id) return NextResponse.json({ error: "La cuenta de administración conserva todos los permisos." }, { status: 422 });
  const permissions = [...new Set(body.permissions)] as Permission[];
  const admin = createAdminClient();
  const { data: member, error: memberError } = await admin.from("profiles").select("role,active").eq("id", body.memberId).maybeSingle();
  if (memberError || !member?.active || member.role === "owner") return NextResponse.json({ error: "No se puede actualizar este acceso." }, { status: 422 });
  const { error } = await admin.from("profiles").update({ permission_overrides: permissions }).eq("id", body.memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ permissions });
}
