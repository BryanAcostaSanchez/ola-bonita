import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PaymentSettings } from "./payment-settings";
import { OnlinePaymentOptions } from "./online-payment-options";
import { UnpaidBookingOption } from "./unpaid-booking-option";
import { PaymentProviderSetup } from "./payment-provider-setup";
import { AccountSettings } from "./account-settings";
import { CatalogManager } from "./catalog-manager";
import { WebAgendaSettings } from "./web-agenda-settings";
import { CategoryBookingSettings } from "./category-booking-settings";
import { FinanceSettings } from "./finance-settings";
import { CabinSettings } from "../cabina/settings";
import { TeamManager } from "../equipo/team-manager";
import { SettingsShell } from "./settings-shell";

export const dynamic = "force-dynamic";

type SettingsSection =
  | "cuenta"
  | "agenda"
  | "nomina"
  | "pagos"
  | "catalogo"
  | "finanzas"
  | "cabina";

const sections: Array<{
  id: SettingsSection;
  group: string;
  label: string;
  detail: string;
}> = [
  {
    id: "cuenta",
    group: "NEGOCIO",
    label: "Cuenta y negocio",
    detail: "Datos generales y reservas",
  },
  {
    id: "agenda",
    group: "RESERVAS",
    label: "Agenda web",
    detail: "Horarios y capacidad",
  },
  {
    id: "nomina",
    group: "OPERACIÓN",
    label: "Equipo y nómina",
    detail: "Personal, horarios, comisiones y pagos",
  },
  {
    id: "pagos",
    group: "COBROS",
    label: "Pagos y Mercado Pago",
    detail: "Anticipos y métodos de cobro",
  },
  {
    id: "catalogo",
    group: "OPERACIÓN",
    label: "Catálogo y punto de venta",
    detail: "Servicios, productos y visibilidad",
  },
  {
    id: "finanzas",
    group: "FINANZAS",
    label: "Gastos y etiquetas",
    detail: "Categorías para analizar la operación",
  },
  {
    id: "cabina",
    group: "ESPACIOS",
    label: "Renta de cabina",
    detail: "Disponibilidad, apartados y reservas",
  },
];

export async function SettingsPageContent({ section }: { section: string }) {
  if (section === "personal") redirect("/app/configuracion/nomina");
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/app/acceso");
  const [{ data: profile }, { data: permissions }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_permissions"),
  ]);
  const granted: string[] = Array.isArray(permissions) ? permissions : [];
  if (
    !profile ||
    !granted.some(
      (permission) =>
        permission.startsWith("settings.") || permission === "team.manage",
    )
  )
    redirect("/app");
  const visibleSections = sections.filter((section) => {
    const required: Record<SettingsSection, string> = {
      cuenta: "settings.agenda",
      agenda: "settings.agenda",
      nomina: "team.manage",
      pagos: "settings.payments",
      catalogo: "settings.catalog",
      finanzas: "settings.finance",
      cabina: "settings.cabin",
    };
    return granted.includes(required[section.id]);
  });
  const activeSection = visibleSections.some((item) => item.id === section)
    ? (section as SettingsSection)
    : (visibleSections[0]?.id ?? "agenda");
  const admin = createAdminClient();
  const [
    { data: settings },
    { data: integration },
    { data: getnetIntegration },
    { data: categories },
    { data: services },
    { data: products },
    { data: businessHours },
    { data: categoryBookingRules },
    { data: categoryBookingHours },
    { data: financeCategories },
    { data: financeTags },
    { data: cabinSpace },
    { data: cabinSpaces },
    { data: cabinHours },
    { data: cabinReservations },
    { data: members },
    { data: assignments },
    { data: specialistHours },
    { data: compensations },
    { data: earnings },
    { data: externalPayments },
    { data: authUsers },
    { data: roleTemplates },
  ] = await Promise.all([
    supabase
      .from("business_settings")
      .select(
        "id, business_name, timezone, currency, booking_lead_time_minutes, booking_deposit_enabled, booking_deposit_percent, payment_link_expires_minutes, allow_offline_checkout, allow_booking_without_online_payment, web_payments_enabled, web_payment_provider, pos_payment_methods, slot_interval_minutes, web_booking_capacity, default_commission_percent, no_show_deposit_policy, no_show_reschedule_window_days, online_payment_options",
      )
      .limit(1)
      .maybeSingle(),
    supabase
      .from("payment_integrations")
      .select("public_key, mode, configured_at")
      .eq("provider", "mercadopago")
      .maybeSingle(),
    supabase
      .from("payment_integrations")
      .select("configured_at")
      .eq("provider", "getnet")
      .maybeSingle(),
    supabase
      .from("service_categories")
      .select("id, name, slug, active, sort_order")
      .order("sort_order"),
    supabase
      .from("services")
      .select(
        "id, category_id, name, description, duration_minutes, price_cents, active, online_bookable, sort_order",
      )
      .order("sort_order"),
    supabase
      .from("pos_products")
      .select("id, name, sku, price_cents, stock_quantity, active")
      .order("name"),
    supabase
      .from("business_hours")
      .select("id, day_of_week, opens_at, closes_at, active")
      .order("day_of_week"),
    supabase
      .from("category_booking_settings")
      .select(
        "category_id, custom_schedule_enabled, web_booking_capacity, rental_space_id",
      ),
    supabase
      .from("category_booking_hours")
      .select("category_id, day_of_week, opens_at, closes_at, active"),
    supabase
      .from("finance_categories")
      .select("id,name,color,active,sort_order")
      .order("sort_order"),
    supabase
      .from("finance_tags")
      .select("id,name,color,active,sort_order")
      .order("sort_order"),
    admin
      .from("rental_spaces")
      .select("*")
      .eq("slug", "cabina-masajes")
      .maybeSingle(),
    admin
      .from("rental_spaces")
      .select("id,name")
      .eq("active", true)
      .order("name"),
    admin
      .from("rental_space_hours")
      .select("*")
      .order("day_of_week")
      .order("opens_at"),
    admin
      .from("rental_reservations")
      .select(
        "id, public_code, full_name, starts_at, status, deposit_due_cents, payment_status",
      )
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(30),
    supabase
      .from("profiles")
      .select("id, full_name, role, color, active, permission_overrides")
      .order("full_name"),
    supabase
      .from("specialist_services")
      .select("specialist_id, service_id, commission_cents"),
    supabase
      .from("specialist_hours")
      .select("specialist_id, day_of_week, starts_at, ends_at, active"),
    supabase
      .from("specialist_compensation")
      .select(
        "specialist_id, scheme, frequency, fixed_amount_cents, commission_percent",
      ),
    supabase
      .from("specialist_earnings")
      .select("specialist_id, amount_cents, paid_at"),
    supabase
      .from("expenses")
      .select(
        "id, external_provider_name, description, amount_cents, payment_method, created_at",
      )
      .eq("category", "Comisión externa")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("role_permission_templates").select("role,permissions"),
  ]);
  void roleTemplates;
  const emails = new Map(
    (authUsers?.users ?? []).map((authUser) => [
      authUser.id,
      authUser.email ?? "",
    ]),
  );
  const membersWithEmail = (members ?? []).map((member) => ({
    ...member,
    email: emails.get(member.id) ?? "",
  }));
  const teamServices = (services ?? [])
    .filter((service) => service.active)
    .map((service) => ({
      id: service.id,
      name: service.name,
      duration_minutes: service.duration_minutes,
      category: categories?.find(
        (category) => category.id === service.category_id,
      )
        ? {
            name: categories.find(
              (category) => category.id === service.category_id,
            )!.name,
          }
        : null,
    }));
  return (
    <SettingsShell
      activeSection={activeSection}
      profileRole={profile.role}
      sections={visibleSections}
    >
      {activeSection === "cuenta" && <AccountSettings settings={settings} />} {" "}
      {activeSection === "agenda" && (
        <>
          <WebAgendaSettings settings={settings} hours={businessHours ?? []} />
          <CategoryBookingSettings
            categories={(categories ?? [])
              .filter((category) => category.active)
              .map((category) => ({ id: category.id, name: category.name }))}
            rules={categoryBookingRules ?? []}
            hours={categoryBookingHours ?? []}
            defaultHours={businessHours ?? []}
            rentalSpaces={cabinSpaces ?? []}
          />
        </>
      )}{" "}
      {activeSection === "nomina" && (
        <TeamManager
          mode="nomina"
          initialMembers={membersWithEmail}
          services={teamServices}
          assignments={assignments ?? []}
          initialHours={specialistHours ?? []}
          compensations={compensations ?? []}
          earnings={earnings ?? []}
          externalPayments={externalPayments ?? []}
          defaultCommissionPercent={settings?.default_commission_percent ?? 0}
        />
      )}{" "}
      {activeSection === "pagos" && (
        <><PaymentSettings settings={settings} integration={integration} /><PaymentProviderSetup settings={settings} getnetConfigured={Boolean(getnetIntegration?.configured_at)} /><OnlinePaymentOptions settings={settings} /><UnpaidBookingOption settings={settings} /></>
      )}{" "}
      {activeSection === "catalogo" && (
        <CatalogManager
          categories={categories ?? []}
          services={services ?? []}
          products={products ?? []}
        />
      )}{" "}
      {activeSection === "finanzas" && (
        <FinanceSettings
          categories={financeCategories ?? []}
          tags={financeTags ?? []}
        />
      )}{" "}
      {activeSection === "cabina" && (
        <CabinSettings
          space={cabinSpace}
          hours={cabinHours ?? []}
          reservations={cabinReservations ?? []}
        />
      )}
    </SettingsShell>
  );
}

export default function SettingsIndex() {
  redirect("/app/configuracion/agenda");
}
