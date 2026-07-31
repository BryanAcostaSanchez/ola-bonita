"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Space = { id:string; active:boolean; slot_interval_minutes:number; booking_duration_minutes:number; capacity_per_slot:number; price_cents:number; deposit_enabled:boolean; deposit_percent:number };
type Hour = { id?:string; space_id:string; day_of_week:number; opens_at:string; closes_at:string; active:boolean };
type Reservation = { id:string; public_code:string; full_name:string; starts_at:string; status:string; payment_status:string };
const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const publicUrl = "https://olabonita.shop/cabina-masajes";
const newRange = (day:number):Hour => ({ space_id:"", day_of_week:day, opens_at:"09:00", closes_at:"18:00", active:true });

export function CabinSettings({ space, hours, reservations }: { space:Space|null; hours:Hour[]; reservations:Reservation[] }) {
  const [data, setData] = useState(space);
  const [priceDraft, setPriceDraft] = useState(() => space ? String(space.price_cents / 100) : "");
  const [schedule, setSchedule] = useState(hours.map((hour) => ({ ...hour, opens_at:hour.opens_at.slice(0, 5), closes_at:hour.closes_at.slice(0, 5) })));
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const db = createClient();

  async function copyPublicUrl() { try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setMessage(`Copia esta liga: ${publicUrl}`); } }
  function updateRange(index:number, update:Partial<Hour>) { setSchedule((current) => current.map((item, position) => position === index ? { ...item, ...update } : item)); }
  function addRange(day:number) { setSchedule((current) => [...current, newRange(day)]); }
  function removeRange(index:number) { setSchedule((current) => current.filter((_, position) => position !== index)); }

  async function save() {
    if (!data) return;
    const price = Number(priceDraft.replace(",", "."));
    if (!Number.isFinite(price) || price < 0) { setMessage("Escribe un precio válido."); return; }
    setBusy(true); setMessage("");
    const spaceUpdate = { ...data, price_cents:Math.round(price * 100), slot_interval_minutes:data.booking_duration_minutes };
    const { error } = await db.rpc("save_rental_space_settings", { p_space_id:data.id, p_active:data.active, p_booking_duration_minutes:data.booking_duration_minutes, p_capacity_per_slot:data.capacity_per_slot, p_price_cents:spaceUpdate.price_cents, p_deposit_enabled:data.deposit_enabled, p_deposit_percent:data.deposit_percent, p_hours:schedule.map((hour) => ({ day_of_week:hour.day_of_week, opens_at:hour.opens_at, closes_at:hour.closes_at, active:hour.active })) });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setData(spaceUpdate); setPriceDraft(String(spaceUpdate.price_cents / 100)); setMessage("Disponibilidad de la cabina guardada.");
  }

  async function cancel(id:string) { if (!window.confirm("¿Cancelar esta reserva de cabina?")) return; const { error } = await db.from("rental_reservations").update({ status:"cancelled" }).eq("id", id); setMessage(error?.message || "Reserva cancelada. Recarga para actualizar la agenda."); }
  if (!data) return <p>Configura la migración de cabina primero.</p>;

  return <>
    <header className="settings-header"><div><p className="eyebrow">RENTA DE CABINA</p><h1>Calendario de renta</h1><p>Gestiona disponibilidad, pagos y reservas en un mismo lugar.</p></div><Link href={publicUrl} className="new-booking">Abrir página pública</Link></header>
    <section className="settings-card cabin-link-card"><div><p className="eyebrow">LIGA PRIVADA</p><h2>Comparte solo cuando quieras</h2><p>Esta ruta no aparece en la navegación pública del sitio.</p></div><code>{publicUrl}</code><button type="button" className="secondary-button" onClick={copyPublicUrl}>{copied ? "✓ Liga copiada" : "Copiar liga"}</button></section>
    <section className="settings-card cabin-settings">
      <label className="switch-row"><span><strong>Recibir reservas</strong><small>Apágalo temporalmente para ocultar la página pública.</small></span><input type="checkbox" checked={data.active} onChange={(event) => setData({ ...data, active:event.target.checked })}/><i/></label>
      <div className="cabin-core-fields"><label>Duración de cada reserva<select value={data.booking_duration_minutes} onChange={(event) => setData({ ...data, booking_duration_minutes:Number(event.target.value) })}><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">1 hora</option><option value="90">1 h 30 min</option><option value="120">2 horas</option></select><small>Los horarios se generan con esta duración.</small></label><label>Personas por horario<input type="number" min="1" max="20" value={data.capacity_per_slot} onChange={(event) => setData({ ...data, capacity_per_slot:Number(event.target.value) })}/><small>Normalmente 1 para una sola cabina.</small></label><label>Precio por reserva (MXN)<input inputMode="decimal" value={priceDraft} onChange={(event) => setPriceDraft(event.target.value)}/><small>Define el importe completo de la renta.</small></label></div>
      <label className="switch-row"><span><strong>Pedir apartado en línea</strong><small>Si se activa, el cliente paga el porcentaje definido por Mercado Pago.</small></span><input type="checkbox" checked={data.deposit_enabled} onChange={(event) => setData({ ...data, deposit_enabled:event.target.checked })}/><i/></label>
      {data.deposit_enabled && <label className="cabin-deposit-field">Porcentaje de apartado<input type="number" min="1" max="100" value={data.deposit_percent} onChange={(event) => setData({ ...data, deposit_percent:Number(event.target.value) })}/></label>}
      <div className="availability-heading"><div><p className="eyebrow">DISPONIBILIDAD SEMANAL</p><h2>Franjas de horario</h2><p>Agrega una o varias franjas por día, como 09:00–12:00 y 14:00–18:00.</p></div></div>
      <div className="cabin-ranges">{days.map((day, dayIndex) => { const ranges = schedule.map((range, index) => ({ range, index })).filter(({ range }) => range.day_of_week === dayIndex); return <div className="cabin-day" key={day}><div className="cabin-day-name"><strong>{day}</strong><small>{ranges.length ? `${ranges.length} franja${ranges.length === 1 ? "" : "s"}` : "No disponible"}</small></div><div className="cabin-day-ranges">{ranges.map(({ range, index }) => <div className="cabin-range" key={range.id || `${dayIndex}-${index}`}><input type="time" value={range.opens_at} onChange={(event) => updateRange(index, { opens_at:event.target.value })}/><span>—</span><input type="time" value={range.closes_at} onChange={(event) => updateRange(index, { closes_at:event.target.value })}/><button type="button" aria-label={`Eliminar franja de ${day}`} onClick={() => removeRange(index)}>×</button></div>)}<button type="button" className="add-range" onClick={() => addRange(dayIndex)}>+ Agregar franja</button></div></div>; })}</div>
      <button className="new-booking" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar disponibilidad"}</button>{message && <p className="access-message">{message}</p>}
    </section>
    <section className="settings-card cabin-reservations"><h2>Próximas reservas</h2>{reservations.length ? reservations.map((reservation) => <div key={reservation.id} className="config-row"><span><strong>{reservation.full_name} · #{reservation.public_code}</strong><small>{new Intl.DateTimeFormat("es-MX", { dateStyle:"medium", timeStyle:"short", timeZone:"America/Mexico_City" }).format(new Date(reservation.starts_at))} · {reservation.status} · {reservation.payment_status}</small></span>{reservation.status !== "cancelled" && <button className="remove-member" onClick={() => cancel(reservation.id)}>Cancelar</button>}</div>) : <p className="empty-services">No hay próximas reservas.</p>}</section>
  </>;
}
