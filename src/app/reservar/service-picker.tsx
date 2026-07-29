"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Service = { id: string; name: string; duration_minutes: number; price_cents: number; deposit_enabled: boolean | null; deposit_percent: number | null; category: { name: string } | { name: string }[] | null };
type Settings = { timezone: string; deposit_enabled: boolean; deposit_percent: number; lead_time_minutes: number; slot_interval_minutes: number; payment_ready: boolean } | null;
type Specialist = { id: string; full_name: string; color: string };
type Slot = { specialist_id: string; starts_at: string; ends_at: string };
type Booking = { public_code: string; price_cents: number; deposit_due_cents: number; deposit_percent: number };

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const categoryName = (service: Service) => Array.isArray(service.category) ? service.category[0]?.name : service.category?.name;
const mexicoDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function BookingServicePicker({ services, settings }: { services: Service[]; settings: Settings }) {
  const [step, setStep] = useState(1);
  const [selectedId, setSelectedId] = useState(services[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [specialistId, setSpecialistId] = useState("");
  const [date, setDate] = useState(mexicoDate);
  const [maxDate] = useState(() => new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const selected = services.find((service) => service.id === selectedId);
  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-MX");
    return normalizedQuery ? services.filter((service) => `${service.name} ${categoryName(service) ?? ""}`.toLocaleLowerCase("es-MX").includes(normalizedQuery)) : services;
  }, [query, services]);
  const depositPercent = selected ? (selected.deposit_enabled === false ? 0 : selected.deposit_percent ?? (settings?.deposit_enabled ? settings.deposit_percent : 0)) : 0;
  const estimatedDeposit = selected ? Math.round(selected.price_cents * Number(depositPercent) / 100) : 0;

  useEffect(() => {
    if (!selectedId) return;
    fetch(`/api/specialists?serviceId=${selectedId}`).then(async (response) => response.ok ? response.json() : { specialists: [] }).then((data) => setSpecialists(data.specialists ?? [])).catch(() => setSpecialists([]));
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !date) return;
    const params = new URLSearchParams({ serviceId: selectedId, date });
    if (specialistId) params.set("specialistId", specialistId);
    fetch(`/api/availability?${params}`).then(async (response) => response.ok ? response.json() : { slots: [] }).then((data) => setSlots(data.slots ?? [])).catch(() => setSlots([]));
  }, [selectedId, specialistId, date]);

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot || !selected) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceId: selected.id, specialistId: selectedSlot.specialist_id, startsAt: selectedSlot.starts_at, ...form }) });
    const data = await response.json() as { booking?: Booking; checkout_url?: string; error?: string };
    if (!response.ok) setMessage(data.error || "No pudimos completar la reserva.");
    else if (data.checkout_url) window.location.assign(data.checkout_url);
    else { setBooking(data.booking ?? null); if (data.error) setMessage(data.error); setStep(4); }
    setBusy(false);
  }

  function time(slot: Slot) { return new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(slot.starts_at)); }
  function dateLabel() { return new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00-06:00`)); }
  function selectService(id: string) { setSelectedId(id); setSpecialistId(""); setSelectedSlot(null); setSlots([]); }
  function selectSpecialist(id: string) { setSpecialistId(id); setSelectedSlot(null); setSlots([]); }
  function selectDate(value: string) { setDate(value); setSelectedSlot(null); setSlots([]); }

  if (step === 4 && booking && selected) return <section className="booking-form booking-success"><p className="eyebrow">RESERVA SOLICITADA</p><h2>Tu espacio está apartado.</h2><p>Tu código de reserva es <strong>{booking.public_code}</strong>. Recibirás los siguientes pasos por el medio de contacto que nos compartiste.</p>{message && <p className="access-message">{message}</p>}<div className="booking-receipt"><span>{selected.name}</span><b>{money.format(booking.price_cents / 100)}</b>{booking.deposit_due_cents > 0 && <><span>Anticipo a pagar en línea ({booking.deposit_percent}%)</span><b>{money.format(booking.deposit_due_cents / 100)}</b><span>Saldo a liquidar en el spa</span><b>{money.format((booking.price_cents - booking.deposit_due_cents) / 100)}</b></>}</div><button className="button" onClick={() => window.location.assign("/")}>Volver al inicio <span>→</span></button></section>;

  return <section className="booking-form"><div className="booking-progress"><span className={step >= 1 ? "active" : ""}>1 Servicio</span><span className={step >= 2 ? "active" : ""}>2 Horario</span><span className={step >= 3 ? "active" : ""}>3 Datos</span></div>{step === 1 && <><fieldset><legend>Elige un servicio</legend><label className="service-search"><span className="sr-only">Buscar servicio</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar masaje, facial, uñas…" /></label><div className="booking-services">{filteredServices.map((service) => <label className="booking-service" key={service.id}><input type="radio" name="service" checked={selectedId === service.id} onChange={() => selectService(service.id)} /><span className="radio-mark" /><span><strong>{service.name}</strong><small>{categoryName(service)} · {service.duration_minutes} min</small></span><b>{money.format(service.price_cents / 100)}</b></label>)}</div></fieldset>{selected && <div className="booking-total"><span>{depositPercent > 0 ? `Anticipo de ${depositPercent}%` : "Sin anticipo online"}</span><strong>{depositPercent > 0 ? money.format(estimatedDeposit / 100) : "Se paga en el spa"}</strong></div>}<button type="button" className="button" disabled={!selected} onClick={() => setStep(2)}>Elegir fecha y horario <span>→</span></button></>}{step === 2 && <><fieldset><legend>Elige tu horario</legend><label className="date-input">Fecha<input type="date" min={mexicoDate()} max={maxDate} value={date} onChange={(event) => selectDate(event.target.value)} /></label>{specialists.length > 1 && <div className="specialist-options"><label><input type="radio" checked={!specialistId} onChange={() => selectSpecialist("")} /> Primera especialista disponible</label>{specialists.map((person) => <label key={person.id}><input type="radio" checked={specialistId === person.id} onChange={() => selectSpecialist(person.id)} /> {person.full_name}</label>)}</div>}<p className="slot-date">{dateLabel()}</p><div className="slot-grid">{slots.map((slot) => <button type="button" key={`${slot.specialist_id}-${slot.starts_at}`} className={selectedSlot?.starts_at === slot.starts_at && selectedSlot.specialist_id === slot.specialist_id ? "slot active" : "slot"} onClick={() => setSelectedSlot(slot)}>{time(slot)}</button>)}</div>{!slots.length && <p className="empty-services">No hay espacios disponibles ese día. Prueba otra fecha.</p>}</fieldset><div className="booking-actions"><button type="button" className="back-button" onClick={() => setStep(1)}>← Servicio</button><button type="button" className="button" disabled={!selectedSlot} onClick={() => setStep(3)}>Continuar <span>→</span></button></div></>}{step === 3 && <form onSubmit={submitBooking}><fieldset><legend>Cuéntanos de ti</legend><p className="booking-summary">{selected?.name} · {dateLabel()} · {selectedSlot && time(selectedSlot)}</p><div className="customer-fields"><label>Nombre completo<input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label><label>Teléfono<input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label>Correo <small>(opcional)</small><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Notas <small>(opcional)</small><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Algo que debamos saber" /></label></div></fieldset>{depositPercent > 0 && <div className="booking-total"><span>Anticipo a pagar en línea</span><strong>{money.format(estimatedDeposit / 100)}</strong><small>El resto se liquida en el spa.</small></div>}<div className="booking-actions"><button type="button" className="back-button" onClick={() => setStep(2)}>← Horario</button><button className="button" disabled={busy}>{busy ? "Apartando…" : "Confirmar reserva"} <span>→</span></button></div>{message && <p className="access-message">{message}</p>}</form>}</section>;
}
