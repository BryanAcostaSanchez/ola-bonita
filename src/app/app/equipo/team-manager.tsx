"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  defaultPermissionsByRole,
  PERMISSION_GROUPS,
  type Permission,
} from "@/lib/permissions";
import { RolePermissionManager } from "../configuracion/role-permission-manager";

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
  commission_percent: number | null;
};
type Earning = {
  specialist_id: string;
  amount_cents: number;
  paid_at: string | null;
};
type ExternalPayment = {
  id: string;
  external_provider_name: string | null;
  description: string;
  amount_cents: number;
  payment_method: string;
  created_at: string;
};
type ConfigurableRole = Exclude<Role, "owner">;

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
  mode,
  initialMembers,
  services,
  assignments,
  initialHours,
  compensations,
  earnings,
  externalPayments,
  defaultCommissionPercent,
}: {
  mode: "personal" | "nomina";
  initialMembers: Member[];
  services: Service[];
  assignments: Assignment[];
  initialHours: Hours[];
  compensations: Compensation[];
  earnings: Earning[];
  externalPayments: ExternalPayment[];
  defaultCommissionPercent: number;
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
  const initialCompensation = compensations.find(
    (item) => item.specialist_id === firstSpecialistId,
  );
  const [compensation, setCompensation] = useState({
    scheme:
      initialCompensation?.scheme ??
      ("per_service" as
        "per_service" | "fixed_period" | "fixed_plus_commission"),
    frequency:
      initialCompensation?.frequency ??
      ("weekly" as "weekly" | "biweekly" | "monthly"),
    fixedAmount: initialCompensation
      ? String(initialCompensation.fixed_amount_cents / 100)
      : "",
    commissionPercent:
      initialCompensation?.commission_percent == null
        ? ""
        : String(initialCompensation.commission_percent),
  });
  const [globalCommissionPercent, setGlobalCommissionPercent] = useState(
    String(defaultCommissionPercent),
  );
  const [invite, setInvite] = useState({
    fullName: "",
    email: "",
    role: "specialist" as Exclude<Role, "owner">,
  });
  const [invitePermissions, setInvitePermissions] = useState<Permission[]>(
    defaultPermissionsByRole.specialist,
  );
  const [roleTemplates, setRoleTemplates] = useState<
    Record<ConfigurableRole, Permission[]>
  >(defaultPermissionsByRole);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const specialists = members.filter(
    (member) => member.role === "specialist" && member.active,
  );

  useEffect(() => {
    void fetch("/api/role-permissions").then(async (response) => {
      if (!response.ok) return;
      const result = (await response.json()) as {
        templates?: Array<{
          role: ConfigurableRole;
          permissions: Permission[];
        }>;
      };
      const templates = result.templates;
      if (!templates) return;
      setRoleTemplates((current) => ({
        ...current,
        ...Object.fromEntries(
          templates.map((template) => [template.role, template.permissions]),
        ),
      }));
    });
  }, []);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedId),
    [members, selectedId],
  );
  const pendingEarnings = earnings
    .filter((item) => item.specialist_id === selectedId && !item.paid_at)
    .reduce((total, item) => total + item.amount_cents, 0);
  const payrollPending = earnings
    .filter((item) => !item.paid_at)
    .reduce((total, item) => total + item.amount_cents, 0);
  const payrollPaid = earnings
    .filter((item) => item.paid_at)
    .reduce((total, item) => total + item.amount_cents, 0);
  const weekStart = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date.getTime();
  }, []);
  const externalThisWeek = externalPayments.filter(
    (item) => new Date(item.created_at).getTime() >= weekStart,
  );
  const externalPaidThisWeek = externalThisWeek.reduce(
    (total, item) => total + item.amount_cents,
    0,
  );

  function selectMember(id: string) {
    setSelectedId(id);
    setSelectedServices(
      assignments
        .filter((item) => item.specialist_id === id)
        .map((item) => item.service_id),
    );
    setHours(hoursFor(id));
    const savedCompensation = compensations.find(
      (item) => item.specialist_id === id,
    );
    setCompensation({
      scheme: savedCompensation?.scheme ?? "per_service",
      frequency: savedCompensation?.frequency ?? "weekly",
      fixedAmount: savedCompensation
        ? String(savedCompensation.fixed_amount_cents / 100)
        : "",
      commissionPercent:
        savedCompensation?.commission_percent == null
          ? ""
          : String(savedCompensation.commission_percent),
    });
    setMessage("");
  }

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...invite,
          ...(invitePermissions.length === roleTemplates[invite.role].length &&
          invitePermissions.every((permission) =>
            roleTemplates[invite.role].includes(permission),
          )
            ? {}
            : { permissions: invitePermissions }),
        }),
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!response.ok) {
        setMessage(
          result.error || "No pudimos enviar la invitación. Intenta de nuevo.",
        );
        return;
      }
      const invitedId = result.id;
      if (!invitedId) {
        setMessage(
          "No recibimos confirmación de la invitación. Verifica el equipo antes de volver a intentarlo.",
        );
        return;
      }
      setMessage(
        "Invitación enviada. La persona recibirá un correo para crear su acceso.",
      );
      setMembers((current) => [
        ...current,
        {
          id: invitedId,
          full_name: invite.fullName,
          email: invite.email,
          role: invite.role,
          active: true,
          color: "#0f766e",
        },
      ]);
      setInvite({ fullName: "", email: "", role: "specialist" });
      setInvitePermissions(roleTemplates.specialist);
    } catch (error) {
      setMessage(
        error instanceof DOMException && error.name === "AbortError"
          ? "La invitación tardó demasiado. Verifica la conexión e intenta de nuevo."
          : "No pudimos comunicarnos para enviar la invitación. Intenta de nuevo.",
      );
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
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
      p_commissions: [],
      p_commission_percent:
        compensation.commissionPercent.trim() === ""
          ? null
          : Number(compensation.commissionPercent.replace(",", ".")),
    });
    setMessage(
      result.error
        ? result.error.message
        : "Disponibilidad y esquema de pago guardados.",
    );
    setBusy(false);
  }

  async function saveGlobalCommission() {
    const percent = Number(globalCommissionPercent.replace(",", "."));
    if (!Number.isFinite(percent) || percent < 0 || percent > 100)
      return setMessage("Escribe un porcentaje entre 0 y 100.");
    setBusy(true);
    setMessage("");
    const { error } = await createClient().rpc(
      "save_default_commission_percent",
      { p_percent: percent },
    );
    setBusy(false);
    setMessage(error?.message || "Porcentaje global de comisión guardado.");
  }

  async function payPendingEarnings() {
    if (
      !selectedId ||
      !pendingEarnings ||
      !window.confirm(
        `¿Cerrar y registrar $${(pendingEarnings / 100).toFixed(2)} como pagados en el corte dominical?`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    const { error } = await createClient().rpc(
      "pay_current_week_specialist_earnings",
      { p_specialist_id: selectedId },
    );
    setBusy(false);
    setMessage(
      error
        ? error.message
        : "Corte semanal registrado. Recarga la página para ver el saldo actualizado.",
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
    <div
      className={`team-workspace ${mode === "nomina" ? "payroll-workspace" : "personal-workspace"}`}
    >
      {mode === "personal" && (
        <>
          <RolePermissionManager />
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
                onChange={(event) => {
                  const role = event.target.value as ConfigurableRole;
                  setInvite({
                    ...invite,
                    role,
                  });
                  setInvitePermissions(roleTemplates[role]);
                }}
              >
                <option value="specialist">Especialista</option>
                <option value="reception">Recepción</option>
                <option value="manager">Gerencia</option>
              </select>
              <button className="new-booking" disabled={busy}>
                {busy ? "Enviando…" : "Enviar invitación"}
              </button>
            </form>
            <fieldset className="compensation-editor">
              <legend>Permisos del acceso</legend>
              <p>
                El rol propone una plantilla; puedes ajustarla antes de enviar
                la invitación.
              </p>
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.label} className="service-assignment">
                  <strong>{group.label}</strong>
                  {group.permissions.map((permission) => (
                    <label key={permission.id}>
                      <input
                        type="checkbox"
                        checked={invitePermissions.includes(permission.id)}
                        onChange={() =>
                          setInvitePermissions((current) =>
                            current.includes(permission.id)
                              ? current.filter((id) => id !== permission.id)
                              : [...current, permission.id],
                          )
                        }
                      />
                      <span>{permission.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </fieldset>
          </section>
        </>
      )}
      {mode === "nomina" && (
        <section className="payroll-summary" aria-label="Resumen de nómina">
          <article>
            <span>POR PAGAR</span>
            <strong>${(payrollPending / 100).toFixed(2)}</strong>
            <small>Comisiones pendientes</small>
          </article>
          <article>
            <span>PAGADO</span>
            <strong>${(payrollPaid / 100).toFixed(2)}</strong>
            <small>Pagos registrados</small>
          </article>
          <article>
            <span>EXTERNOS PAGADOS</span>
            <strong>${(externalPaidThisWeek / 100).toFixed(2)}</strong>
            <small>Liquidado esta semana</small>
          </article>
        </section>
      )}
      {mode === "nomina" && (
        <aside className="payroll-cutoff-note">
          <strong>Corte semanal: domingo</strong>
          <span>
            El equipo acumula comisiones durante la semana y se paga en el corte
            dominical. Los prestadores externos se liquidan al finalizar cada
            servicio y se reportan aquí como pagos inmediatos.
          </span>
        </aside>
      )}
      {mode === "nomina" && (
        <section className="settings-card external-payments-card">
          <div className="section-top">
            <div>
              <p className="eyebrow">PAGOS INMEDIATOS</p>
              <h2>Prestadores externos</h2>
              <p>
                Ya fueron liquidados al finalizar sus servicios; no esperan al
                domingo.
              </p>
            </div>
            <strong>{externalThisWeek.length} esta semana</strong>
          </div>
          {externalThisWeek.length ? (
            <div className="external-payment-list">
              {externalThisWeek.slice(0, 8).map((payment) => (
                <div key={payment.id}>
                  <span>
                    <strong>
                      {payment.external_provider_name || "Prestador externo"}
                    </strong>
                    <small>
                      {payment.description} ·{" "}
                      {payment.payment_method === "cash"
                        ? "Efectivo"
                        : payment.payment_method === "card"
                          ? "Tarjeta"
                          : "Transferencia"}
                    </small>
                  </span>
                  <b>${(payment.amount_cents / 100).toFixed(2)}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-services">
              No hay pagos a externos registrados esta semana.
            </p>
          )}
        </section>
      )}
      {mode === "nomina" && (
        <section className="settings-card compensation-default-card">
          <p className="eyebrow">COMISIONES</p>
          <h2>Porcentaje predeterminado</h2>
          <p>
            Se aplica automáticamente al equipo y a prestadores externos. Cada
            especialista puede usar un porcentaje distinto.
          </p>
          <div className="compensation-default-input">
            <label>
              Porcentaje global
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={globalCommissionPercent}
                onChange={(event) =>
                  setGlobalCommissionPercent(event.target.value)
                }
              />
            </label>
            <button
              type="button"
              className="new-booking"
              disabled={busy}
              onClick={saveGlobalCommission}
            >
              Guardar porcentaje
            </button>
          </div>
        </section>
      )}
      <section className="team-configuration">
        <aside className="settings-card member-list">
          <div className="section-top">
            <div>
              <h2>
                {mode === "nomina"
                  ? "Saldos por especialista"
                  : "Especialistas"}
              </h2>
              <p>
                {mode === "nomina"
                  ? "Selecciona una persona para revisar y pagar"
                  : `${specialists.length} de 10 accesos activos`}
              </p>
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
              <p className="eyebrow">
                {mode === "nomina"
                  ? "NÓMINA Y COMISIONES"
                  : "PERSONAL Y DISPONIBILIDAD"}
              </p>
              <h2>
                {selectedMember
                  ? selectedMember.full_name
                  : "Selecciona una especialista"}
              </h2>
              {selectedMember?.email && (
                <p className="member-email">{selectedMember.email}</p>
              )}
            </div>
            {selectedMember && mode === "personal" && (
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
                {mode === "nomina"
                  ? "Revisa el porcentaje aplicado y cierra el pago semanal los domingos. Los externos se liquidan al finalizar cada servicio."
                  : "Indica qué puede atender y sus horas disponibles."}
              </p>
              {mode === "nomina" && compensation.scheme !== "fixed_period" && (
                <div className="pending-earnings">
                  <span>Comisiones del equipo pendientes</span>
                  <strong>${(pendingEarnings / 100).toFixed(2)} MXN</strong>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || !pendingEarnings}
                    onClick={payPendingEarnings}
                  >
                    Cerrar pago dominical
                  </button>
                </div>
              )}
              {mode === "nomina" && (
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
                  {compensation.scheme !== "fixed_period" && (
                    <label>
                      Porcentaje de comisión
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={compensation.commissionPercent}
                        onChange={(event) =>
                          setCompensation({
                            ...compensation,
                            commissionPercent: event.target.value,
                          })
                        }
                        placeholder={`Global: ${globalCommissionPercent}%`}
                      />
                      <small>
                        Déjalo vacío para usar el porcentaje global.
                      </small>
                    </label>
                  )}
                </fieldset>
              )}
              {mode === "personal" && (
                <>
                  <div className="commission-services-heading">
                    <strong>Servicios que atiende</strong>
                    <small>
                      La comisión se calcula con su porcentaje sobre el importe
                      final cobrado; no necesitas definir un monto por servicio.
                    </small>
                  </div>
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
                            {categoryName(service)} · {service.duration_minutes}{" "}
                            min
                          </small>
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
                    {busy ? "Guardando…" : "Guardar disponibilidad"}
                  </button>
                </>
              )}
              {mode === "nomina" && (
                <button
                  className="new-booking"
                  onClick={saveAvailability}
                  disabled={busy}
                >
                  {busy ? "Guardando…" : "Guardar esquema de pago"}
                </button>
              )}
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
