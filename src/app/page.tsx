import Link from "next/link";
import Image from "next/image";
import { createServerClient } from "@/lib/supabase/server";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { WhatsappFab } from "@/components/WhatsappFab";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteNav } from "@/components/SiteNav";
import { TestimonialCarousel } from "@/components/TestimonialCarousel";
import { intlLocale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

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
    .select("name, slug, services(name, duration_minutes, price_cents, online_bookable, sort_order)")
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
          <div className="hero-cta"><Link className="button" href="/reservar">{t.hero.cta} <span>→</span></Link><a className="text-link" href="#servicios">{t.hero.exploreLink}</a></div>
          <a className="hero-rating" href="#resenas"><span className="hero-rating-stars" aria-hidden="true">★★★★★</span><span>{t.hero.ratingText}</span></a>
        </div>
      </section>

      <section id="servicios" className="services section-shell">
        <div className="section-heading"><p className="eyebrow">{t.services.eyebrow}</p><h2>{t.services.titleLine1}<br />{t.services.titleLine2}</h2><p>{t.services.subtitle}</p></div>
        <div className="service-grid">{categories?.map((category, index) => {
          const services = category.services
            .filter((service) => service.online_bookable)
            .sort((a, b) => a.sort_order - b.sort_order)
            .slice(0, 3);
          return <article className="service-card" key={category.slug}><span className="service-number">{String(index + 1).padStart(2, "0")}</span><h3>{category.name}</h3><p>{t.descriptions[category.slug] ?? t.services.fallbackDescription}</p><ul>{services.map((service) => <li key={service.name}>{service.name} · {service.duration_minutes} min · {money.format(service.price_cents / 100)}</li>)}</ul><Link href="/reservar">{t.services.cta} <span>→</span></Link></article>;
        })}</div>
      </section>

      <section id="metodo" className="method">
        <div className="method-grid">
          <div className="method-art" aria-hidden="true">
            <svg className="wave-line wave-line-top" viewBox="0 0 200 40" fill="none"><path d="M0 20 Q 25 2 50 20 T 100 20 T 150 20 T 200 20" stroke="currentColor" strokeWidth="1.5" /></svg>
            <div className="method-glow"></div>
            <p><em>{t.method.artQuote}</em><span>{t.method.artText}</span></p>
          </div>
          <div className="method-copy">
            <p className="eyebrow">{t.method.eyebrow}</p>
            <h2>{t.method.titleLine1}<br /><em>{t.method.titleEm}</em></h2>
            <p>{t.method.text}</p>
            <ol>{t.method.steps.map((step, index) => <li key={step}><b>0{index + 1}</b>{step}</li>)}</ol>
          </div>
        </div>
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

      <section className="booking-band"><div><p className="eyebrow">{t.bookingBand.eyebrow}</p><h2>{t.bookingBand.titleLine1}<br /><em>{t.bookingBand.titleEm}</em></h2></div><p>{t.bookingBand.text}</p><Link className="button button-light" href="/reservar">{t.bookingBand.cta} <span>→</span></Link></section>

      <section id="visitanos" className="visit section-shell"><div><p className="eyebrow">{t.visit.eyebrow}</p><h2>{t.visit.titleLine1}<br />{t.visit.titleLine2}</h2><p>{t.visit.address}<br />{t.visit.city}</p><a className="text-link" href="tel:+529542010059">+52 954 201 0059</a></div><div className="hours"><h3>{t.visit.hoursTitle}</h3><p><span>{t.visit.weekdays}</span><strong>{t.visit.weekdaysHours}</strong></p><p><span>{t.visit.weekend}</span><strong>{t.visit.weekendHours}</strong></p><small>{t.visit.note}</small></div></section>

      <footer><Link href="/" className="brand brand-logo"><Image src="/brand/ola-bonita.png" alt="Ola Bonita Beauty Spa" width={84} height={84} /></Link><p>© {new Date().getFullYear()} {t.footer.rights}</p><Link href="/reservar">{t.footer.cta}</Link></footer>
      <LanguageSwitcher locale={locale} />
      <WhatsappFab locale={locale} />
    </main>
  );
}
