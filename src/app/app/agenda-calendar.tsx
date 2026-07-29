"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Specialist = { id:string; full_name:string; color:string|null };
type Booking = { id:string; specialist_id?:string|null; starts_at:string; ends_at:string; status:string; customer:{ full_name:string }|{ full_name:string }[]|null; service:{ name:string }|{ name:string }[]|null; specialist:{ full_name:string; color:string|null }|{ full_name:string; color:string|null }[]|null };
const tz = "America/Mexico_City";
const hours = Array.from({ length:10 }, (_, index) => index + 9);
const palette = ["#397c75", "#d9787b", "#7287b5", "#bd8b46", "#9877ad", "#4c9c8b"];
const one = <T,>(value:T|T[]|null) => Array.isArray(value) ? value[0] : value;
const dateKey = (date:Date) => new Intl.DateTimeFormat("en-CA", { timeZone:tz, year:"numeric", month:"2-digit", day:"2-digit" }).format(date);
const timeMinutes = (value:string) => { const parts = new Intl.DateTimeFormat("en-US", { timeZone:tz, hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(new Date(value)); const get = (type:string) => Number(parts.find((part) => part.type === type)?.value || 0); return get("hour") * 60 + get("minute"); };
const serviceColor = (name:string) => palette[[...name].reduce((total, char) => total + char.charCodeAt(0), 0) % palette.length];

export function AgendaCalendar({ initialDate, bookings, specialists, canAssign }: { initialDate:string; bookings:Booking[]; specialists:Specialist[]; canAssign:boolean }) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [view, setView] = useState<"team"|"general">("team");
  const [selectedBooking, setSelectedBooking] = useState<Booking|null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const days = useMemo(() => Array.from({ length:7 }, (_, index) => { const date = new Date(`${initialDate}T12:00:00-06:00`); date.setDate(date.getDate() + index); return { key:dateKey(date), label:new Intl.DateTimeFormat("es-MX", { weekday:"short", day:"numeric", timeZone:tz }).format(date) }; }), [initialDate]);
  const activeBookings = bookings.filter((booking) => !["cancelled", "no_show"].includes(booking.status));
  const visible = activeBookings.filter((booking) => dateKey(new Date(booking.starts_at)) === selectedDate);
  const columns = [...specialists, { id:"unassigned", full_name:"Por asignar", color:"#8da9a4" }];
  const db = createClient();
  const bookingInfo = (booking:Booking) => ({ customer:one(booking.customer), service:one(booking.service), assigned:one(booking.specialist) });
  async function assign(specialistId:string) { if (!selectedBooking || selectedBooking.id.startsWith("cabin-")) return; setSaving(true); const { error } = await db.from("bookings").update({ specialist_id:specialistId || null }).eq("id", selectedBooking.id); setSaving(false); if (error) setMessage(error.message); else { setMessage("Especialista asignada. Recarga la agenda para verla en su columna."); setSelectedBooking(null); } }
  const event = (booking:Booking, style:CSSProperties, compact=false) => { const { customer, service, assigned } = bookingInfo(booking); const color = assigned?.color || serviceColor(service?.name || "Agenda"); return <button type="button" className={`calendar-event ${compact ? "general-event" : ""}`} key={booking.id} onClick={() => setSelectedBooking(booking)} style={{ ...style, borderColor:color, backgroundColor:`${color}20` }}><strong>{customer?.full_name || "Cliente"}</strong><span>{service?.name || "Servicio"}</span>{assigned && <small>{assigned.full_name}</small>}</button>; };

  return <section className="agenda-section agenda-calendar" id="agenda">
    <div className="section-top calendar-title"><div><h2>Agenda</h2><p>{view === "team" ? "Vista por especialista y tipo de espacio." : "Vista general para coordinar y asignar el equipo."}</p></div><span className="calendar-live"><i/> En vivo</span></div>
    <div className="calendar-toolbar"><div className="calendar-views"><button type="button" className={view === "team" ? "active" : ""} onClick={() => setView("team")}>Por especialista</button><button type="button" className={view === "general" ? "active" : ""} onClick={() => setView("general")}>Vista general</button></div><span>{view === "team" ? `${visible.length} citas del día` : `${activeBookings.length} citas esta semana`}</span></div>
    <div className="calendar-days" role="tablist" aria-label="Selecciona un día">{days.map((day) => <button key={day.key} type="button" className={day.key === selectedDate ? "selected" : ""} onClick={() => { setSelectedDate(day.key); if (view === "general") setView("team"); }}><span>{day.key === initialDate ? "HOY" : day.label.split(" ")[0]}</span><strong>{day.label.split(" ").at(-1)}</strong></button>)}</div>
    {view === "team" ? <div className="calendar-scroll"><div className="calendar-grid" style={{ gridTemplateColumns:`58px repeat(${columns.length}, minmax(185px, 1fr))` }}><div className="calendar-corner">Hora</div>{columns.map((specialist) => <div className="calendar-specialist" key={specialist.id}><i style={{ background:specialist.color || "#8da9a4" }}/><span>{specialist.full_name}</span></div>)}<div className="calendar-times">{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>{columns.map((specialist) => <div className="calendar-column" key={specialist.id}>{hours.map((hour) => <div className="calendar-hour" key={hour}/>)}{visible.filter((booking) => one(booking.specialist)?.full_name === specialist.full_name || (!one(booking.specialist) && specialist.id === "unassigned")).map((booking) => { const start = timeMinutes(booking.starts_at); const end = timeMinutes(booking.ends_at); return event(booking, { top:Math.max(0, start - 540), height:Math.max(32, end - start) }); })}</div>)}</div></div> : <div className="calendar-scroll"><div className="general-calendar-grid"><div className="calendar-corner">Hora</div>{days.map((day) => <div className="general-day-head" key={day.key}>{day.label}</div>)}<div className="calendar-times">{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>{days.map((day) => <div className="calendar-column general-day-column" key={day.key}>{hours.map((hour) => <div className="calendar-hour" key={hour}/>)}{activeBookings.filter((booking) => dateKey(new Date(booking.starts_at)) === day.key).map((booking) => { const start = timeMinutes(booking.starts_at); const end = timeMinutes(booking.ends_at); return event(booking, { top:Math.max(0, start - 540), height:Math.max(34, end - start) }, true); })}</div>)}</div></div>}
    {selectedBooking && <section className="assignment-panel"><div>{(() => { const { customer, service, assigned } = bookingInfo(selectedBooking); return <><p className="eyebrow">CITA SELECCIONADA</p><h3>{customer?.full_name || "Cliente"}</h3><p>{service?.name || "Servicio"} · {new Intl.DateTimeFormat("es-MX", { weekday:"short", hour:"2-digit", minute:"2-digit", timeZone:tz }).format(new Date(selectedBooking.starts_at))}</p><small>{assigned ? `Asignada a ${assigned.full_name}` : "Sin especialista asignada"}</small></>; })()}</div>{canAssign && !selectedBooking.id.startsWith("cabin-") && <label>Asignar a<select defaultValue={selectedBooking.specialist_id || ""} disabled={saving} onChange={(event) => assign(event.target.value)}><option value="">Sin asignar</option>{specialists.map((specialist) => <option key={specialist.id} value={specialist.id}>{specialist.full_name}</option>)}</select></label>}<button type="button" className="secondary-button" onClick={() => setSelectedBooking(null)}>Cerrar</button></section>}
    {message && <p className="access-message">{message}</p>}
  </section>;
}
