import Link from "next/link";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { WhatsappFab } from "@/components/WhatsappFab";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";

export default async function BookingResultPage({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const { booking } = await searchParams;
  const locale = await getLocale();
  const t = dictionary[locale].result;
  return <main className="booking-page public-site"><AnnouncementBar locale={locale} /><header className="booking-header"><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link></header><section className="booking-result"><p className="eyebrow">{t.eyebrow}</p><h1>{t.titlePrefix}<br />{t.titleMiddle} <em>{t.titleEm}</em></h1><p>{t.text}</p>{booking && <strong>#{booking}</strong>}<Link className="button" href="/">{t.backHome} <span>→</span></Link></section><LanguageSwitcher locale={locale} /><WhatsappFab locale={locale} /></main>;
}
