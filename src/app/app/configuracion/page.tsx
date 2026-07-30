import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PaymentSettings } from "./payment-settings";
import { CatalogManager } from "./catalog-manager";
import { WebAgendaSettings } from "./web-agenda-settings";
import { FinanceSettings } from "./finance-settings";
import { CabinSettings } from "../cabina/settings";

export const dynamic = "force-dynamic";

type SettingsSection = "agenda" | "pagos" | "catalogo" | "finanzas" | "cabina";

const sections: Array<{ id: SettingsSection; group: string; label: string; detail: string }> = [
  { id: "agenda", group: "RESERVAS", label: "Agenda web", detail: "Horarios y capacidad" },
  { id: "pagos", group: "COBROS", label: "Pagos y Mercado Pago", detail: "Anticipos y métodos de cobro" },
  { id: "catalogo", group: "OPERACIÓN", label: "Catálogo y punto de venta", detail: "Servicios, productos y visibilidad" },
  { id: "finanzas", group: "FINANZAS", label: "Gastos y etiquetas", detail: "Categorías para analizar la operación" },
  { id: "cabina", group: "ESPACIOS", label: "Renta de cabina", detail: "Disponibilidad, apartados y reservas" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ seccion?: string }> }) {
  const query = await searchParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/app/acceso");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["owner", "manager", "reception"].includes(profile.role)) redirect("/app");
  const visibleSections = profile.role === "reception" ? sections.filter((section) => section.id !== "cabina") : sections;
  const activeSection = visibleSections.some((section) => section.id === query.seccion) ? query.seccion as SettingsSection : "agenda";
  const admin = createAdminClient();
  const [{ data: settings }, { data: integration }, { data: categories }, { data: services }, { data: products }, { data: businessHours }, { data: financeCategories }, { data: financeTags }, { data: cabinSpace }, { data: cabinHours }, { data: cabinReservations }] = await Promise.all([supabase.from("business_settings").select("id, booking_deposit_enabled, booking_deposit_percent, payment_link_expires_minutes, allow_offline_checkout, pos_payment_methods, slot_interval_minutes, web_booking_capacity").limit(1).maybeSingle(), supabase.from("payment_integrations").select("public_key, mode, configured_at").eq("provider", "mercadopago").maybeSingle(), supabase.from("service_categories").select("id, name, slug, active, sort_order").order("sort_order"), supabase.from("services").select("id, category_id, name, description, duration_minutes, price_cents, active, online_bookable, sort_order").order("sort_order"), supabase.from("pos_products").select("id, name, sku, price_cents, stock_quantity, active").order("name"), supabase.from("business_hours").select("id, day_of_week, opens_at, closes_at, active").order("day_of_week"), supabase.from("finance_categories").select("id,name,color,active,sort_order").order("sort_order"), supabase.from("finance_tags").select("id,name,color,active,sort_order").order("sort_order"), admin.from("rental_spaces").select("*").eq("slug", "cabina-masajes").maybeSingle(), admin.from("rental_space_hours").select("*").order("day_of_week").order("opens_at"), admin.from("rental_reservations").select("id, public_code, full_name, starts_at, status, deposit_due_cents, payment_status").gte("starts_at", new Date().toISOString()).order("starts_at").limit(30)]);
  return <main className="ops-shell"><aside className="sidebar"><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link><nav><Link href="/app">▦ <span>Agenda</span></Link><Link href="/app/equipo">♙ <span>Equipo</span></Link><Link href="/app/operacion">◇ <span>Ventas y caja</span></Link><Link href="/app/finanzas">◔ <span>Finanzas</span></Link><Link className="active" href="/app/configuracion">⚙ <span>Configuración</span></Link></nav><div className="sidebar-user"><span className="avatar">{profile.role.slice(0,2).toUpperCase()}</span><div><strong>Ola Bonita</strong><small>Configuración</small></div></div></aside><section className="ops-main settings-main"><div className="settings-workspace"><aside className="settings-sidebar"><div><p className="eyebrow">CONFIGURACIÓN</p><h2>Organiza tu negocio</h2><p>Cada área tiene sus propios ajustes.</p></div><nav>{visibleSections.map((section, index) => <div className="settings-nav-group" key={section.id}>{(index === 0 || visibleSections[index - 1].group !== section.group) && <span>{section.group}</span>}<Link href={`/app/configuracion?seccion=${section.id}`} className={activeSection === section.id ? "active" : ""}><strong>{section.label}</strong><small>{section.detail}</small></Link></div>)}</nav></aside><div className="settings-content">{activeSection === "agenda" && <WebAgendaSettings settings={settings} hours={businessHours ?? []}/>} {activeSection === "pagos" && <PaymentSettings settings={settings} integration={integration} />} {activeSection === "catalogo" && <CatalogManager categories={categories ?? []} services={services ?? []} products={products ?? []} />} {activeSection === "finanzas" && <FinanceSettings categories={financeCategories ?? []} tags={financeTags ?? []}/>} {activeSection === "cabina" && <CabinSettings space={cabinSpace} hours={cabinHours ?? []} reservations={cabinReservations ?? []}/>}</div></div></section></main>;
}
