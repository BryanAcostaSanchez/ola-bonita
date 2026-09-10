import Link from "next/link";
import { WhatsappFab } from "@/components/WhatsappFab";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";
import { BookingWhatsappRedirect } from "./booking-whatsapp-redirect";

export default async function BookingResultPage({ searchParams }: { searchParams: Promise<{ booking?: string; status?: string; collection_status?: string; gateway?: string; result?: string }> }) {
  const { booking, status, collection_status: collectionStatus, gateway, result } = await searchParams;
  const locale = await getLocale();
  const t = dictionary[locale].result;
  const paymentSucceeded = status === "approved" || collectionStatus === "approved" || (gateway === "clip" && result === "success");
  const paymentFailed = gateway === "clip" && result === "failed";
  const message = paymentFailed ? (locale === "es" ? "El pago no se completó. Puedes volver a reservar o contactar a Ola Bonita para ayudarte." : "The payment was not completed. You can book again or contact Ola Bonita for help.") : t.text;
  return <main className="booking-page public-site"><BookingWhatsappRedirect paymentApproved={paymentSucceeded} /><header className="booking-header"><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link><LanguageSwitcher locale={locale} /></header><section className="booking-result"><p className="eyebrow">{t.eyebrow}</p><h1>{t.titlePrefix}<br />{t.titleMiddle} <em>{t.titleEm}</em></h1><p>{message}</p>{booking && <strong>#{booking}</strong>}<Link className="button" href="/">{t.backHome} <span>→</span></Link></section><WhatsappFab locale={locale} /></main>;
}
