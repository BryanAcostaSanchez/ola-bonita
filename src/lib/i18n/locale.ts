export type Locale = "es" | "en";
export const LANG_COOKIE = "ola_lang";

export function intlLocale(locale: Locale) {
  return locale === "en" ? "en-US" : "es-MX";
}
