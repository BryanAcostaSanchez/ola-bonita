"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

type SettingsSection = {
  id: string;
  group: string;
  label: string;
  detail: string;
};

type SettingsShellProps = {
  activeSection: string;
  profileRole: string;
  sections: SettingsSection[];
  children: ReactNode;
};

export function SettingsShell({ activeSection, profileRole, sections, children }: SettingsShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <main className={`settings-app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="settings-primary-sidebar">
        <Link href="/" className="settings-brand" aria-label="Ir al sitio web de Ola Bonita">
          <span>Ola Bonita</span>
          <small>BEAUTY SPA</small>
        </Link>

        <button
          type="button"
          className="settings-collapse"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expandir menú general" : "Colapsar menú general"}
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
        >
          <span aria-hidden="true">‹</span>
          <b>Colapsar</b>
        </button>

        <nav className="settings-primary-nav" aria-label="Navegación principal">
          <Link href="/app"><i>▦</i><span>Agenda</span></Link>
          <Link href="/app/operacion"><i>◇</i><span>Ventas y caja</span></Link>
          <Link href="/app/analitica"><i>◔</i><span>Analítica</span></Link>
          <Link href="/app/configuracion" className="active"><i>⚙</i><span>Configuración</span></Link>
        </nav>

        <div className="settings-primary-user">
          <span className="avatar">{profileRole.slice(0, 2).toUpperCase()}</span>
          <div><strong>Ola Bonita</strong><small>Configuración</small></div>
        </div>
      </aside>

      <aside className="settings-secondary-sidebar">
        <div className="settings-secondary-heading">
          <p className="eyebrow">CONFIGURACIÓN</p>
          <h2>Organiza tu negocio</h2>
          <p>Cada área tiene sus propios ajustes.</p>
        </div>
        <nav aria-label="Secciones de configuración">
          {sections.map((section, index) => (
            <div className="settings-nav-group" key={section.id}>
              {(index === 0 || sections[index - 1].group !== section.group) && <span>{section.group}</span>}
              <Link href={`/app/configuracion?seccion=${section.id}`} className={activeSection === section.id ? "active" : ""}>
                <strong>{section.label}</strong>
                <small>{section.detail}</small>
              </Link>
            </div>
          ))}
        </nav>
      </aside>

      <section className="settings-panel">
        <div className="settings-content">{children}</div>
      </section>
    </main>
  );
}
