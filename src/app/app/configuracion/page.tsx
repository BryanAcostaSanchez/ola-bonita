import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PaymentSettings } from "./payment-settings";
import { CatalogManager } from "./catalog-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/app/acceso");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["owner", "manager", "reception"].includes(profile.role)) redirect("/app");
  const [{ data: settings }, { data: integration }, { data: categories }, { data: services }, { data: products }] = await Promise.all([supabase.from("business_settings").select("id, booking_deposit_enabled, booking_deposit_percent, payment_link_expires_minutes, allow_offline_checkout, pos_payment_methods").limit(1).maybeSingle(), supabase.from("payment_integrations").select("public_key, mode, configured_at").eq("provider", "mercadopago").maybeSingle(), supabase.from("service_categories").select("id, name, slug, active, sort_order").order("sort_order"), supabase.from("services").select("id, category_id, name, description, duration_minutes, price_cents, active, online_bookable, sort_order").order("sort_order"), supabase.from("pos_products").select("id, name, sku, price_cents, stock_quantity, active").order("name")]);
  return <main className="ops-shell"><aside className="sidebar"><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link><nav><Link href="/app">▦ <span>Agenda</span></Link>{profile.role === "owner" && <Link href="/app/equipo">♙ <span>Equipo</span></Link>}<Link href="/app/operacion">◇ <span>Ventas y caja</span></Link><Link href="/app/finanzas">◔ <span>Finanzas</span></Link><Link href="/app/cabina">⚙ <span>Cabina</span></Link><Link className="active" href="/app/configuracion">⚙ <span>Configuración</span></Link></nav><div className="sidebar-user"><span className="avatar">{profile.role.slice(0,2).toUpperCase()}</span><div><strong>Ola Bonita</strong><small>Configuración</small></div></div></aside><section className="ops-main settings-main"><PaymentSettings settings={settings} integration={integration} /><CatalogManager categories={categories ?? []} services={services ?? []} products={products ?? []} /></section></main>;
}
