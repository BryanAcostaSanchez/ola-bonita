import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { SetupOwner } from "./setup-owner";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function currentMexicoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export const dynamic = "force-dynamic";

export default async function AppDashboard() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/app/acceso");

  const [{ data: profile }, { data: ownerExists }] = await Promise.all([
    supabase.from("profiles").select("full_name, role, active").eq("id", user.id).maybeSingle(),
    supabase.rpc("has_bootstrapped_owner"),
  ]);

  if (!ownerExists) return <SetupOwner fullName={user.user_metadata.full_name || user.email?.split("@")[0] || ""} />;
  if (!profile?.active) redirect("/app/acceso?error=not-authorized");

  const date = currentMexicoDate();
  const dayStart = `${date}T00:00:00-06:00`;
  const dayEnd = `${date}T23:59:59.999-06:00`;
  const [{ data: bookings }, { data: sales }] = await Promise.all([
    supabase.from("bookings").select("id, starts_at, status, price_cents").gte("starts_at", dayStart).lte("starts_at", dayEnd).order("starts_at"),
    supabase.from("sales").select("total_cents").gte("created_at", dayStart).lte("created_at", dayEnd).eq("status", "completed"),
  ]);

  const bookingCount = bookings?.length ?? 0;
  const salesTotal = sales?.reduce((sum, sale) => sum + sale.total_cents, 0) ?? 0;
  const firstName = profile.full_name.split(" ")[0];

  return <main className="ops-shell"><aside className="sidebar"><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link><nav><a className="active" href="#agenda">▦ <span>Agenda</span></a>{profile.role === "owner" && <Link href="/app/equipo">♙ <span>Equipo</span></Link>}<a href="#ventas">◇ <span>Ventas</span></a><a href="#caja">▣ <span>Caja</span></a><a href="#finanzas">◔ <span>Finanzas</span></a><Link href="/app/configuracion">⚙ <span>Configuración</span></Link></nav><div className="sidebar-user"><span className="avatar">{firstName.slice(0, 2).toUpperCase()}</span><div><strong>{profile.full_name}</strong><small>{profile.role === "owner" ? "Administración" : "Equipo Ola Bonita"}</small></div></div></aside><section className="ops-main"><header className="ops-header"><div><p className="eyebrow">PUNTO DE VENTA</p><h1>Hola, {firstName} <span>✦</span></h1></div><div className="ops-header-actions"><Link className="new-booking" href="#agenda">+ Nueva cita</Link></div></header><section className="metric-grid"><article><span>VENTAS DE HOY</span><strong>{money.format(salesTotal)}</strong><small>Ingresos registrados hoy</small></article><article><span>CITAS DE HOY</span><strong>{bookingCount}</strong><small>{bookingCount ? "Agenda actualizada en tiempo real" : "Aún no hay citas registradas"}</small></article><article><span>ESTADO DE CAJA</span><strong>—</strong><small>Se habilita al abrir la caja</small></article><article><span>OCUPACIÓN</span><strong>—</strong><small>Configura al equipo para calcularla</small></article></section><section className="agenda-section" id="agenda"><div className="section-top"><div><h2>Agenda de hoy</h2><p>{bookingCount ? `${bookingCount} cita${bookingCount === 1 ? "" : "s"} en el calendario` : "Lista para recibir tu primera cita"}</p></div><div className="date-switch"><strong>Hoy</strong></div></div>{bookingCount ? <div className="agenda-list">{bookings?.map((booking) => <article className="agenda-row" key={booking.id}><time>{new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City", hour12: false }).format(new Date(booking.starts_at))}</time><span className="booking-dot mint" /><div className="booking-details"><strong>Cita #{booking.id.slice(0, 8).toUpperCase()}</strong><span>{booking.status}</span></div><span className="booking-status">{booking.status}</span></article>)}</div> : <div className="empty-agenda"><strong>Tu agenda está lista.</strong><span>Cuando agreguemos al equipo y sus servicios, aquí aparecerán las reservas web y las citas creadas desde recepción.</span>{profile.role === "owner" && <Link href="/app/equipo">Agregar equipo <span>→</span></Link>}</div>}</section><section className="bottom-grid"><article className="today-card"><div className="section-top"><div><h2>Siguiente paso</h2><p>Configuración inicial</p></div></div><div className="summary-line"><span>1. Agrega al equipo</span><strong>Pendiente</strong></div><div className="summary-line"><span>2. Asigna servicios y horarios</span><strong>Pendiente</strong></div><div className="summary-line"><span>3. Conecta Mercado Pago</span><strong>Pendiente</strong></div></article><article className="team-card"><div className="section-top"><div><h2>Datos protegidos</h2><p>Acceso por roles</p></div></div><p className="ops-note">Esta cuenta está autenticada con Supabase. Las ventas, caja, clientes y configuraciones no son accesibles desde el sitio público.</p></article></section></section></main>;
}
