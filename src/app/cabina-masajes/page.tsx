import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { CabinBooking } from "./cabin-booking";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { WhatsappFab } from "@/components/WhatsappFab";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";
export const dynamic = "force-dynamic";
export default async function CabinPage(){
  const {data:space}=await createAdminClient().from("rental_spaces").select("name,price_cents,booking_duration_minutes,deposit_enabled,deposit_percent,active").eq("slug","cabina-masajes").maybeSingle();
  if(!space?.active)notFound();
  const locale = await getLocale();
  const t = dictionary[locale].cabin;
  return <main className="cabin-page public-site"><AnnouncementBar locale={locale} /><section><p className="eyebrow">{t.eyebrow}</p><h1>{t.titlePrefix}<br/><em>{t.titleEm}</em></h1><p>{t.text}</p><div className="cabin-facts"><span>{t.perBooking(space.booking_duration_minutes)}</span><strong>${(space.price_cents/100).toFixed(0)} MXN</strong>{space.deposit_enabled&&<span>{t.depositLabel(space.deposit_percent)}</span>}</div><CabinBooking priceCents={space.price_cents} depositEnabled={space.deposit_enabled} depositPercent={space.deposit_percent} locale={locale}/></section><LanguageSwitcher locale={locale} /><WhatsappFab locale={locale} /></main>;
}
