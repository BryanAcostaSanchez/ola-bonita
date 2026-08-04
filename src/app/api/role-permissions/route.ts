import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { isPermission, type Permission } from "@/lib/permissions";

const roles = ["manager", "reception", "specialist"] as const;
type ConfigurableRole = (typeof roles)[number];

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  const { data: caller } = await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (caller?.role !== "owner" || !caller.active) return NextResponse.json({ error: "Solo la administración puede ver permisos por rol." }, { status: 403 });
  const { data, error } = await createAdminClient().from("role_permission_templates").select("role,permissions");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
}

export async function PUT(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });

  const { data: caller } = await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (caller?.role !== "owner" || !caller.active) return NextResponse.json({ error: "Solo la administración puede cambiar permisos por rol." }, { status: 403 });

  const body = await request.json().catch(() => null) as { role?: ConfigurableRole; permissions?: unknown } | null;
  if (!body?.role || !roles.includes(body.role) || !Array.isArray(body.permissions) || !body.permissions.every(isPermission)) {
    return NextResponse.json({ error: "El rol o los permisos seleccionados no son válidos." }, { status: 422 });
  }

  const permissions = [...new Set(body.permissions)] as Permission[];
  const { error } = await createAdminClient().from("role_permission_templates").upsert({ role: body.role, permissions, updated_at: new Date().toISOString() }, { onConflict: "role" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ role: body.role, permissions });
}
