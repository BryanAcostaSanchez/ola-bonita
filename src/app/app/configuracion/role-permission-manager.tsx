"use client";

import { useEffect, useState } from "react";
import { defaultPermissionsByRole, PERMISSION_GROUPS, type Permission } from "@/lib/permissions";

type Role = "manager" | "reception" | "specialist";
type Template = { role: Role; permissions: Permission[] };

const roleLabels: Record<Role, string> = {
  manager: "Gerencia",
  reception: "Recepción",
  specialist: "Especialista",
};

const defaults = Object.fromEntries((Object.keys(roleLabels) as Role[]).map((role) => [role, defaultPermissionsByRole[role]])) as Record<Role, Permission[]>;

export function RolePermissionManager() {
  const [templates, setTemplates] = useState(defaults);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState<Role | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/role-permissions").then(async (response) => {
      if (!response.ok) return setAllowed(false);
      const result = await response.json() as { templates?: Template[] };
      if (result.templates) setTemplates(Object.fromEntries((Object.keys(roleLabels) as Role[]).map((role) => [role, result.templates?.find((template) => template.role === role)?.permissions ?? defaultPermissionsByRole[role]])) as Record<Role, Permission[]>);
      setAllowed(true);
    }).catch(() => setAllowed(false));
  }, []);

  async function save(role: Role) {
    setSaving(role);
    setMessage("");
    const response = await fetch("/api/role-permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, permissions: templates[role] }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setSaving(null);
    setMessage(response.ok ? `Permisos de ${roleLabels[role]} guardados. Se aplican a los accesos sin excepciones individuales.` : result.error || "No pudimos guardar los permisos.");
  }

  if (allowed !== true) return null;
  return <section className="settings-card role-permission-manager">
    <div className="section-top"><div><p className="eyebrow">ACCESOS</p><h2>Permisos por rol</h2><p>Activa sólo lo que cada rol necesita. Administración siempre conserva acceso total.</p></div></div>
    <div className="role-permission-grid">
      {(Object.keys(roleLabels) as Role[]).map((role) => <section className="role-permission-card" key={role}>
        <div><h3>{roleLabels[role]}</h3><p>{templates[role].length} permisos activos</p></div>
        {PERMISSION_GROUPS.map((group) => <fieldset key={group.label}><legend>{group.label}</legend>{group.permissions.map((permission) => {
          const enabled = templates[role].includes(permission.id);
          return <label className="permission-switch" key={permission.id}><span>{permission.label}</span><input type="checkbox" checked={enabled} onChange={() => setTemplates((current) => ({ ...current, [role]: enabled ? current[role].filter((id) => id !== permission.id) : [...current[role], permission.id] }))}/><i aria-hidden="true"/></label>;
        })}</fieldset>)}
        <button type="button" className="secondary-operation" disabled={saving !== null} onClick={() => save(role)}>{saving === role ? "Guardando…" : `Guardar ${roleLabels[role]}`}</button>
      </section>)}
    </div>
    {message && <p className="settings-message" role="status">{message}</p>}
  </section>;
}
