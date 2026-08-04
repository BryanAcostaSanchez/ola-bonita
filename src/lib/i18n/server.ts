import { cookies } from "next/headers";
import { LANG_COOKIE, type Locale } from "./locale";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return store.get(LANG_COOKIE)?.value === "es" ? "es" : "en";
}
