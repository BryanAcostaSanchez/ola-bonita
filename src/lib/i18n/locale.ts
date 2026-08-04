export type Locale = "es" | "en";
// Versioned so a prior Spanish preference does not override the new English default.
export const LANG_COOKIE = "ola_lang_v2";

export function intlLocale(locale: Locale) {
  return locale === "en" ? "en-US" : "es-MX";
}
