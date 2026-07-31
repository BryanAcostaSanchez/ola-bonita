"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Hint } from "./hint";

type Settings = { id:string; slot_interval_minutes:number; web_booking_capacity:number } | null;
type Hour = { id:string; day_of_week:number; opens_at:string; closes_at:string; active:boolean };
const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const fallback = [{ day_of_week:0, opens_at:"10:00", closes_at:"16:00", active:true }, { day_of_week:1, opens_at:"09:00", closes_at:"18:00", active:true }, { day_of_week:2, opens_at:"09:00", closes_at:"18:00", active:true }, { day_of_week:3, opens_at:"09:00", closes_at:"18:00", active:true }, { day_of_week:4, opens_at:"09:00", closes_at:"18:00", active:true }, { day_of_week:5, opens_at:"09:00", closes_at:"18:00", active:true }, { day_of_week:6, opens_at:"10:00", closes_at:"16:00", active:true }];

export function WebAgendaSettings({ settings, hours }: { settings:Settings; hours:Hour[] }) {
  const [interval, setInterval] = useState(settings?.slot_interval_minutes ?? 30);
  const [capacity, setCapacity] = useState(settings?.web_booking_capacity ?? 10);
  const [schedule, setSchedule] = useState((hours.length ? hours : fallback).map((hour) => ({ ...hour, opens_at:hour.opens_at.slice(0, 5), closes_at:hour.closes_at.slice(0, 5) })));
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const db = createClient(); const router = useRouter();
  async function save() { if (!settings) return; setBusy(true); setMessage(""); const { error } = await db.rpc("save_web_booking_settings", { p_slot_interval_minutes:interval, p_web_booking_capacity:capacity, p_hours:schedule.map((hour) => ({ day_of_week:hour.day_of_week, opens_at:hour.opens_at, closes_at:hour.closes_at, active:hour.active })) }); setBusy(false); if (error) return setMessage(error.message); setMessage("Agenda web guardada. Los nuevos horarios ya están disponibles para reservar en el sitio web."); router.refresh(); }
  return <section className="settings-card web-agenda-settings"><div><p className="eyebrow">AGENDA WEB</p><h2>Disponibilidad para reservas</h2><p>Este horario es independiente del equipo. Define cuándo puede reservar la gente en olabonita.shop.</p></div><div className="web-agenda-fields"><label>Separación entre horarios <Hint text="Distancia entre horas disponibles." /><select value={interval} onChange={(event) => setInterval(Number(event.target.value))}><option value="15">Cada 15 min</option><option value="30">Cada 30 min</option><option value="60">Cada hora</option></select></label><label>Máximo de reservas simultáneas <Hint text="Límite de citas por horario." /><input type="number" min="1" max="50" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))}/></label></div><div className="web-agenda-days">{schedule.map((hour, index) => <div key={hour.day_of_week}><label><input type="checkbox" checked={hour.active} onChange={(event) => setSchedule((current) => current.map((item, position) => position === index ? { ...item, active:event.target.checked } : item))}/><strong>{days[hour.day_of_week]}</strong><Hint text="Activa reservas este día." /></label><input type="time" disabled={!hour.active} value={hour.opens_at} onChange={(event) => setSchedule((current) => current.map((item, position) => position === index ? { ...item, opens_at:event.target.value } : item))}/><span>—</span><input type="time" disabled={!hour.active} value={hour.closes_at} onChange={(event) => setSchedule((current) => current.map((item, position) => position === index ? { ...item, closes_at:event.target.value } : item))}/></div>)}</div><button type="button" className="new-booking" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar agenda web"}</button>{message && <p className="access-message">{message}</p>}</section>;
}
