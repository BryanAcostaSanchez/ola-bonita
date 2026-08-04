"use client";

import { useRouter } from "next/navigation";
import { LANG_COOKIE, type Locale } from "@/lib/i18n/locale";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const nextLocale: Locale = locale === "es" ? "en" : "es";
  const nextLanguage = nextLocale === "en" ? "inglés" : "español";

  function changeLanguage() {
    document.cookie = `${LANG_COOKIE}=${nextLocale}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <button type="button" className="language-toggle" aria-label={`Cambiar idioma a ${nextLanguage}`} onClick={changeLanguage}>
      <span aria-hidden="true">{nextLocale === "en" ? "🇺🇸" : "🇲🇽"}</span><b>{nextLocale.toUpperCase()}</b>
    </button>
  );
}
