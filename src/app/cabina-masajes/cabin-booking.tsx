"use client";

import { useEffect, useMemo, useState } from "react";

type Slot = { starts_at:string; ends_at:string; remaining_capacity:number };
const tz = "America/Mexico_City";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone:tz, year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
const keyFor = (date:Date) => new Intl.DateTimeFormat("en-CA", { timeZone:tz, year:"numeric", month:"2-digit", day:"2-digit" }).format(date);

export function CabinBooking({ priceCents, depositEnabled, depositPercent }: { priceCents:number; depositEnabled:boolean; depositPercent:number }) {
  const [date, setDate] = useState("");
  const [month, setMonth] = useState(() => new Date(`${today()}T12:00:00-06:00`));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({ fullName:"", phone:"", email:"" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
    return Array.from({ length:first.getDay() + last.getDate() }, (_, index) => index < first.getDay() ? null : new Date(month.getFullYear(), month.getMonth(), index - first.getDay() + 1, 12));
  }, [month]);
  const minDate = today();

  useEffect(() => {
    if (!date) return;
    fetch(`/api/cabina/availability?date=${date}`).then((response) => response.json()).then((data) => setSlots(data.slots || [])).catch(() => setSlots([]));
  }, [date]);

  function chooseDate(value:string) { setSlots([]); setDate(value); setSelected(""); setMessage(""); }
  async function reserve() {
    if (!date) return setMessage("Primero selecciona una fecha.");
    if (!selected || !form.fullName || !form.phone) return setMessage("Elige un horario y completa tus datos.");
    setBusy(true);
    const response = await fetch("/api/cabina/reservations", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ ...form, startsAt:selected }) });
    const result = await response.json();
    if (response.ok && result.checkout_url) window.location.assign(result.checkout_url);
    else setMessage(response.ok ? `Reserva confirmada. Código: ${result.reservation.public_code}` : result.error);
    setBusy(false);
  }

  const deposit = Math.round(priceCents * depositPercent / 100);
  const monthName = new Intl.DateTimeFormat("es-MX", { month:"long", year:"numeric" }).format(month);
  return <div className="cabin-booking calendly-booking">
    <div className="booking-step"><span>1</span><div><strong>Elige una fecha</strong><small>Después verás los horarios disponibles.</small></div></div>
    <div className="cabin-calendar"><div className="cabin-calendar-nav"><button type="button" aria-label="Mes anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}>←</button><strong>{monthName}</strong><button type="button" aria-label="Mes siguiente" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}>→</button></div><div className="calendar-weekdays">{["D", "L", "M", "M", "J", "V", "S"].map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div><div className="cabin-calendar-days">{days.map((day, index) => day ? <button key={keyFor(day)} type="button" disabled={keyFor(day) < minDate} className={date === keyFor(day) ? "selected" : ""} onClick={() => chooseDate(keyFor(day))}>{day.getDate()}</button> : <i key={`empty-${index}`}/>)}</div></div>
    {date && <><div className="booking-step"><span>2</span><div><strong>Elige un horario</strong><small>{new Intl.DateTimeFormat("es-MX", { weekday:"long", day:"numeric", month:"long", timeZone:tz }).format(new Date(`${date}T12:00:00-06:00`))}</small></div></div><div className="cabin-slots">{slots.length ? slots.map((slot) => <button type="button" className={selected === slot.starts_at ? "selected" : ""} onClick={() => setSelected(slot.starts_at)} key={slot.starts_at}>{new Intl.DateTimeFormat("es-MX", { hour:"2-digit", minute:"2-digit", timeZone:tz }).format(new Date(slot.starts_at))}</button>) : <p>Estamos revisando los horarios disponibles…</p>}</div></>}
    {selected && <>
      <div className="booking-step"><span>3</span><div><strong>Confirma tus datos</strong><small>Te enviaremos la confirmación a este contacto.</small></div></div>
      <label>Nombre completo<input placeholder="Tu nombre" value={form.fullName} onChange={(event) => setForm({ ...form, fullName:event.target.value })}/></label>
      <label>Teléfono<input placeholder="Tu teléfono" value={form.phone} onChange={(event) => setForm({ ...form, phone:event.target.value })}/></label>
      <label>Correo (opcional)<input placeholder="correo@ejemplo.com" value={form.email} onChange={(event) => setForm({ ...form, email:event.target.value })}/></label>
    </>}
    {depositEnabled && <p className="deposit-note">Al confirmar pagarás un apartado de ${(deposit / 100).toFixed(0)} MXN por Mercado Pago.</p>}
    {selected && <button className="button" disabled={busy} onClick={reserve}>{busy ? "Reservando…" : depositEnabled ? "Continuar a pago" : "Confirmar reserva"}</button>}
    {message && <p className="access-message">{message}</p>}
  </div>;
}
