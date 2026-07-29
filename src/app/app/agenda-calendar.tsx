"use client";

import { useMemo, useState } from "react";

type Specialist = { id:string; full_name:string; color:string | null };
type Booking = {
  id:string;
  starts_at:string;
  ends_at:string;
  status:string;
  customer:{ full_name:string } | { full_name:string }[] | null;
  service:{ name:string } | { name:string }[] | null;
  specialist:{ full_name:string; color:string | null } | { full_name:string; color:string | null }[] | null;
};

const tz = "America/Mexico_City";
const hours = Array.from({ length:10 }, (_, index) => index + 9);
const one = <T,>(value:T | T[] | null) => Array.isArray(value) ? value[0] : value;
const dateKey = (date:Date) => new Intl.DateTimeFormat("en-CA", { timeZone:tz, year:"numeric", month:"2-digit", day:"2-digit" }).format(date);
const timeMinutes = (value:string) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone:tz, hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(new Date(value));
  const get = (type:string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return get("hour") * 60 + get("minute");
};

export function AgendaCalendar({ initialDate, bookings, specialists }: { initialDate:string; bookings:Booking[]; specialists:Specialist[] }) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const days = useMemo(() => Array.from({ length:7 }, (_, index) => {
    const date = new Date(`${initialDate}T12:00:00-06:00`);
    date.setDate(date.getDate() + index);
    return { key:dateKey(date), label:new Intl.DateTimeFormat("es-MX", { weekday:"short", day:"numeric", timeZone:tz }).format(date) };
  }), [initialDate]);
  const visible = bookings.filter((booking) => dateKey(new Date(booking.starts_at)) === selectedDate && !["cancelled", "no_show"].includes(booking.status));
  const columns = specialists.length ? specialists : [{ id:"unassigned", full_name:"Por asignar", color:"#8da9a4" }];

  return <section className="agenda-section agenda-calendar" id="agenda">
    <div className="section-top calendar-title"><div><h2>Agenda</h2><p>{visible.length ? `${visible.length} cita${visible.length === 1 ? "" : "s"} programada${visible.length === 1 ? "" : "s"}` : "Sin citas programadas"}</p></div><span className="calendar-live"><i/> En vivo</span></div>
    <div className="calendar-days" role="tablist" aria-label="Selecciona un día">{days.map((day) => <button key={day.key} type="button" className={day.key === selectedDate ? "selected" : ""} onClick={() => setSelectedDate(day.key)}><span>{day.key === initialDate ? "HOY" : day.label.split(" ")[0]}</span><strong>{day.label.split(" ").at(-1)}</strong></button>)}</div>
    <div className="calendar-scroll"><div className="calendar-grid" style={{ gridTemplateColumns:`58px repeat(${columns.length}, minmax(185px, 1fr))` }}>
      <div className="calendar-corner">Hora</div>{columns.map((specialist) => <div className="calendar-specialist" key={specialist.id}><i style={{ background:specialist.color || "#8da9a4" }}/><span>{specialist.full_name}</span></div>)}
      <div className="calendar-times">{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>
      {columns.map((specialist) => <div className="calendar-column" key={specialist.id}>{hours.map((hour) => <div className="calendar-hour" key={hour}/>)}{visible.filter((booking) => one(booking.specialist)?.full_name === specialist.full_name || (!one(booking.specialist) && specialist.id === "unassigned")).map((booking) => {
        const customer = one(booking.customer); const service = one(booking.service); const assigned = one(booking.specialist);
        const start = timeMinutes(booking.starts_at); const end = timeMinutes(booking.ends_at); const top = Math.max(0, start - 9 * 60); const height = Math.max(32, end - start);
        return <article className="calendar-event" key={booking.id} style={{ top, height, borderColor:assigned?.color || specialist.color || "#8da9a4", backgroundColor:`${assigned?.color || specialist.color || "#8da9a4"}1c` }}><strong>{customer?.full_name || "Cliente"}</strong><span>{service?.name || "Servicio"}</span></article>;
      })}</div>)}
    </div></div>
    {!visible.length && <p className="calendar-empty">Toca otro día para revisar la agenda o crea una cita desde recepción.</p>}
  </section>;
}
