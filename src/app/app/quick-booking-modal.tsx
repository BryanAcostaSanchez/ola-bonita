"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Specialist = { id: string; full_name: string };
type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_after_minutes: number;
};

const finishTime = (time: string, minutes: number) => {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export function QuickBookingModal({
  slot,
  specialists,
  services,
  onClose,
}: {
  slot: { date: string; time: string; specialistId: string | null };
  specialists: Specialist[];
  services: Service[];
  onClose: () => void;
}) {
  const [serviceId, setServiceId] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [specialistId, setSpecialistId] = useState(slot.specialistId ?? "");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedService = services.find((service) => service.id === serviceId);
  const filteredServices = useMemo(() => {
    const term = serviceSearch.trim().toLocaleLowerCase("es-MX");
    return term ? services.filter((service) => service.name.toLocaleLowerCase("es-MX").includes(term)) : services;
  }, [serviceSearch, services]);
  const scheduledMinutes = (selectedService?.duration_minutes ?? 0) + (selectedService?.buffer_after_minutes ?? 0);

  function selectService(service: Service) {
    setServiceId(service.id);
    setServiceSearch(service.name);
    setServiceMenuOpen(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await createClient().rpc("create_staff_booking", {
      p_service_id: serviceId,
      p_specialist_id: specialistId || null,
      p_starts_at: new Date(`${slot.date}T${slot.time}:00-06:00`).toISOString(),
      p_full_name: fullName,
      p_phone: phone || null,
      p_notes: notes || null,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.reload();
  }

  async function registerCustomer() {
    if (!fullName.trim()) {
      setMessage("Escribe al menos el nombre de la clienta.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await createClient().from("customers").insert({
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      email: email.trim().toLocaleLowerCase() || null,
      notes: notes.trim() || null,
    });
    setBusy(false);
    setMessage(error ? error.message : "Clienta registrada. Puedes agregar su cita ahora o cerrar este modal.");
  }

  return <div className="cash-modal-backdrop" role="presentation"><section className="cash-modal quick-booking-modal" role="dialog" aria-modal="true" aria-labelledby="quick-booking-title"><button type="button" className="cash-modal-close" aria-label="Cerrar" onClick={onClose}>×</button><p className="eyebrow">NUEVA CITA</p><h2 id="quick-booking-title">{slot.date} · {slot.time}</h2><p>El horario se reserva usando la duración configurada para el servicio.</p><form onSubmit={save}><label>Buscar servicio<div className="quick-service-search"><input required value={serviceSearch} onFocus={() => setServiceMenuOpen(true)} onChange={(event) => { setServiceSearch(event.target.value); setServiceId(""); setServiceMenuOpen(true); }} placeholder="Busca un servicio" role="combobox" aria-expanded={serviceMenuOpen} aria-controls="quick-service-results" />{serviceMenuOpen && <div id="quick-service-results" className="quick-service-results" role="listbox">{filteredServices.length ? filteredServices.map((service) => <button type="button" role="option" aria-selected={service.id === serviceId} key={service.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectService(service)}><strong>{service.name}</strong><span>{service.duration_minutes} min</span></button>) : <p>No encontramos servicios con ese nombre.</p>}</div>}</div></label>{selectedService && <p className="booking-duration">Duración del servicio: <strong>{selectedService.duration_minutes} min</strong>{selectedService.buffer_after_minutes > 0 && ` + ${selectedService.buffer_after_minutes} min de preparación`} · termina a las <strong>{finishTime(slot.time, scheduledMinutes)}</strong>.</p>}<label>Especialista<select value={specialistId} onChange={(event) => setSpecialistId(event.target.value)}><option value="">Por asignar</option>{specialists.map((specialist) => <option key={specialist.id} value={specialist.id}>{specialist.full_name}</option>)}</select></label><div className="quick-customer-heading"><strong>Clienta</strong><button type="button" className="text-action" onClick={() => setShowCustomerDetails((current) => !current)}>{showCustomerDetails ? "Ocultar datos" : "Registrar clienta"}</button></div><label>Nombre de la clienta<input autoFocus required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Con solo el nombre puedes guardar la cita" /></label>{showCustomerDetails && <div className="quick-customer-details"><label>Teléfono <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" /></label><label>Correo <input value={email} onChange={(event) => setEmail(event.target.value)} inputMode="email" /></label><button type="button" className="secondary-button" disabled={busy} onClick={() => void registerCustomer()}>{busy ? "Guardando…" : "Guardar clienta"}</button></div>}<label>Nota interna <input value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{message && <p className="access-message">{message}</p>}<div><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-operation" disabled={busy || !serviceId}>{busy ? "Guardando…" : "Agregar cita"}</button></div></form></section></div>;
}
