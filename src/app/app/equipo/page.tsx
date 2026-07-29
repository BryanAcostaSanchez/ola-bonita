import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { TeamManager } from "./team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/app/acceso");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (profile?.role !== "owner") redirect("/app");
  const [{ data: members }, { data: services }, { data: assignments }, { data: hours }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, color, active").order("full_name"),
    supabase.from("services").select("id, name, duration_minutes, category:service_categories(name)").eq("active", true).order("sort_order"),
    supabase.from("specialist_services").select("specialist_id, service_id"),
    supabase.from("specialist_hours").select("specialist_id, day_of_week, starts_at, ends_at, active"),
  ]);
  return <main className="ops-shell"><aside className="sidebar"><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link><nav><Link href="/app">▦ <span>Agenda</span></Link><Link className="active" href="/app/equipo">♙ <span>Equipo</span></Link><a href="#ventas">◇ <span>Ventas</span></a><a href="#caja">▣ <span>Caja</span></a><Link href="/app/configuracion">⚙ <span>Configuración</span></Link></nav><div className="sidebar-user"><span className="avatar">{profile.full_name.slice(0, 2).toUpperCase()}</span><div><strong>{profile.full_name}</strong><small>Administración</small></div></div></aside><section className="ops-main settings-main"><header className="settings-header"><div><p className="eyebrow">EQUIPO Y AGENDA</p><h1>Personas disponibles</h1><p>Controla accesos, servicios y horarios en un solo lugar.</p></div><Link className="new-booking" href="/app">Volver a agenda</Link></header><TeamManager initialMembers={members ?? []} services={services ?? []} assignments={assignments ?? []} initialHours={hours ?? []} /></section></main>;
}
