import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Image from "next/image";
import { createServerClient } from "@/lib/supabase/server";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { WhatsappFab } from "@/components/WhatsappFab";
import { SiteNav } from "@/components/SiteNav";
import { TestimonialCarousel } from "@/components/TestimonialCarousel";
import { SiteFooter } from "@/components/SiteFooter";
import { BackToTop } from "@/components/BackToTop";
import { intlLocale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

const SERVICE_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

function getServiceImage(slug: string): string | null {
  for (const ext of SERVICE_IMAGE_EXTENSIONS) {
    const filePath = path.join(process.cwd(), "public", "services", `${slug}.${ext}`);
    if (fs.existsSync(filePath)) return `/services/${slug}.${ext}`;
  }
  return null;
}

export default async function Home() {
  const locale = await getLocale();
  const t = dictionary[locale];
  const money = new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
  const supabase = await createServerClient();
  const { data: categories } = await supabase
    .from("service_categories")
    .select("name, slug, services(id, name, duration_minutes, price_cents, online_bookable, sort_order)")
    .eq("active", true)
    .neq("slug", "borrar")
    .order("sort_order");

  return (
    <main className="public-site">
      <AnnouncementBar locale={locale} />
      <SiteNav locale={locale} />

      <section className="hero">
        <Image src="/hero/CRM_Nochevieja_V3.png" alt="" fill priority className="hero-photo" sizes="100vw" />
        <div className="hero-scrim" aria-hidden="true"></div>
        <div className="hero-copy">
          <p className="eyebrow">{t.hero.eyebrow}</p>
          <h1>{t.hero.titleLine1}<br /><em>{t.hero.titleEm}</em></h1>
          <p className="hero-text">{t.hero.text}</p>
          <div className="hero-cta">
            <Link className="hero-book-button" href="/reservar">
              <span>{t.hero.cta}</span>
              <b aria-hidden="true">→</b>
            </Link>
            <a className="hero-explore-button" href="#servicios">
              <span>{t.hero.exploreLink}</span>
              <b aria-hidden="true">↓</b>
            </a>
          </div>
          <a className="hero-rating" href="#resenas"><span className="hero-rating-stars" aria-hidden="true">★★★★★</span><span>{t.hero.ratingText}</span></a>
        </div>
      </section>

      <section id="servicios" className="services section-shell">
        <div className="section-heading"><p className="eyebrow">{t.services.eyebrow}</p><h2>{t.services.titleLine1}<br />{t.services.titleLine2}</h2><p>{t.services.subtitle}</p></div>
        <div className="service-grid">{categories?.map((category, index) => {
          const bookableServices = category.services.filter((service) => service.online_bookable);
          const cheapest = bookableServices.length ? Math.min(...bookableServices.map((service) => service.price_cents)) : null;
          const image = getServiceImage(category.slug);
          return (
            <Link aria-label={`${t.services.cta}: ${category.name}`} className="service-card" href={`/reservar?category=${encodeURIComponent(category.name)}`} key={category.slug}>
              <div className="service-card-media">
                {image ? (
                  <Image src={image} alt={category.name} fill sizes="(max-width:620px) 100vw, (max-width:1024px) 50vw, 33vw" className="service-card-image" />
                ) : (
                  <div className={`service-card-placeholder service-card-placeholder-${index % 3}`} aria-hidden="true"></div>
                )}
              </div>
              <span className="service-number">{String(index + 1).padStart(2, "0")}</span>
              <h3>{category.name}</h3>
              <p>{t.descriptions[category.slug] ?? t.services.fallbackDescription}</p>
              {cheapest !== null && <p className="service-price-from">{t.services.from} <strong>{money.format(cheapest / 100)}</strong></p>}
              <span className="service-card-cta">{t.services.cta} <b aria-hidden="true">→</b></span>
            </Link>
          );
        })}</div>
      </section>

      <section id="resenas" className="reviews-carousel section-shell">
        <p className="eyebrow center">{t.reviews.eyebrow}</p>
        <h2 className="center">{t.reviews.titleLine1} <em>{t.reviews.titleEm}</em></h2>
        <TestimonialCarousel locale={locale} />
      </section>

      <section id="journal" className="journal section-shell">
        <div className="journal-heading"><div><p className="eyebrow">{t.journal.eyebrow}</p><h2>{t.journal.titleLine1}<br /><em>{t.journal.titleEm}</em></h2></div><a href="#journal">{t.journal.viewAll} <span>→</span></a></div>
        <div className="article-grid">{t.journal.items.map((article, index) => (
          <article key={article.title}>
            <div className={`article-art article-art-${index}`}></div>
            <p>{article.tag}</p>
            <h3>{article.title}</h3>
            <a href="#journal">{t.journal.readStory} <span>→</span></a>
          </article>
        ))}</div>
      </section>

      <section className="map-section">
        <iframe
          src={`https://www.google.com/maps?q=${encodeURIComponent("Ola Bonita Beauty Spa Massage, Guanajuato 655, Brisas de Zicatela, 70934 Puerto Escondido, Oaxaca, México")}&output=embed`}
          width="100%"
          height="450"
          style={{ border: 0 }}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          title={t.map.title}
        ></iframe>
        <a className="map-directions" href="https://maps.app.goo.gl/AVLtoHh43jNqnaFV9" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.4" /></svg>
          {t.map.directions}
        </a>
      </section>

      <SiteFooter locale={locale} />
      <WhatsappFab locale={locale} />
      <BackToTop locale={locale} />
      <Link className="mobile-reserve-bar" href="/reservar">
        <span>{t.nav.reserve}</span><b aria-hidden="true">→</b>
      </Link>
    </main>
  );
}
