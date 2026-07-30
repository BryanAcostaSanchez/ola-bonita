import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PaymentSettings } from "./payment-settings";
import { CatalogManager } from "./catalog-manager";
import { WebAgendaSettings } from "./web-agenda-settings";
import { FinanceSettings } from "./finance-settings";
import { CabinSettings } from "../cabina/settings";
import { TeamManager } from "../equipo/team-manager";
import { SettingsShell } from "./settings-shell";

export const dynamic = "force-dynamic";

type SettingsSection = "agenda" | "equipo" | "pagos" | "catalogo" | "finanzas" | "cabina";

const sections: Array<{ id: SettingsSection; group: string; label: string; detail: string }> = [
  { id: "agenda", group: "RESERVAS", label: "Agenda web", detail: "Horarios y capacidad" },
  { id: "equipo", group: "OPERACIÓN", label: "Equipo y disponibilidad", detail: "Accesos, servicios y horarios" },
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
  const visibleSections = sections.filter((section) => {
    if (section.id === "equipo") return profile.role === "owner";
    return profile.role !== "reception" || section.id !== "cabina";
  });
  const activeSection = visibleSections.some((section) => section.id === query.seccion) ? query.seccion as SettingsSection : "agenda";
  const admin = createAdminClient();
  const [{ data: settings }, { data: integration }, { data: categories }, { data: services }, { data: products }, { data: businessHours }, { data: financeCategories }, { data: financeTags }, { data: cabinSpace }, { data: cabinHours }, { data: cabinReservations }, { data: members }, { data: assignments }, { data: specialistHours }, { data: authUsers }] = await Promise.all([supabase.from("business_settings").select("id, booking_deposit_enabled, booking_deposit_percent, payment_link_expires_minutes, allow_offline_checkout, pos_payment_methods, slot_interval_minutes, web_booking_capacity").limit(1).maybeSingle(), supabase.from("payment_integrations").select("public_key, mode, configured_at").eq("provider", "mercadopago").maybeSingle(), supabase.from("service_categories").select("id, name, slug, active, sort_order").order("sort_order"), supabase.from("services").select("id, category_id, name, description, duration_minutes, price_cents, active, online_bookable, sort_order").order("sort_order"), supabase.from("pos_products").select("id, name, sku, price_cents, stock_quantity, active").order("name"), supabase.from("business_hours").select("id, day_of_week, opens_at, closes_at, active").order("day_of_week"), supabase.from("finance_categories").select("id,name,color,active,sort_order").order("sort_order"), supabase.from("finance_tags").select("id,name,color,active,sort_order").order("sort_order"), admin.from("rental_spaces").select("*").eq("slug", "cabina-masajes").maybeSingle(), admin.from("rental_space_hours").select("*").order("day_of_week").order("opens_at"), admin.from("rental_reservations").select("id, public_code, full_name, starts_at, status, deposit_due_cents, payment_status").gte("starts_at", new Date().toISOString()).order("starts_at").limit(30), supabase.from("profiles").select("id, full_name, role, color, active").order("full_name"), supabase.from("specialist_services").select("specialist_id, service_id"), supabase.from("specialist_hours").select("specialist_id, day_of_week, starts_at, ends_at, active"), admin.auth.admin.listUsers({ page: 1, perPage: 1000 })]);
  const emails = new Map((authUsers?.users ?? []).map((authUser) => [authUser.id, authUser.email ?? ""]));
  const membersWithEmail = (members ?? []).map((member) => ({ ...member, email: emails.get(member.id) ?? "" }));
  const teamServices = (services ?? []).filter((service) => service.active).map((service) => ({ id: service.id, name: service.name, duration_minutes: service.duration_minutes, category: categories?.find((category) => category.id === service.category_id) ? { name: categories.find((category) => category.id === service.category_id)!.name } : null }));
  return <SettingsShell activeSection={activeSection} profileRole={profile.role} sections={visibleSections}>{activeSection === "agenda" && <WebAgendaSettings settings={settings} hours={businessHours ?? []}/>} {activeSection === "equipo" && profile.role === "owner" && <TeamManager initialMembers={membersWithEmail} services={teamServices} assignments={assignments ?? []} initialHours={specialistHours ?? []} />} {activeSection === "pagos" && <PaymentSettings settings={settings} integration={integration} />} {activeSection === "catalogo" && <CatalogManager categories={categories ?? []} services={services ?? []} products={products ?? []} />} {activeSection === "finanzas" && <FinanceSettings categories={financeCategories ?? []} tags={financeTags ?? []}/>} {activeSection === "cabina" && <CabinSettings space={cabinSpace} hours={cabinHours ?? []} reservations={cabinReservations ?? []}/>}</SettingsShell>;
}
