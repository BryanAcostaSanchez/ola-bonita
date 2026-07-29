"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "owner" | "manager" | "reception" | "specialist";
type Member = { id: string; full_name: string; role: Role; color: string; active: boolean };
type Service = { id: string; name: string; duration_minutes: number; category: { name: string } | { name: string }[] | null };
type Assignment = { specialist_id: string; service_id: string };
type Hours = { specialist_id: string; day_of_week: number; starts_at: string; ends_at: string; active: boolean };

const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const defaultHours = [
  { day_of_week: 0, starts_at: "10:00", ends_at: "16:00", active: true },
  { day_of_week: 1, starts_at: "09:00", ends_at: "18:00", active: true },
  { day_of_week: 2, starts_at: "09:00", ends_at: "18:00", active: true },
  { day_of_week: 3, starts_at: "09:00", ends_at: "18:00", active: true },
  { day_of_week: 4, starts_at: "09:00", ends_at: "18:00", active: true },
  { day_of_week: 5, starts_at: "09:00", ends_at: "18:00", active: true },
  { day_of_week: 6, starts_at: "10:00", ends_at: "16:00", active: true },
];

function categoryName(service: Service) { return Array.isArray(service.category) ? service.category[0]?.name : service.category?.name; }

export function TeamManager({ initialMembers, services, assignments, initialHours }: { initialMembers: Member[]; services: Service[]; assignments: Assignment[]; initialHours: Hours[] }) {
  const firstSpecialistId = initialMembers.find((member) => member.role === "specialist")?.id ?? "";
  const hoursFor = (id: string) => defaultHours.map((day) => {
    const saved = initialHours.find((item) => item.specialist_id === id && item.day_of_week === day.day_of_week);
    return saved ? { day_of_week: saved.day_of_week, starts_at: saved.starts_at.slice(0, 5), ends_at: saved.ends_at.slice(0, 5), active: saved.active } : day;
  });
  const [members, setMembers] = useState(initialMembers);
  const [selectedId, setSelectedId] = useState(firstSpecialistId);
  const [selectedServices, setSelectedServices] = useState<string[]>(() => assignments.filter((item) => item.specialist_id === firstSpecialistId).map((item) => item.service_id));
  const [hours, setHours] = useState(() => hoursFor(firstSpecialistId));
  const [invite, setInvite] = useState({ fullName: "", email: "", role: "specialist" as Exclude<Role, "owner"> });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const specialists = members.filter((member) => member.role === "specialist" && member.active);

  const selectedMember = useMemo(() => members.find((member) => member.id === selectedId), [members, selectedId]);

  function selectMember(id: string) {
    setSelectedId(id);
    setSelectedServices(assignments.filter((item) => item.specialist_id === id).map((item) => item.service_id));
    setHours(hoursFor(id));
    setMessage("");
  }

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const response = await fetch("/api/staff/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(invite) });
    const result = await response.json() as { id?: string; error?: string };
    if (!response.ok) setMessage(result.error || "No pudimos enviar la invitación.");
    else { setMessage("Invitación enviada. La persona recibirá un correo para crear su acceso."); setInvite({ fullName: "", email: "", role: "specialist" }); setMembers((current) => [...current, { id: result.id!, full_name: invite.fullName, role: invite.role, active: true, color: "#0f766e" }]); }
    setBusy(false);
  }

  async function saveAvailability() {
    if (!selectedId) return;
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("save_specialist_availability", { p_specialist_id: selectedId, p_service_ids: selectedServices, p_hours: hours });
    setMessage(error ? error.message : "Servicios y horarios guardados.");
    setBusy(false);
  }

  return <div className="team-workspace"><section className="settings-card team-invite"><div><p className="eyebrow">NUEVO ACCESO</p><h2>Invita al equipo</h2><p>Hasta 10 personas. Cada invitación crea una cuenta individual y auditable.</p></div><form onSubmit={sendInvite} className="team-invite-form"><input required placeholder="Nombre completo" value={invite.fullName} onChange={(event) => setInvite({ ...invite, fullName: event.target.value })} /><input required type="email" placeholder="correo@ejemplo.com" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} /><select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value as Exclude<Role, "owner"> })}><option value="specialist">Especialista</option><option value="reception">Recepción</option><option value="manager">Gerencia</option></select><button className="new-booking" disabled={busy}>{busy ? "Enviando…" : "Enviar invitación"}</button></form></section><section className="team-configuration"><aside className="settings-card member-list"><div className="section-top"><div><h2>Especialistas</h2><p>{specialists.length} de 10 accesos activos</p></div></div>{specialists.length ? specialists.map((member) => <button key={member.id} className={member.id === selectedId ? "member-choice active" : "member-choice"} onClick={() => selectMember(member.id)}><span className="mini-avatar" style={{ background: member.color }}>{member.full_name.slice(0, 2).toUpperCase()}</span><span><strong>{member.full_name}</strong><small>Especialista</small></span></button>) : <p className="empty-services">Invita a tu primera especialista para configurar su agenda.</p>}</aside><section className="settings-card availability-card"><p className="eyebrow">DISPONIBILIDAD</p><h2>{selectedMember ? selectedMember.full_name : "Selecciona una especialista"}</h2>{selectedMember ? <><p>Define qué servicios puede atender y sus horas. La web sólo mostrará espacios que respeten esta configuración.</p><div className="service-assignment">{services.map((service) => <label key={service.id}><input type="checkbox" checked={selectedServices.includes(service.id)} onChange={() => setSelectedServices((current) => current.includes(service.id) ? current.filter((id) => id !== service.id) : [...current, service.id])} /><span><strong>{service.name}</strong><small>{categoryName(service)} · {service.duration_minutes} min</small></span></label>)}</div><div className="hours-editor">{hours.map((day, index) => <div key={day.day_of_week}><label><input type="checkbox" checked={day.active} onChange={(event) => setHours((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, active: event.target.checked } : item))} /> {days[day.day_of_week]}</label><input type="time" disabled={!day.active} value={day.starts_at} onChange={(event) => setHours((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, starts_at: event.target.value } : item))} /><span>—</span><input type="time" disabled={!day.active} value={day.ends_at} onChange={(event) => setHours((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ends_at: event.target.value } : item))} /></div>)}</div><button className="new-booking" onClick={saveAvailability} disabled={busy}>{busy ? "Guardando…" : "Guardar disponibilidad"}</button></> : <p>Cuando agregues especialistas, podrás asignar sus servicios y horarios desde aquí.</p>}{message && <p className="access-message">{message}</p>}</section></section></div>;
}
