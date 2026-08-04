export const PERMISSIONS = [
  "agenda.view", "agenda.manage", "bookings.assign", "bookings.complete",
  "operations.pos", "operations.cash", "operations.expenses", "analytics.view",
  "settings.agenda", "settings.catalog", "settings.finance", "settings.cabin",
  "settings.payments", "team.manage", "team.compensation", "commissions.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_GROUPS: Array<{ label: string; permissions: Array<{ id: Permission; label: string }> }> = [
  { label: "Agenda", permissions: [{ id: "agenda.view", label: "Ver agenda" }, { id: "agenda.manage", label: "Editar citas" }, { id: "bookings.assign", label: "Asignar especialistas" }, { id: "bookings.complete", label: "Finalizar citas" }] },
  { label: "Operación", permissions: [{ id: "operations.pos", label: "Ventas" }, { id: "operations.cash", label: "Caja" }, { id: "operations.expenses", label: "Gastos" }, { id: "analytics.view", label: "Analítica" }] },
  { label: "Configuración", permissions: [{ id: "settings.agenda", label: "Agenda web" }, { id: "settings.catalog", label: "Catálogo" }, { id: "settings.finance", label: "Finanzas" }, { id: "settings.cabin", label: "Cabina" }, { id: "settings.payments", label: "Pagos" }] },
  { label: "Equipo", permissions: [{ id: "team.manage", label: "Disponibilidad" }, { id: "team.compensation", label: "Pagos al equipo" }, { id: "commissions.manage", label: "Ajustar comisiones" }] },
];

export const defaultPermissionsByRole: Record<"manager" | "reception" | "specialist", Permission[]> = {
  manager: PERMISSIONS.slice(),
  reception: ["agenda.view", "agenda.manage", "bookings.assign", "bookings.complete", "operations.pos", "operations.cash", "operations.expenses", "analytics.view", "settings.agenda", "settings.catalog", "settings.finance", "settings.payments"],
  specialist: ["agenda.view"],
};

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}
