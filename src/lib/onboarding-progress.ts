import { createServerClient } from "@/lib/supabase/server";
import {
  ONBOARDING_STEPS,
  type OnboardingStep,
  type OnboardingStepId,
  type OnboardingStepState,
} from "@/lib/onboarding";

export type OnboardingStepStatus = {
  step: OnboardingStep;
  /** Estado efectivo: lo que la dueña marcó, o lo que la app detectó. */
  state: OnboardingStepState;
  /** Lo que la dueña guardó a mano, si lo hizo. */
  marked: OnboardingStepState | null;
  /** La app encontró una señal real de que el paso ya quedó. */
  detected: boolean;
  /** Resumen de cómo está configurado hoy. */
  detail: string;
};

export type OnboardingProgress = {
  steps: OnboardingStepStatus[];
  done: number;
  total: number;
  /** El siguiente paso pendiente, si queda alguno. */
  next: OnboardingStepStatus | null;
  complete: boolean;
  dismissed: boolean;
};

const dayNames = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

function count(label: string, total: number, plural: string, singular: string) {
  return `${total} ${total === 1 ? singular : plural}${label}`;
}

/**
 * Lee la configuración real del negocio para saber qué pasos ya están
 * resueltos. Los pasos cuyo contenido viene precargado (catálogo, horarios,
 * categorías de gasto) no se pueden detectar: ahí mostramos cómo están hoy y
 * la dueña confirma que ya los revisó.
 */
export async function loadOnboardingProgress(
  granted: string[],
  options: { onlyIfVisible?: boolean } = {},
): Promise<OnboardingProgress | null> {
  const visibleSteps = ONBOARDING_STEPS.filter((step) =>
    granted.includes(step.permission),
  );
  if (!visibleSteps.length) return null;

  const supabase = await createServerClient();
  const { data: settings } = await supabase
    .from("business_settings")
    .select(
      "business_name, timezone, currency, booking_lead_time_minutes, booking_deposit_enabled, booking_deposit_percent, pos_payment_methods, slot_interval_minutes, web_booking_capacity, onboarding_step_states, onboarding_dismissed_at",
    )
    .limit(1)
    .maybeSingle();
  if (!settings) return null;
  // La agenda sólo necesita el recordatorio: si ya lo ocultaron, no vale la
  // pena leer el resto de la configuración en cada carga.
  if (options.onlyIfVisible && settings.onboarding_dismissed_at) return null;

  const [
    { data: businessHours },
    { data: categories },
    { data: services },
    { data: products },
    { data: members },
    { data: assignments },
    { data: specialistHours },
    { data: integration },
    { data: financeCategories },
    { data: financeTags },
    { data: cabinSpace },
    { data: cabinHours },
  ] = await Promise.all([
    supabase.from("business_hours").select("day_of_week, active"),
    supabase.from("service_categories").select("id, active"),
    supabase.from("services").select("id, active, online_bookable"),
    supabase.from("pos_products").select("id, active"),
    supabase.from("profiles").select("id, role, active"),
    supabase.from("specialist_services").select("specialist_id"),
    supabase.from("specialist_hours").select("specialist_id, active"),
    supabase
      .from("payment_integrations")
      .select("mode, configured_at")
      .eq("provider", "clip")
      .maybeSingle(),
    supabase.from("finance_categories").select("id, active"),
    supabase.from("finance_tags").select("id, active"),
    supabase
      .from("rental_spaces")
      .select("id, active, price_cents")
      .eq("slug", "cabina-masajes")
      .maybeSingle(),
    supabase.from("rental_space_hours").select("space_id, active"),
  ]);

  const openDays = (businessHours ?? []).filter((hour) => hour.active);
  const activeServices = (services ?? []).filter((service) => service.active);
  const bookableServices = activeServices.filter(
    (service) => service.online_bookable,
  );
  const activeMembers = (members ?? []).filter((member) => member.active);
  const staff = activeMembers.filter((member) => member.role !== "owner");
  const withServices = new Set(
    (assignments ?? []).map((assignment) => assignment.specialist_id),
  );
  const withHours = new Set(
    (specialistHours ?? [])
      .filter((hour) => hour.active)
      .map((hour) => hour.specialist_id),
  );
  const ready = activeMembers.filter(
    (member) => withServices.has(member.id) && withHours.has(member.id),
  );
  const posMethods = Array.isArray(settings.pos_payment_methods)
    ? settings.pos_payment_methods
    : [];
  const clipConnected = Boolean(integration?.configured_at);
  const cabinOpenDays = (cabinHours ?? []).filter(
    (hour) => hour.active && hour.space_id === cabinSpace?.id,
  );

  const leadMinutes = settings.booking_lead_time_minutes ?? 0;
  const leadLabel = !leadMinutes
    ? "sin anticipación mínima"
    : leadMinutes % 60 === 0
      ? count(" de anticipación", leadMinutes / 60, "horas", "hora")
      : count(" de anticipación", leadMinutes, "minutos", "minuto");
  const details: Record<OnboardingStepId, string> = {
    cuenta: `${settings.business_name} · ${settings.timezone} · ${settings.currency} · ${leadLabel}`,
    agenda: openDays.length
      ? `${count(" abiertos", openDays.length, "días", "día")}: ${openDays
          .map((hour) => dayNames[hour.day_of_week])
          .join(", ")} · horarios cada ${settings.slot_interval_minutes} min · hasta ${count(
          " a la vez",
          settings.web_booking_capacity ?? 1,
          "reservas",
          "reserva",
        )}`
      : "Ningún día abierto: hoy nadie puede reservar en línea",
    catalogo: `${count("", (categories ?? []).filter((category) => category.active).length, "categorías", "categoría")} · ${count(
      " activos",
      activeServices.length,
      "servicios",
      "servicio",
    )}, ${bookableServices.length} reservables en línea · ${count(
      "",
      (products ?? []).filter((product) => product.active).length,
      "productos",
      "producto",
    )}`,
    equipo: staff.length
      ? `${count("", activeMembers.length, "personas", "persona")} con acceso · ${ready.length} con servicios y horario listos`
      : "Todavía nadie más tiene acceso",
    pagos: `${clipConnected ? `Clip conectado (${integration?.mode === "production" ? "producción" : "pruebas"})` : "Clip sin conectar"} · ${
      settings.booking_deposit_enabled
        ? `anticipo del ${settings.booking_deposit_percent}%`
        : "sin anticipo en línea"
    } · ${count(" en el mostrador", posMethods.length, "métodos", "método")}`,
    finanzas: `${count(
      " de gasto",
      (financeCategories ?? []).filter((category) => category.active).length,
      "categorías",
      "categoría",
    )} · ${count("", (financeTags ?? []).filter((tag) => tag.active).length, "etiquetas", "etiqueta")}`,
    cabina: cabinSpace
      ? `${cabinSpace.active ? "Espacio activo" : "Espacio apagado"} · ${count(
          " con horario",
          cabinOpenDays.length,
          "días",
          "día",
        )} · ${cabinSpace.price_cents ? `$${(cabinSpace.price_cents / 100).toLocaleString("es-MX")} por hora` : "sin precio definido"}`
      : "El espacio de cabina todavía no existe",
  };

  const detected: Record<OnboardingStepId, boolean> = {
    cuenta: false,
    agenda: false,
    catalogo: false,
    equipo: staff.length > 0 && ready.length > 0,
    pagos: clipConnected && posMethods.length > 0,
    finanzas: false,
    cabina: Boolean(
      cabinSpace?.active && cabinOpenDays.length > 0 && cabinSpace.price_cents,
    ),
  };

  const stored =
    settings.onboarding_step_states &&
    typeof settings.onboarding_step_states === "object"
      ? (settings.onboarding_step_states as Record<string, unknown>)
      : {};

  const steps = visibleSteps.map((step) => {
    const raw = stored[step.id];
    const marked =
      raw === "done" || raw === "skipped" ? (raw as OnboardingStepState) : null;
    const state: OnboardingStepState =
      marked ?? (detected[step.id] ? "done" : "pending");
    return {
      step,
      state,
      marked,
      detected: detected[step.id],
      detail: details[step.id],
    };
  });

  const counted = steps.filter((status) => status.state !== "skipped");
  const done = counted.filter((status) => status.state === "done").length;
  return {
    steps,
    done,
    total: counted.length,
    next: steps.find((status) => status.state === "pending") ?? null,
    complete: counted.length > 0 && done === counted.length,
    dismissed: Boolean(settings.onboarding_dismissed_at),
  };
}
