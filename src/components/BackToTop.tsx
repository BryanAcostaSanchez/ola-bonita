"use client";

import type { Locale } from "@/lib/i18n/locale";
import { dictionary } from "@/lib/i18n/dictionary";

export function BackToTop({ locale }: { locale: Locale }) {
  const t = dictionary[locale].footer;
  return (
    <button
      type="button"
      className="back-to-top"
      aria-label={t.backToTop}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
    </button>
  );
}
