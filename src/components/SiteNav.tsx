"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import type { Locale } from "@/lib/i18n/locale";
import { dictionary } from "@/lib/i18n/dictionary";

export function SiteNav({ locale }: { locale: Locale }) {
  const t = dictionary[locale].nav;
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#servicios", label: t.services },
    { href: "#resenas", label: t.reviews },
    { href: "#journal", label: t.journal },
  ];
  const close = () => setOpen(false);

  return (
    <nav className="nav-shell">
      <Link href="/" className="brand brand-logo" aria-label="Ola Bonita inicio" onClick={close}>
        <Image src="/brand/ola-bonita.png" alt="Ola Bonita Beauty Spa" width={96} height={96} priority />
      </Link>
      <div className={open ? "nav-actions nav-open" : "nav-actions"}>
        {links.map((link) => <a key={link.href} href={link.href} onClick={close}>{link.label}</a>)}
        <Link className="button button-small" href="/reservar" onClick={close}>{t.reserve}</Link>
      </div>
      <div className="nav-utilities">
        <LanguageSwitcher locale={locale} />
        <button
          type="button"
          className="nav-menu-button"
          aria-label={open ? t.closeMenu : t.openMenu}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
          )}
        </button>
      </div>
    </nav>
  );
}
