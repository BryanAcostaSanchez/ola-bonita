import Link from "next/link";
import Image from "next/image";
import { createServerClient } from "@/lib/supabase/server";
import { BookingServicePicker } from "./service-picker";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { WhatsappFab } from "@/components/WhatsappFab";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

export default async function BookingPage({ searchParams }: { searchParams: Promise<{ service?: string; category?: string }> }) {
  const { service, category } = await searchParams;
  const locale = await getLocale();
  const t = dictionary[locale];
  const supabase = await createServerClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name, duration_minutes, price_cents, deposit_enabled, deposit_percent, category:service_categories(name)")
    .eq("active", true)
    .eq("online_bookable", true)
    .order("sort_order");
  const { data: bookingSettings } = await supabase.rpc("get_public_booking_settings");
  return (
    <main className="booking-page public-site">
      <AnnouncementBar locale={locale} />
      <header className="booking-header"><Link href="/" className="brand brand-logo"><Image src="/brand/ola-bonita.png" alt="Ola Bonita Beauty Spa" width={80} height={80} priority /></Link><Link className="text-link" href="/">← {t.booking.backToSite}</Link></header>
      <section className="booking-layout">
        <div className="booking-intro"><p className="eyebrow">{t.booking.eyebrow}</p><h1>{t.booking.titlePrefix}<br />{t.booking.titleMiddle} <em>{t.booking.titleEm}</em></h1><p>{t.booking.intro}</p><div className="booking-note"><strong>{t.booking.depositTitle}</strong><span>{t.booking.depositText}</span></div></div>
        <BookingServicePicker services={services ?? []} settings={bookingSettings?.[0] ?? null} locale={locale} preselectedServiceId={service} preselectedCategory={category} />
      </section>
      <LanguageSwitcher locale={locale} />
      <WhatsappFab locale={locale} />
    </main>
  );
}
