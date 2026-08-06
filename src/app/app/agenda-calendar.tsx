"use client";

import { type CSSProperties, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { QuickBookingModal } from "./quick-booking-modal";

type Specialist = { id: string; full_name: string; color: string | null };
type SpecialistHour = {
  specialist_id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  active: boolean;
};
type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_after_minutes: number;
};
type Booking = {
  id: string;
  specialist_id?: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  price_cents?: number;
  deposit_due_cents?: number;
  payment_status?: string;
  commission_override_cents?: number | null;
  commission_override_reason?: string | null;
  payments?: { amount_cents: number; status: string }[] | null;
  customer:
    | { full_name: string; phone?: string | null; email?: string | null }
    | { full_name: string; phone?: string | null; email?: string | null }[]
    | null;
  service: { name: string } | { name: string }[] | null;
  specialist:
    | { full_name: string; color: string | null }
    | { full_name: string; color: string | null }[]
    | null;
};
const tz = "America/Mexico_City";
const hours = Array.from({ length: 10 }, (_, index) => index + 9);
const palette = [
  "#397c75",
  "#d9787b",
  "#7287b5",
  "#bd8b46",
  "#9877ad",
  "#4c9c8b",
];
const one = <T,>(value: T | T[] | null) =>
  Array.isArray(value) ? value[0] : value;
const dateKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const timeMinutes = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  return get("hour") * 60 + get("minute");
};
const serviceColor = (name: string) =>
  palette[
    [...name].reduce((total, char) => total + char.charCodeAt(0), 0) %
      palette.length
  ];

export function AgendaCalendar({
  initialDate,
  bookings,
  specialists,
  specialistHours,
  canAssign,
  canComplete,
  canManageCompensation,
  canCreate,
  services,
}: {
  initialDate: string;
  bookings: Booking[];
  specialists: Specialist[];
  specialistHours: SpecialistHour[];
  canAssign: boolean;
  canComplete: boolean;
  canManageCompensation: boolean;
  canCreate: boolean;
  services: Service[];
}) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [view, setView] = useState<"team" | "general">("team");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [dragging, setDragging] = useState<Booking | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [quickSlot, setQuickSlot] = useState<{ date: string; time: string; specialistId: string | null } | null>(null);
  const daySwipeStart = useRef<{ x: number; y: number } | null>(null);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(`${initialDate}T12:00:00-06:00`);
        date.setDate(date.getDate() + index);
        return {
          key: dateKey(date),
          label: new Intl.DateTimeFormat("es-MX", {
            weekday: "short",
            day: "numeric",
            timeZone: tz,
          }).format(date),
        };
      }),
    [initialDate],
  );
  const activeBookings = bookings.filter(
    (booking) => !["cancelled", "no_show"].includes(booking.status),
  );
  const visible = activeBookings.filter(
    (booking) => dateKey(new Date(booking.starts_at)) === selectedDate,
  );
  const selectedDay = new Date(`${selectedDate}T12:00:00`).getDay();
  const availableSpecialists = specialists.filter(
    (specialist) =>
      specialist.id !== "massage-cabin" &&
      specialistHours.some(
        (hour) =>
          hour.specialist_id === specialist.id &&
          hour.day_of_week === selectedDay &&
          hour.active,
      ),
  );
  const columns = [
    ...availableSpecialists,
    ...specialists.filter((specialist) => specialist.id === "massage-cabin"),
    { id: "unassigned", full_name: "Por asignar", color: "#8da9a4" },
  ];
  const bookingInfo = (booking: Booking) => ({
    customer: one(booking.customer),
    service: one(booking.service),
    assigned: one(booking.specialist),
  });
  const moveSelectedDay = (step: number) => {
    const index = days.findIndex((day) => day.key === selectedDate);
    const next = days[index + step];
    if (next) {
      setSelectedDate(next.key);
      if (view === "general") setView("team");
    }
  };
  async function assign(
    specialistId: string,
    target: Booking | null = selectedBooking,
  ) {
    if (!target || target.id.startsWith("cabin-") || !specialistId) return;
    setSaving(true);
    const response = await fetch("/api/bookings/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: target.id, specialistId }),
    });
    const result = (await response.json()) as { error?: string };
    setSaving(false);
    if (!response.ok) setMessage(result.error || "No pudimos asignar la cita.");
    else {
      setMessage(
        "Especialista asignada. Recarga la agenda para verla en su columna.",
      );
      setSelectedBooking(null);
      setDragging(null);
    }
  }
  async function complete() {
    if (!selectedBooking || selectedBooking.id.startsWith("cabin-")) return;
    setSaving(true);
    const { error } = await createClient().rpc("complete_booking", {
      p_booking_id: selectedBooking.id,
    });
    setSaving(false);
    if (error) setMessage(error.message);
    else {
      setMessage("Cita finalizada y comisión registrada.");
      setSelectedBooking(null);
      window.setTimeout(() => window.location.reload(), 500);
    }
  }
  async function markNoShow() {
    if (!selectedBooking || selectedBooking.id.startsWith("cabin-")) return;
    const reason = window.prompt("Motivo o nota interna (opcional):", "");
    if (reason === null) return;
    if (!window.confirm("¿Marcar esta cita como “No se presentó”? Se aplicará la política de anticipo configurada.")) return;
    setSaving(true);
    const { data, error } = await createClient().rpc("mark_booking_no_show", {
      p_booking_id: selectedBooking.id,
      p_reason: reason.trim() || null,
    });
    setSaving(false);
    if (error) setMessage(error.message);
    else {
      setMessage(`Cita marcada como no presentada. ${data || ""}`);
      setSelectedBooking(null);
      window.setTimeout(() => window.location.reload(), 700);
    }
  }
  async function cancelBooking() {
    if (!selectedBooking || selectedBooking.id.startsWith("cabin-")) return;
    const reason = window.prompt("Motivo de la cancelación (opcional):", "");
    if (reason === null) return;
    if (!window.confirm("¿Cancelar esta cita? Se aplicará la política de anticipo configurada.")) return;
    setSaving(true);
    const { data, error } = await createClient().rpc("cancel_booking", {
      p_booking_id: selectedBooking.id,
      p_reason: reason.trim() || null,
    });
    setSaving(false);
    if (error) setMessage(error.message);
    else {
      setMessage(`Cita cancelada. ${data || ""}`);
      setSelectedBooking(null);
      window.setTimeout(() => window.location.reload(), 700);
    }
  }
  async function adjustCommission() {
    if (!selectedBooking || selectedBooking.id.startsWith("cabin-")) return;
    const current = selectedBooking.commission_override_cents == null ? "" : String(selectedBooking.commission_override_cents / 100);
    const amount = window.prompt("Comisión para esta cita (MXN). Déjalo vacío para restaurar la tarifa estándar.", current);
    if (amount === null) return;
    const normalized = amount.trim().replace(",", ".");
    const cents = normalized ? Math.round(Number(normalized) * 100) : null;
    if (cents !== null && (!Number.isFinite(cents) || cents < 0)) { setMessage("Escribe una comisión válida."); return; }
    const reason = cents === null ? null : window.prompt("Motivo del ajuste (queda en el historial):", selectedBooking.commission_override_reason || "");
    if (cents !== null && !reason?.trim()) { setMessage("Escribe el motivo del ajuste."); return; }
    setSaving(true);
    const { error } = await createClient().rpc("set_booking_commission_override", { p_booking_id: selectedBooking.id, p_commission_cents: cents, p_reason: reason?.trim() || null });
    setSaving(false);
    if (error) setMessage(error.message);
    else { setMessage(cents === null ? "Se restauró la comisión estándar." : "Comisión especial guardada para esta cita."); window.setTimeout(() => window.location.reload(), 500); }
  }
  const event = (booking: Booking, style: CSSProperties, compact = false) => {
    const { customer, service, assigned } = bookingInfo(booking);
    const color = assigned?.color || serviceColor(service?.name || "Agenda");
    const draggable =
      canAssign && !booking.id.startsWith("cabin-") && !booking.specialist_id;
    return (
      <button
        type="button"
        draggable={draggable}
        className={`calendar-event ${compact ? "general-event" : ""} ${draggable ? "draggable-event" : ""}`}
        key={booking.id}
        onDragStart={() => setDragging(booking)}
        onDragEnd={() => setDragging(null)}
        onClick={() => setSelectedBooking(booking)}
        style={{ ...style, borderColor: color, backgroundColor: `${color}20` }}
      >
        <strong>{customer?.full_name || "Cliente"}</strong>
        <span>{service?.name || "Servicio"}</span>
        {assigned && <small>{assigned.full_name}</small>}
      </button>
    );
  };

  return (
    <section className="agenda-section agenda-calendar" id="agenda">
      <div className="section-top calendar-title">
        <div>
          <h2>Agenda</h2>
          <p>
            {view === "team"
              ? "Vista por especialista y tipo de espacio."
              : "Vista general para coordinar y asignar el equipo."}
          </p>
        </div>
        <span className="calendar-live">
          <i /> En vivo
        </span>
      </div>
      <div className="calendar-toolbar">
        <div className="calendar-views">
          <button
            type="button"
            className={view === "team" ? "active" : ""}
            onClick={() => setView("team")}
          >
            Por especialista
          </button>
          <button
            type="button"
            className={view === "general" ? "active" : ""}
            onClick={() => setView("general")}
          >
            Vista general
          </button>
        </div>
        <span>
          {view === "team"
            ? `${visible.length} citas del día · desliza para ver más especialistas`
            : `${activeBookings.length} citas esta semana`}
        </span>
      </div>
      <div
        className="calendar-days"
        role="tablist"
        aria-label="Selecciona un día"
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse")
            daySwipeStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          if (!daySwipeStart.current) return;
          const x = event.clientX - daySwipeStart.current.x;
          const y = event.clientY - daySwipeStart.current.y;
          daySwipeStart.current = null;
          if (Math.abs(x) > 48 && Math.abs(x) > Math.abs(y))
            moveSelectedDay(x < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          daySwipeStart.current = null;
        }}
      >
        {days.map((day) => (
          <button
            key={day.key}
            type="button"
            className={day.key === selectedDate ? "selected" : ""}
            onClick={() => {
              setSelectedDate(day.key);
              if (view === "general") setView("team");
            }}
          >
            <span>
              {day.key === initialDate ? "HOY" : day.label.split(" ")[0]}
            </span>
            <strong>{day.label.split(" ").at(-1)}</strong>
          </button>
        ))}
      </div>
      <p className="calendar-swipe-hint" aria-hidden="true">
        Desliza los días para cambiar la agenda.
      </p>
      {view === "team" ? (
        <div className="calendar-scroll">
          <div
            className="calendar-grid"
            style={{
              gridTemplateColumns: `58px repeat(${columns.length}, minmax(185px, 1fr))`,
            }}
          >
            <div className="calendar-corner">Hora</div>
            {columns.map((specialist) => (
              <div className="calendar-specialist" key={specialist.id}>
                <i style={{ background: specialist.color || "#8da9a4" }} />
                <span>{specialist.full_name}</span>
              </div>
            ))}
            <div className="calendar-times">
              {hours.map((hour) => (
                <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
              ))}
            </div>
            {columns.map((specialist) => (
              <div
                className={`calendar-column ${dragging && specialist.id !== "unassigned" && specialist.id !== "massage-cabin" ? "drop-target" : ""}`}
                key={specialist.id}
                onDragOver={(event) => {
                  if (
                    dragging &&
                    specialist.id !== "unassigned" &&
                    specialist.id !== "massage-cabin"
                  )
                    event.preventDefault();
                }}
                onDrop={() => {
                  if (
                    dragging &&
                    specialist.id !== "unassigned" &&
                    specialist.id !== "massage-cabin"
                  )
                    assign(specialist.id, dragging);
                }}
              >
                {hours.map((hour) => (
                  <button type="button" className="calendar-hour calendar-hour-action" key={hour} disabled={!canCreate} aria-label={`Agregar cita con ${specialist.full_name} a las ${String(hour).padStart(2, "0")}:00`} onClick={() => setQuickSlot({ date: selectedDate, time: `${String(hour).padStart(2, "0")}:00`, specialistId: specialist.id === "unassigned" || specialist.id === "massage-cabin" ? null : specialist.id })} />
                ))}
                {visible
                  .filter(
                    (booking) =>
                      one(booking.specialist)?.full_name ===
                        specialist.full_name ||
                      (!one(booking.specialist) &&
                        specialist.id === "unassigned"),
                  )
                  .map((booking) => {
                    const start = timeMinutes(booking.starts_at);
                    const end = timeMinutes(booking.ends_at);
                    return event(booking, {
                      top: Math.max(0, start - 540),
                      height: Math.max(32, end - start),
                    });
                  })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="calendar-scroll">
          <div className="general-calendar-grid">
            <div className="calendar-corner">Hora</div>
            {days.map((day) => (
              <div className="general-day-head" key={day.key}>
                {day.label}
              </div>
            ))}
            <div className="calendar-times">
              {hours.map((hour) => (
                <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
              ))}
            </div>
            {days.map((day) => (
              <div className="calendar-column general-day-column" key={day.key}>
                {hours.map((hour) => (
                  <button type="button" className="calendar-hour calendar-hour-action" key={hour} disabled={!canCreate} aria-label={`Agregar cita el ${day.label} a las ${String(hour).padStart(2, "0")}:00`} onClick={() => setQuickSlot({ date: day.key, time: `${String(hour).padStart(2, "0")}:00`, specialistId: null })} />
                ))}
                {activeBookings
                  .filter(
                    (booking) =>
                      dateKey(new Date(booking.starts_at)) === day.key,
                  )
                  .map((booking) => {
                    const start = timeMinutes(booking.starts_at);
                    const end = timeMinutes(booking.ends_at);
                    return event(
                      booking,
                      {
                        top: Math.max(0, start - 540),
                        height: Math.max(34, end - start),
                      },
                      true,
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedBooking && (
        <section className="assignment-panel">
          <div>
            {(() => {
              const { customer, service, assigned } =
                bookingInfo(selectedBooking);
              const paid = (selectedBooking.payments ?? [])
                .filter((payment) => payment.status === "completed")
                .reduce((total, payment) => total + payment.amount_cents, 0);
              const balance = Math.max(
                0,
                (selectedBooking.price_cents ?? 0) - paid,
              );
              return (
                <>
                  <p className="eyebrow">CITA SELECCIONADA</p>
                  <h3>{customer?.full_name || "Cliente"}</h3>
                  <p>
                    {service?.name || "Servicio"} ·{" "}
                    {new Intl.DateTimeFormat("es-MX", {
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: tz,
                    }).format(new Date(selectedBooking.starts_at))}
                  </p>
                  <small>
                    {customer?.phone || "Sin teléfono"}
                    {customer?.email ? ` · ${customer.email}` : ""}
                  </small>
                  <div className="booking-payment-detail">
                    <span>
                      {assigned
                        ? `Asignada a ${assigned.full_name}`
                        : "Sin especialista asignada"}
                    </span>
                    {selectedBooking.price_cents ? (
                      <b>
                        {balance
                          ? `Debe $${(balance / 100).toFixed(0)} MXN`
                          : "Pagado"}
                      </b>
                    ) : null}
                  </div>
                  {selectedBooking.commission_override_cents !== null && selectedBooking.commission_override_cents !== undefined && <small>Comisión especial: ${(selectedBooking.commission_override_cents / 100).toFixed(2)} MXN · {selectedBooking.commission_override_reason}</small>}
                </>
              );
            })()}
          </div>
          {canAssign && !selectedBooking.id.startsWith("cabin-") && (
            <label>
              Asignar a
              <select
                defaultValue={selectedBooking.specialist_id || ""}
                disabled={saving}
                onChange={(event) => assign(event.target.value)}
              >
                <option value="">Sin asignar</option>
                {availableSpecialists.map((specialist) => (
                  <option key={specialist.id} value={specialist.id}>
                    {specialist.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {canComplete &&
            !selectedBooking.id.startsWith("cabin-") &&
            !["completed", "cancelled", "no_show"].includes(selectedBooking.status) && (
              <button
                type="button"
                className="new-booking"
                disabled={saving}
                onClick={complete}
              >
                {saving ? "Guardando…" : "Finalizar cita"}
              </button>
            )}
          {canComplete && !selectedBooking.id.startsWith("cabin-") && !["completed", "cancelled", "no_show"].includes(selectedBooking.status) && <button type="button" className="secondary-button" disabled={saving} onClick={markNoShow}>No se presentó</button>}
          {canComplete && !selectedBooking.id.startsWith("cabin-") && !["completed", "cancelled", "no_show"].includes(selectedBooking.status) && <button type="button" className="secondary-button" disabled={saving} onClick={cancelBooking}>Cancelar cita</button>}
          {canManageCompensation && !selectedBooking.id.startsWith("cabin-") && !["completed", "cancelled", "no_show"].includes(selectedBooking.status) && <button type="button" className="secondary-button" disabled={saving} onClick={adjustCommission}>Ajustar comisión</button>}
          <button
            type="button"
            className="secondary-button"
            onClick={() => setSelectedBooking(null)}
          >
            Cerrar
          </button>
        </section>
      )}
      {message && <p className="access-message">{message}</p>}
      {quickSlot && <QuickBookingModal slot={quickSlot} specialists={availableSpecialists} services={services} onClose={() => setQuickSlot(null)} />}
    </section>
  );
}
