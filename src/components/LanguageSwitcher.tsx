"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANG_COOKIE, type Locale } from "@/lib/i18n/locale";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function chooseLocale(next: Locale) {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000`;
    setOpen(false);
    router.refresh();
  }

  return (
    <div className={`lang-switcher${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="lang-toggle"
        aria-label="Cambiar idioma"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{locale === "en" ? "🇺🇸" : "🇲🇽"}</span>
        <b>{locale.toUpperCase()}</b>
      </button>
      <div className="lang-options" role="menu">
        <button
          type="button"
          role="menuitemradio"
          aria-checked={locale === "es"}
          className={locale === "es" ? "active" : ""}
          onClick={() => chooseLocale("es")}
        >
          <span aria-hidden="true">🇲🇽</span> ES
        </button>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={locale === "en"}
          className={locale === "en" ? "active" : ""}
          onClick={() => chooseLocale("en")}
        >
          <span aria-hidden="true">🇺🇸</span> EN
        </button>
      </div>
    </div>
  );
}
