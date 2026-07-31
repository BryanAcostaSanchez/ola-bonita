"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "owner" | "manager" | "reception" | "specialist";
type Member = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  color: string;
  active: boolean;
};
type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  category: { name: string } | { name: string }[] | null;
};
type Assignment = {
  specialist_id: string;
  service_id: string;
  commission_cents: number;
};
type Hours = {
  specialist_id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  active: boolean;
};
type Compensation = {
  specialist_id: string;
  scheme: "per_service" | "fixed_period" | "fixed_plus_commission";
  frequency: "weekly" | "biweekly" | "monthly";
  fixed_amount_cents: number;
};
type Earning = {
  specialist_id: string;
  amount_cents: number;
  paid_at: string | null;
};

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

function categoryName(service: Service) {
  return Array.isArray(service.category)
    ? service.category[0]?.name
    : service.category?.name;
}

export function TeamManager({
  initialMembers,
  services,
  assignments,
  initialHours,
  compensations,
  earnings,
}: {
  initialMembers: Member[];
  services: Service[];
  assignments: Assignment[];
  initialHours: Hours[];
  compensations: Compensation[];
  earnings: Earning[];
}) {
  const firstSpecialistId =
    initialMembers.find((member) => member.role === "specialist")?.id ?? "";
  const hoursFor = (id: string) =>
    defaultHours.map((day) => {
      const saved = initialHours.find(
        (item) =>
          item.specialist_id === id && item.day_of_week === day.day_of_week,
      );
      return saved
        ? {
            day_of_week: saved.day_of_week,
            starts_at: saved.starts_at.slice(0, 5),
            ends_at: saved.ends_at.slice(0, 5),
            active: saved.active,
          }
        : day;
    });
  const [members, setMembers] = useState(initialMembers);
  const [selectedId, setSelectedId] = useState(firstSpecialistId);
  const [selectedServices, setSelectedServices] = useState<string[]>(() =>
    assignments
      .filter((item) => item.specialist_id === firstSpecialistId)
      .map((item) => item.service_id),
  );
  const [hours, setHours] = useState(() => hoursFor(firstSpecialistId));
  const [commissions, setCommissions] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      assignments
        .filter((item) => item.specialist_id === firstSpecialistId)
        .map((item) => [item.service_id, String(item.commission_cents / 100)]),
    ),
  );
  const initialCompensation = compensations.find(
    (item) => item.specialist_id === firstSpecialistId,
  );
  const [compensation, setCompensation] = useState({
    scheme:
      initialCompensation?.scheme ??
      ("per_service" as "per_service" | "fixed_period" | "fixed_plus_commission"),
    frequency:
      initialCompensation?.frequency ??
      ("weekly" as "weekly" | "biweekly" | "monthly"),
    fixedAmount: initialCompensation
      ? String(initialCompensation.fixed_amount_cents / 100)
      : "",
  });
  const [invite, setInvite] = useState({
    fullName: "",
    email: "",
    role: "specialist" as Exclude<Role, "owner">,
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const specialists = members.filter(
    (member) => member.role === "specialist" && member.active,
  );

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedId),
    [members, selectedId],
  );
  const pendingEarnings = earnings
    .filter((item) => item.specialist_id === selectedId && !item.paid_at)
    .reduce((total, item) => total + item.amount_cents, 0);

  function selectMember(id: string) {
    setSelectedId(id);
    setSelectedServices(
      assignments
        .filter((item) => item.specialist_id === id)
        .map((item) => item.service_id),
    );
    setHours(hoursFor(id));
    setCommissions(
      Object.fromEntries(
        assignments
          .filter((item) => item.specialist_id === id)
          .map((item) => [
            item.service_id,
            String(item.commission_cents / 100),
          ]),
      ),
    );
    const savedCompensation = compensations.find(
      (item) => item.specialist_id === id,
    );
    setCompensation({
      scheme: savedCompensation?.scheme ?? "per_service",
      frequency: savedCompensation?.frequency ?? "weekly",
      fixedAmount: savedCompensation
        ? String(savedCompensation.fixed_amount_cents / 100)
        : "",
    });
    setMessage("");
  }

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/staff/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invite),
    });
    const result = (await response.json()) as { id?: string; error?: string };
    if (!response.ok)
      setMessage(result.error || "No pudimos enviar la invitación.");
    else {
      setMessage(
        "Invitación enviada. La persona recibirá un correo para crear su acceso.",
      );
      setMembers((current) => [
        ...current,
        {
          id: result.id!,
          full_name: invite.fullName,
          email: invite.email,
          role: invite.role,
          active: true,
          color: "#0f766e",
        },
      ]);
      setInvite({ fullName: "", email: "", role: "specialist" });
    }
    setBusy(false);
  }

  async function saveAvailability() {
    if (!selectedId) return;
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("save_specialist_availability", {
      p_specialist_id: selectedId,
      p_service_ids: selectedServices,
      p_hours: hours,
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    const fixedAmount = Math.max(
      0,
      Math.round(Number(compensation.fixedAmount.replace(",", ".") || 0) * 100),
    );
    const result = await supabase.rpc("save_specialist_compensation", {
      p_specialist_id: selectedId,
      p_scheme: compensation.scheme,
      p_frequency: compensation.frequency,
      p_fixed_amount_cents: fixedAmount,
      p_commissions: selectedServices.map((service_id) => ({
        service_id,
        commission_cents: Math.max(
          0,
          Math.round(
            Number((commissions[service_id] || "0").replace(",", ".")) * 100,
          ),
        ),
      })),
    });
    setMessage(
      result.error
        ? result.error.message
        : "Disponibilidad y esquema de pago guardados.",
    );
    setBusy(false);
  }

  async function payPendingEarnings() {
    if (
      !selectedId ||
      !pendingEarnings ||
      !window.confirm(
        `¿Registrar $${(pendingEarnings / 100).toFixed(2)} como pagados a esta especialista?`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    const { error } = await createClient().rpc(
      "pay_pending_specialist_earnings",
      { p_specialist_id: selectedId },
    );
    setBusy(false);
    setMessage(
      error
        ? error.message
        : "Pago registrado. Recarga la página para ver el saldo actualizado.",
    );
  }

  async function removeMember() {
    if (!selectedMember) return;
    const confirmed = window.confirm(
      `¿Quitar a ${selectedMember.full_name} del equipo? Perderá acceso y dejará de aparecer para reservas. Sus citas y ventas se conservan.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    const response = await fetch("/api/staff/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: selectedMember.id }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error || "No pudimos eliminar a esta persona.");
    } else {
      const remaining = members.filter(
        (member) => member.id !== selectedMember.id,
      );
      const nextSpecialist = remaining.find(
        (member) => member.role === "specialist" && member.active,
      );
      setMembers(remaining);
      setSelectedId(nextSpecialist?.id ?? "");
      if (nextSpecialist) selectMember(nextSpecialist.id);
      setMessage(`${selectedMember.full_name} ya no tiene acceso al equipo.`);
    }
    setBusy(false);
  }

  async function resetPassword() {
    if (!selectedMember) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/staff/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: selectedMember.id }),
    });
    const result = (await response.json()) as { error?: string };
    setMessage(
      response.ok
        ? `Enviamos el enlace para restablecer la contraseña a ${selectedMember.full_name}.`
        : result.error || "No pudimos enviar el correo de restablecimiento.",
    );
    setBusy(false);
  }

  return (
    <div className="team-workspace">
      <section className="settings-card team-invite">
        <div>
          <p className="eyebrow">NUEVO ACCESO</p>
          <h2>Invita al equipo</h2>
          <p>
            Hasta 10 personas. Cada invitación crea una cuenta individual y
            auditable.
          </p>
        </div>
        <form onSubmit={sendInvite} className="team-invite-form">
          <input
            required
            placeholder="Nombre completo"
            value={invite.fullName}
            onChange={(event) =>
              setInvite({ ...invite, fullName: event.target.value })
            }
          />
          <input
            required
            type="email"
            placeholder="correo@ejemplo.com"
            value={invite.email}
            onChange={(event) =>
              setInvite({ ...invite, email: event.target.value })
            }
          />
          <select
            value={invite.role}
            onChange={(event) =>
              setInvite({
                ...invite,
                role: event.target.value as Exclude<Role, "owner">,
              })
            }
          >
            <option value="specialist">Especialista</option>
            <option value="reception">Recepción</option>
            <option value="manager">Gerencia</option>
          </select>
          <button className="new-booking" disabled={busy}>
            {busy ? "Enviando…" : "Enviar invitación"}
          </button>
        </form>
      </section>
      <section className="team-configuration">
        <aside className="settings-card member-list">
          <div className="section-top">
            <div>
              <h2>Especialistas</h2>
              <p>{specialists.length} de 10 accesos activos</p>
            </div>
          </div>
          {specialists.length ? (
            specialists.map((member) => (
              <button
                key={member.id}
                className={
                  member.id === selectedId
                    ? "member-choice active"
                    : "member-choice"
                }
                onClick={() => selectMember(member.id)}
              >
                <span
                  className="mini-avatar"
                  style={{ background: member.color }}
                >
                  {member.full_name.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>{member.full_name}</strong>
                  <small>{member.email || "Sin correo registrado"}</small>
                </span>
              </button>
            ))
          ) : (
            <p className="empty-services">
              Invita a tu primera especialista para configurar su agenda.
            </p>
          )}
        </aside>
        <section className="settings-card availability-card">
          <div className="member-detail-heading">
            <div>
              <p className="eyebrow">DISPONIBILIDAD Y PAGO</p>
              <h2>
                {selectedMember
                  ? selectedMember.full_name
                  : "Selecciona una especialista"}
              </h2>
              {selectedMember?.email && (
                <p className="member-email">{selectedMember.email}</p>
              )}
            </div>
            {selectedMember && (
              <div className="member-actions">
                <button
                  type="button"
                  className="reset-password"
                  onClick={resetPassword}
                  disabled={busy}
                >
                  Restablecer contraseña
                </button>
                <button
                  type="button"
                  className="remove-member"
                  onClick={removeMember}
                  disabled={busy}
                >
                  Quitar del equipo
                </button>
              </div>
            )}
          </div>
          {selectedMember ? (
            <>
              <p>
                Indica qué puede atender, el pago acordado y sus horas. Una
                comisión se congela al finalizar la cita.
              </p>
              {compensation.scheme !== "fixed_period" && (
                <div className="pending-earnings">
                  <span>Comisiones pendientes</span>
                  <strong>${(pendingEarnings / 100).toFixed(2)} MXN</strong>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || !pendingEarnings}
                    onClick={payPendingEarnings}
                  >
                    Registrar pago
                  </button>
                </div>
              )}
              <fieldset className="compensation-editor">
                <legend>Esquema de pago</legend>
                <label>
                  <input
                    type="radio"
                    checked={compensation.scheme === "per_service"}
                    onChange={() =>
                      setCompensation({
                        ...compensation,
                        scheme: "per_service",
                      })
                    }
                  />{" "}
                  Comisión por servicio realizado
                </label>
                <label>
                  <input
                    type="radio"
                    checked={compensation.scheme === "fixed_period"}
                    onChange={() =>
                      setCompensation({
                        ...compensation,
                        scheme: "fixed_period",
                      })
                    }
                  />{" "}
                  Pago fijo por periodo
                </label>
                <label>
                  <input
                    type="radio"
                    checked={compensation.scheme === "fixed_plus_commission"}
                    onChange={() =>
                      setCompensation({
                        ...compensation,
                        scheme: "fixed_plus_commission",
                      })
                    }
                  />{" "}
                  Fijo + comisión por servicio
                </label>
                {compensation.scheme !== "per_service" && (
                  <div>
                    <label>
                      Importe fijo{" "}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={compensation.fixedAmount}
                        onChange={(event) =>
                          setCompensation({
                            ...compensation,
                            fixedAmount: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Frecuencia{" "}
                      <select
                        value={compensation.frequency}
                        onChange={(event) =>
                          setCompensation({
                            ...compensation,
                            frequency: event.target
                              .value as typeof compensation.frequency,
                          })
                        }
                      >
                        <option value="weekly">Semanal</option>
                        <option value="biweekly">Quincenal</option>
                        <option value="monthly">Mensual</option>
                      </select>
                    </label>
                  </div>
                )}
              </fieldset>
              <div className="service-assignment">
                {services.map((service) => (
                  <label key={service.id}>
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(service.id)}
                      onChange={() =>
                        setSelectedServices((current) =>
                          current.includes(service.id)
                            ? current.filter((id) => id !== service.id)
                            : [...current, service.id],
                        )
                      }
                    />
                    <span>
                      <strong>{service.name}</strong>
                      <small>
                        {categoryName(service)} · {service.duration_minutes} min
                      </small>
                      {compensation.scheme !== "fixed_period" &&
                        selectedServices.includes(service.id) && (
                          <em>
                            Comisión ${" "}
                            <input
                              aria-label={`Comisión de ${service.name}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={commissions[service.id] ?? ""}
                              onChange={(event) =>
                                setCommissions({
                                  ...commissions,
                                  [service.id]: event.target.value,
                                })
                              }
                            />
                          </em>
                        )}
                    </span>
                  </label>
                ))}
              </div>
              <div className="hours-editor">
                {hours.map((day, index) => (
                  <div key={day.day_of_week}>
                    <label>
                      <input
                        type="checkbox"
                        checked={day.active}
                        onChange={(event) =>
                          setHours((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, active: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />{" "}
                      {days[day.day_of_week]}
                    </label>
                    <input
                      type="time"
                      disabled={!day.active}
                      value={day.starts_at}
                      onChange={(event) =>
                        setHours((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, starts_at: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <span>—</span>
                    <input
                      type="time"
                      disabled={!day.active}
                      value={day.ends_at}
                      onChange={(event) =>
                        setHours((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, ends_at: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <button
                className="new-booking"
                onClick={saveAvailability}
                disabled={busy}
              >
                {busy ? "Guardando…" : "Guardar disponibilidad y pago"}
              </button>
            </>
          ) : (
            <p>
              Cuando agregues especialistas, podrás asignar sus servicios y
              horarios desde aquí.
            </p>
          )}
          {message && <p className="access-message">{message}</p>}
        </section>
      </section>
    </div>
  );
}
