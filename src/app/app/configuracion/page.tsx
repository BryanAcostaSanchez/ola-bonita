import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PaymentSettings } from "./payment-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/app/acceso");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["owner", "manager", "reception"].includes(profile.role)) redirect("/app");
  const [{ data: settings }, { data: integration }] = await Promise.all([supabase.from("business_settings").select("id, booking_deposit_enabled, booking_deposit_percent, payment_link_expires_minutes, allow_offline_checkout").limit(1).maybeSingle(), supabase.from("payment_integrations").select("public_key, mode, configured_at").eq("provider", "mercadopago").maybeSingle()]);
  return <main className="ops-shell"><aside className="sidebar"><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link><nav><Link href="/app">▦ <span>Agenda</span></Link><Link href="/app/equipo">♙ <span>Equipo</span></Link><a href="#ventas">◇ <span>Ventas</span></a><a href="#caja">▣ <span>Caja</span></a><a className="active" href="#pagos">⚙ <span>Configuración</span></a></nav><div className="sidebar-user"><span className="avatar">{profile.role.slice(0,2).toUpperCase()}</span><div><strong>Ola Bonita</strong><small>Configuración</small></div></div></aside><section className="ops-main settings-main"><PaymentSettings settings={settings} integration={integration} /></section></main>;
}
