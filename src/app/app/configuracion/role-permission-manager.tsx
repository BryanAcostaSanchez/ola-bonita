"use client";

import { useEffect, useState } from "react";
import { defaultPermissionsByRole, PERMISSION_GROUPS, type Permission } from "@/lib/permissions";

type Role = "manager" | "reception" | "specialist";
type Template = { role: Role; permissions: Permission[] };
const roles: Role[] = ["specialist", "reception", "manager"];
const labels: Record<Role, { title: string; detail: string }> = {
  specialist: { title: "Especialista", detail: "Atiende y consulta su agenda" },
  reception: { title: "Recepción", detail: "Coordina agenda y cobros" },
  manager: { title: "Gerencia", detail: "Opera y configura el negocio" },
};
const defaults = Object.fromEntries(roles.map((role) => [role, defaultPermissionsByRole[role]])) as Record<Role, Permission[]>;

export function RolePermissionManager() {
  const [templates, setTemplates] = useState(defaults);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { void fetch("/api/role-permissions").then(async (response) => { if (!response.ok) return setAllowed(false); const result = await response.json() as { templates?: Template[] }; if (result.templates) setTemplates(Object.fromEntries(roles.map((role) => [role, result.templates?.find((template) => template.role === role)?.permissions ?? defaultPermissionsByRole[role]])) as Record<Role, Permission[]>); setAllowed(true); }).catch(() => setAllowed(false)); }, []);
  const toggle = (role: Role, permission: Permission) => setTemplates((current) => ({ ...current, [role]: current[role].includes(permission) ? current[role].filter((item) => item !== permission) : [...current[role], permission] }));
  async function saveAll() {
    setSaving(true); setMessage("");
    const results = await Promise.all(roles.map(async (role) => fetch("/api/role-permissions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, permissions: templates[role] }) })));
    setSaving(false); setMessage(results.every((response) => response.ok) ? "Plantillas de permisos guardadas. Las nuevas invitaciones usarán estos accesos." : "No pudimos guardar todas las plantillas. Inténtalo de nuevo.");
  }
  if (allowed !== true) return null;
  return <section className="settings-card role-permission-manager"><div className="section-top"><div><p className="eyebrow">ACCESOS POR ROL</p><h2>Define qué puede hacer cada rol</h2><p>Las personas heredan esta plantilla al ser invitadas. Administración mantiene acceso total.</p></div><button type="button" className="new-booking" disabled={saving} onClick={saveAll}>{saving ? "Guardando…" : "Guardar permisos"}</button></div><div className="role-permission-matrix"><div className="role-matrix-header"><span>Permiso</span>{roles.map((role) => <span key={role}><strong>{labels[role].title}</strong><small>{labels[role].detail}</small></span>)}</div>{PERMISSION_GROUPS.map((group) => <div className="role-matrix-group" key={group.label}><strong>{group.label}</strong>{group.permissions.map((permission) => <div className="role-matrix-row" key={permission.id}><span>{permission.label}</span>{roles.map((role) => <label key={role} title={`${labels[role].title}: ${permission.label}`}><input type="checkbox" checked={templates[role].includes(permission.id)} onChange={() => toggle(role, permission.id)}/><i aria-hidden="true"/></label>)}</div>)}</div>)}</div>{message && <p className="settings-message" role="status">{message}</p>}</section>;
}
