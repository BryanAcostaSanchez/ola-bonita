"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Space = { id:string; active:boolean; slot_interval_minutes:number; booking_duration_minutes:number; capacity_per_slot:number; price_cents:number; deposit_enabled:boolean; deposit_percent:number };
type Hour = { id?:string; space_id:string; day_of_week:number; opens_at:string; closes_at:string; active:boolean };
type Reservation = { id:string; public_code:string; full_name:string; starts_at:string; status:string; payment_status:string };

const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const publicUrl = "https://olabonita.shop/cabina-masajes";

export function CabinSettings({ space, hours, reservations }: { space:Space|null; hours:Hour[]; reservations:Reservation[] }) {
  const [data, setData] = useState(space);
  const [schedule, setSchedule] = useState(hours.map((hour) => ({ ...hour, opens_at:hour.opens_at.slice(0, 5), closes_at:hour.closes_at.slice(0, 5) })));
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const db = createClient();

  async function copyPublicUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage(`Copia esta liga: ${publicUrl}`);
    }
  }

  async function save() {
    if (!data) return;
    setBusy(true);
    const { error } = await db.from("rental_spaces").update(data).eq("id", data.id);
    if (error) setMessage(error.message);
    else {
      const { error: hourError } = await db.from("rental_space_hours").upsert(schedule.map((hour) => ({ ...hour, space_id:data.id })), { onConflict:"space_id,day_of_week" });
      setMessage(hourError?.message || "Configuración de cabina guardada.");
    }
    setBusy(false);
  }

  async function cancel(id:string) {
    if (!window.confirm("¿Cancelar esta reserva de cabina?")) return;
    const { error } = await db.from("rental_reservations").update({ status:"cancelled" }).eq("id", id);
    setMessage(error?.message || "Reserva cancelada. Recarga para actualizar la agenda.");
  }

  if (!data) return <p>Configura la migración de cabina primero.</p>;

  return <>
    <header className="settings-header">
      <div><p className="eyebrow">RENTA DE CABINA</p><h1>Calendario de renta</h1><p>Gestiona esta página aparte del sitio público.</p></div>
      <Link href={publicUrl} className="new-booking">Abrir página pública</Link>
    </header>

    <section className="settings-card cabin-link-card">
      <div><p className="eyebrow">LIGA PRIVADA</p><h2>Comparte solo cuando quieras</h2><p>Esta ruta no aparece en la navegación pública del sitio.</p></div>
      <code>{publicUrl}</code>
      <button type="button" className="secondary-button" onClick={copyPublicUrl}>{copied ? "✓ Liga copiada" : "Copiar liga"}</button>
    </section>

    <section className="settings-card cabin-settings">
      <label className="switch-row"><span><strong>Publicar página de cabina</strong><small>Desactívala para ocultar nuevas reservas.</small></span><input type="checkbox" checked={data.active} onChange={(event) => setData({ ...data, active:event.target.checked })}/><i/></label>
      <div className="field-row">
        <label>Bloque<select value={data.slot_interval_minutes} onChange={(event) => setData({ ...data, slot_interval_minutes:Number(event.target.value) })}><option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option></select></label>
        <label>Duración<input type="number" min="15" step="15" value={data.booking_duration_minutes} onChange={(event) => setData({ ...data, booking_duration_minutes:Number(event.target.value) })}/></label>
        <label>Cupo<input type="number" min="1" value={data.capacity_per_slot} onChange={(event) => setData({ ...data, capacity_per_slot:Number(event.target.value) })}/></label>
        <label>Precio MXN<input inputMode="decimal" value={data.price_cents / 100} onChange={(event) => setData({ ...data, price_cents:Math.round(Number(event.target.value || 0) * 100) })}/></label>
      </div>
      <label className="switch-row"><span><strong>Pedir apartado en línea</strong><small>Usa Mercado Pago; sin apartado se confirma al instante.</small></span><input type="checkbox" checked={data.deposit_enabled} onChange={(event) => setData({ ...data, deposit_enabled:event.target.checked })}/><i/></label>
      <label>Porcentaje de apartado<input type="number" min="0" max="100" value={data.deposit_percent} onChange={(event) => setData({ ...data, deposit_percent:Number(event.target.value) })}/></label>
      <h2>Horario de la cabina</h2>
      <div className="hours-editor">{schedule.map((hour, index) => <div key={hour.day_of_week}><label><input type="checkbox" checked={hour.active} onChange={(event) => setSchedule((current) => current.map((value, position) => position === index ? { ...value, active:event.target.checked } : value))}/>{days[hour.day_of_week]}</label><input type="time" disabled={!hour.active} value={hour.opens_at} onChange={(event) => setSchedule((current) => current.map((value, position) => position === index ? { ...value, opens_at:event.target.value } : value))}/><span>—</span><input type="time" disabled={!hour.active} value={hour.closes_at} onChange={(event) => setSchedule((current) => current.map((value, position) => position === index ? { ...value, closes_at:event.target.value } : value))}/></div>)}</div>
      <button className="new-booking" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar configuración de cabina"}</button>
      {message && <p className="access-message">{message}</p>}
    </section>

    <section className="settings-card cabin-reservations"><h2>Próximas reservas</h2>{reservations.length ? reservations.map((reservation) => <div key={reservation.id} className="config-row"><span><strong>{reservation.full_name} · #{reservation.public_code}</strong><small>{new Intl.DateTimeFormat("es-MX", { dateStyle:"medium", timeStyle:"short", timeZone:"America/Mexico_City" }).format(new Date(reservation.starts_at))} · {reservation.status} · {reservation.payment_status}</small></span>{reservation.status !== "cancelled" && <button className="remove-member" onClick={() => cancel(reservation.id)}>Cancelar</button>}</div>) : <p className="empty-services">No hay próximas reservas.</p>}</section>
  </>;
}
