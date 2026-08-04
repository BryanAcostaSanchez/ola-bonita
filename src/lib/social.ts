import type { Locale } from "@/lib/i18n/locale";

export const WHATSAPP_NUMBER = "529542010059";

export function getWhatsappLink(locale: Locale, customMessage?: string) {
  const message = customMessage ?? (locale === "es"
    ? "Hola, quiero agendar una cita en Ola Bonita Beauty Spa. ¿Me pueden ayudar?"
    : "Hello, I would like to book an appointment at Ola Bonita Beauty Spa. Could you help me?");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/olabonita_beauty_spa/",
  facebook: "https://www.facebook.com/profile.php?id=100064643155875",
  tiktok: "https://www.tiktok.com/@olabonitaspa",
  whatsapp: getWhatsappLink("es"),
};
