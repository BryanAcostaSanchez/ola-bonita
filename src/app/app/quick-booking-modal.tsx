"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Specialist = { id: string; full_name: string };
type Service = { id: string; name: string };

export function QuickBookingModal({ slot, specialists, services, onClose }: { slot: { date: string; time: string; specialistId: string | null }; specialists: Specialist[]; services: Service[]; onClose: () => void }) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [specialistId, setSpecialistId] = useState(slot.specialistId ?? "");
  const [fullName, setFullName] = useState(""); const [phone, setPhone] = useState(""); const [notes, setNotes] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setMessage(""); const { error } = await createClient().rpc("create_staff_booking", { p_service_id: serviceId, p_specialist_id: specialistId || null, p_starts_at: new Date(`${slot.date}T${slot.time}:00-06:00`).toISOString(), p_full_name: fullName, p_phone: phone, p_notes: notes || null }); setBusy(false); if (error) { setMessage(error.message); return; } window.location.reload(); }
  return <div className="cash-modal-backdrop" role="presentation"><section className="cash-modal quick-booking-modal" role="dialog" aria-modal="true" aria-labelledby="quick-booking-title"><button type="button" className="cash-modal-close" aria-label="Cerrar" onClick={onClose}>×</button><p className="eyebrow">NUEVA CITA</p><h2 id="quick-booking-title">{slot.date} · {slot.time}</h2><p>Completa los datos para agregar la cita a la agenda.</p><form onSubmit={save}><label>Servicio<select required value={serviceId} onChange={(event) => setServiceId(event.target.value)}>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label>Especialista<select value={specialistId} onChange={(event) => setSpecialistId(event.target.value)}><option value="">Por asignar</option>{specialists.map((specialist) => <option key={specialist.id} value={specialist.id}>{specialist.full_name}</option>)}</select></label><label>Nombre de la clienta<input autoFocus required value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label>Teléfono<input required value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" /></label><label>Nota interna <input value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{message && <p className="access-message">{message}</p>}<div><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-operation" disabled={busy || !serviceId}>{busy ? "Guardando…" : "Agregar cita"}</button></div></form></section></div>;
}
