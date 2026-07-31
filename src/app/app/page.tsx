import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { AgendaCalendar } from "./agenda-calendar";
import { SetupOwner } from "./setup-owner";

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
const mexicoTimezone = "America/Mexico_City";

function currentMexicoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: mexicoTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function currentMexicoDay() {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: mexicoTimezone,
    weekday: "short",
  }).format(new Date());
  return (
    { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<
      string,
      number
    >
  )[weekday];
}

export const dynamic = "force-dynamic";

export default async function AppDashboard() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/app/acceso");

  const [{ data: profile }, { data: ownerExists }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role, active")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.rpc("has_bootstrapped_owner"),
  ]);
  if (!ownerExists)
    return (
      <SetupOwner
        fullName={
          user.user_metadata.full_name || user.email?.split("@")[0] || ""
        }
      />
    );
  if (!profile?.active) redirect("/app/acceso?error=not-authorized");

  const date = currentMexicoDate();
  const dayOfWeek = currentMexicoDay();
  const dayStart = `${date}T00:00:00-06:00`;
  const dayEnd = `${date}T23:59:59.999-06:00`;
  const weekEnd = new Date(
    new Date(dayStart).getTime() + 7 * 86400000,
  ).toISOString();
  const [
    { data: bookings },
    { data: weekBookings },
    { data: cabinReservations },
    { data: sales },
    { data: cashSession },
    { data: specialists },
    { data: hours },
    { data: weeklySpecialistHours },
    { data: assignments },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, specialist_id, starts_at, ends_at, status, price_cents, deposit_due_cents, payment_status, commission_override_cents, commission_override_reason, customer:customers(full_name,phone,email), service:services(name), specialist:profiles(full_name, color), payments(amount_cents,status)",
      )
      .gte("starts_at", dayStart)
      .lte("starts_at", dayEnd)
      .order("starts_at"),
    supabase
      .from("bookings")
      .select(
        "id, specialist_id, starts_at, ends_at, status, price_cents, deposit_due_cents, payment_status, commission_override_cents, commission_override_reason, customer:customers(full_name,phone,email), service:services(name), specialist:profiles(full_name, color), payments(amount_cents,status)",
      )
      .gte("starts_at", dayStart)
      .lt("starts_at", weekEnd)
      .order("starts_at"),
    supabase
      .from("rental_reservations")
      .select("id, full_name, starts_at, ends_at, status")
      .gte("starts_at", dayStart)
      .lt("starts_at", weekEnd)
      .order("starts_at"),
    supabase
      .from("sales")
      .select("total_cents")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .eq("status", "completed"),
    supabase
      .from("cash_sessions")
      .select("id")
      .eq("status", "open")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, color")
      .eq("role", "specialist")
      .eq("active", true)
      .order("full_name"),
    supabase
      .from("specialist_hours")
      .select("specialist_id, starts_at, ends_at")
      .eq("day_of_week", dayOfWeek)
      .eq("active", true),
    supabase
      .from("specialist_hours")
      .select("specialist_id, day_of_week, starts_at, ends_at, active")
      .eq("active", true),
    supabase.from("specialist_services").select("specialist_id"),
  ]);

  const bookingCount = bookings?.length ?? 0;
  const salesTotal =
    sales?.reduce((sum, sale) => sum + sale.total_cents, 0) ?? 0;
  const specialistIdsWithServices = new Set(
    assignments?.map((assignment) => assignment.specialist_id) ?? [],
  );
  const specialistIdsWithHours = new Set(
    hours?.map((hour) => hour.specialist_id) ?? [],
  );
  const readySpecialists =
    specialists?.filter(
      (specialist) =>
        specialistIdsWithServices.has(specialist.id) &&
        specialistIdsWithHours.has(specialist.id),
    ) ?? [];
  const availableMinutes =
    hours?.reduce((sum, hour) => {
      const [startHour, startMinute] = hour.starts_at
        .slice(0, 5)
        .split(":")
        .map(Number);
      const [endHour, endMinute] = hour.ends_at
        .slice(0, 5)
        .split(":")
        .map(Number);
      return (
        sum +
        Math.max(0, endHour * 60 + endMinute - startHour * 60 - startMinute)
      );
    }, 0) ?? 0;
  const busyMinutes =
    bookings
      ?.filter((booking) => !["cancelled", "no_show"].includes(booking.status))
      .reduce(
        (sum, booking) =>
          sum +
          Math.max(
            0,
            (new Date(booking.ends_at).getTime() -
              new Date(booking.starts_at).getTime()) /
              60000,
          ),
        0,
      ) ?? 0;
  const occupancy = availableMinutes
    ? Math.min(100, Math.round((busyMinutes / availableMinutes) * 100))
    : null;
  const firstName = profile.full_name.split(" ")[0];
  const readyMessage = readySpecialists.length
    ? `${readySpecialists.length} especialista${readySpecialists.length === 1 ? "" : "s"} disponible${readySpecialists.length === 1 ? "" : "s"} hoy.`
    : specialists?.length
      ? "El equipo está agregado; asigna servicios y horario para abrir la agenda web."
      : "Agrega especialistas para abrir espacios de reserva.";
  const canManageCabin = ["owner", "manager"].includes(profile.role);
  const cabinAgenda = (cabinReservations ?? []).map((reservation) => ({
    id: `cabin-${reservation.id}`,
    starts_at: reservation.starts_at,
    ends_at: reservation.ends_at,
    status: reservation.status,
    price_cents: 0,
    deposit_due_cents: 0,
    payment_status: "unpaid",
    payments: [],
    customer: { full_name: reservation.full_name },
    service: { name: "Renta de cabina" },
    specialist: { full_name: "Cabina de masajes", color: "#d9787b" },
  }));
  const agendaSpecialists = [
    ...(specialists ?? []),
    { id: "massage-cabin", full_name: "Cabina de masajes", color: "#d9787b" },
  ];

  return (
    <main className="ops-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span>Ola</span> Bonita<small>BEAUTY SPA</small>
        </Link>
        <nav>
          <a className="active" href="#agenda">
            ▦ <span>Agenda</span>
          </a>
          <Link href="/app/operacion">
            ◇ <span>Ventas y caja</span>
          </Link>
          <Link href="/app/analitica">
            ◔ <span>Analítica</span>
          </Link>
          <Link href="/app/configuracion">
            ⚙ <span>Configuración</span>
          </Link>
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{firstName.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{profile.full_name}</strong>
            <small>
              {profile.role === "owner"
                ? "Administración"
                : "Equipo Ola Bonita"}
            </small>
          </div>
        </div>
      </aside>
      <section className="ops-main">
        <header className="ops-header">
          <div>
            <p className="eyebrow">PUNTO DE VENTA</p>
            <h1>
              Hola, {firstName} <span>✦</span>
            </h1>
          </div>
          <Link className="new-booking" href="/app/operacion">
            + Nueva venta
          </Link>
        </header>
        <section className="metric-grid">
          <article>
            <span>VENTAS DE HOY</span>
            <strong>{money.format(salesTotal)}</strong>
            <small>Ingresos registrados hoy</small>
          </article>
          <article>
            <span>CITAS DE HOY</span>
            <strong>{bookingCount}</strong>
            <small>
              {bookingCount
                ? "Agenda actualizada en tiempo real"
                : readyMessage}
            </small>
          </article>
          <article>
            <span>ESTADO DE CAJA</span>
            <strong>{cashSession ? "Abierta" : "Cerrada"}</strong>
            <small>
              {cashSession
                ? "Lista para cobros en efectivo"
                : "Ábrela desde Ventas y caja"}
            </small>
          </article>
          <article>
            <span>OCUPACIÓN</span>
            <strong>{occupancy === null ? "—" : `${occupancy}%`}</strong>
            <small>
              {occupancy === null
                ? readyMessage
                : `${Math.round(busyMinutes)} de ${availableMinutes} min disponibles`}
            </small>
          </article>
        </section>
        <AgendaCalendar
          initialDate={date}
          bookings={[...(weekBookings ?? []), ...cabinAgenda]}
          specialists={agendaSpecialists}
          specialistHours={weeklySpecialistHours ?? []}
          canAssign={["owner", "manager", "reception"].includes(profile.role)}
          canManageCompensation={profile.role === "owner"}
        />
        <section className="bottom-grid">
          <article className="today-card">
            <div className="section-top">
              <div>
                <h2>Operación</h2>
                <p>Accesos rápidos</p>
              </div>
            </div>
            <div className="summary-line">
              <Link href="/app/operacion">Registrar venta o gasto</Link>
              <strong>→</strong>
            </div>
            <div className="summary-line">
              <Link href="/app/operacion">Abrir o cerrar caja</Link>
              <strong>→</strong>
            </div>
            <div className="summary-line desktop-only">
              <Link href="/app/analitica">Ver resumen financiero</Link>
              <strong>→</strong>
            </div>
          </article>
          <article className="team-card">
            <div className="section-top">
              <div>
                <h2>Equipo de hoy</h2>
                <p>{specialists?.length ?? 0} especialistas activas</p>
              </div>
            </div>
            <p className="ops-note">
              {readySpecialists.length
                ? `Disponibles para reservas: ${readySpecialists.map((specialist) => specialist.full_name).join(", ")}.`
                : readyMessage}
            </p>
            {canManageCabin && (
              <Link
                className="cabin-dashboard-link desktop-only"
                href="/app/configuracion?seccion=cabina"
              >
                Administrar renta de cabina <span>→</span>
              </Link>
            )}
          </article>
        </section>
      </section>
    </main>
  );
}
