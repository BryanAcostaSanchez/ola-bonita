import Link from "next/link";
import Image from "next/image";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { WhatsappFab } from "@/components/WhatsappFab";
import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = dictionary[locale];
  const updatedOn = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", { year: "numeric", month: "long", day: "numeric" }).format(new Date());

  return (
    <main className="booking-page public-site">
      <header className="booking-header">
        <Link href="/" className="brand brand-logo"><Image src="/brand/ola-bonita.png" alt="Ola Bonita Beauty Spa" width={80} height={80} priority /></Link>
        <Link className="text-link" href="/">← {t.privacy.backHome}</Link>
      </header>
      <section className="privacy-page">
        <div className="privacy-template-notice">
          <strong>{t.privacy.templateNoticeTitle}</strong>
          <p>{t.privacy.templateNoticeBody}</p>
        </div>
        <h1>{t.privacy.title}</h1>
        <p className="privacy-intro">{t.privacy.intro}</p>
        {t.privacy.sections.map((section) => (
          <div className="privacy-section" key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </div>
        ))}
        <p className="privacy-updated">{updatedOn}</p>
      </section>
      <LanguageSwitcher locale={locale} />
      <WhatsappFab locale={locale} />
    </main>
  );
}
