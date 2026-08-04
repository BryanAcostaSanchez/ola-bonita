import Link from "next/link";
import Image from "next/image";
import type { Locale } from "@/lib/i18n/locale";
import { dictionary } from "@/lib/i18n/dictionary";
import { getWhatsappLink, SOCIAL_LINKS } from "@/lib/social";

function InstagramIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" /></svg>;
}
function FacebookIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-8h2.68l.4-3.1h-3.08V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.63C15.9 3.5 15 3.4 14 3.4c-2.2 0-3.7 1.34-3.7 3.8v2.7H7.6v3.1h2.7v8h3.2Z" /></svg>;
}
function TiktokIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 3h-3.1v12.4a2.7 2.7 0 1 1-2.1-2.63V9.6a5.9 5.9 0 1 0 5.2 5.86V9.2a6.9 6.9 0 0 0 4.1 1.33V7.4a3.9 3.9 0 0 1-4.1-3.9V3Z" /></svg>;
}
function WhatsappIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.868-2.03-.967-.273-.099-.472-.148-.67.15-.198.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12.004 2C6.486 2 2 6.486 2 12.004c0 1.85.497 3.647 1.442 5.226L2 22l4.916-1.412a9.98 9.98 0 0 0 5.088 1.392c5.518 0 10.004-4.486 10.004-10.004S17.522 2 12.004 2Zm0 18.187a8.16 8.16 0 0 1-4.163-1.14l-.298-.177-2.917.838.85-2.844-.194-.293a8.174 8.174 0 0 1-1.278-4.567c0-4.516 3.674-8.19 8.19-8.19 4.517 0 8.19 3.674 8.19 8.19 0 4.517-3.673 8.183-8.19 8.183Z" /></svg>;
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = dictionary[locale];
  const whatsappLink = getWhatsappLink(locale);
  const socials = [
    { key: "instagram", label: "Instagram", url: SOCIAL_LINKS.instagram, icon: <InstagramIcon /> },
    { key: "facebook", label: "Facebook", url: SOCIAL_LINKS.facebook, icon: <FacebookIcon /> },
    { key: "tiktok", label: "TikTok", url: SOCIAL_LINKS.tiktok, icon: <TiktokIcon /> },
    { key: "whatsapp", label: t.footer.whatsapp, url: whatsappLink, icon: <WhatsappIcon /> },
  ];

  return (
    <footer className="site-footer">
      <div className="footer-top">
        <Link href="/" className="brand brand-logo footer-brand"><Image src="/brand/ola-bonita.png" alt="Ola Bonita Beauty Spa" width={92} height={92} /></Link>
        <div className="footer-social">
          {socials.map((social) => (
            <a key={social.key} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.label}>{social.icon}</a>
          ))}
        </div>
      </div>

      <div className="footer-contact">
        <strong>{t.footer.rights}</strong>
        <span>{t.visit.address}, {t.visit.city}</span>
        <span><a href="tel:+529542010059">+52 954 201 0059</a> · <a href={whatsappLink} target="_blank" rel="noopener noreferrer">{t.footer.whatsapp}</a></span>
        <span>{t.visit.weekdays} {t.visit.weekdaysHours} · {t.visit.weekend} {t.visit.weekendHours}</span>
      </div>

      <div className="footer-bottom">
        <span>{t.footer.rightsLine(new Date().getFullYear())}</span>
        <Link href="/aviso-de-privacidad">{t.footer.privacy}</Link>
      </div>
    </footer>
  );
}
