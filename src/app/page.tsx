import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const descriptions: Record<string, string> = {
  masajes: "Rituales para soltar tensión y volver a tu centro.",
  faciales: "Cuidado consciente para una piel luminosa.",
  "unas-y-pies": "Detalles que se sienten tan bien como se ven.",
  "lifting-y-cejas": "Servicios precisos para enmarcar tu belleza.",
  "extensiones-de-pestanas": "Una mirada hecha para destacar.",
  depilacion: "Cuidado suave y preciso para tu piel.",
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export default async function Home() {
  const supabase = createServerClient();
  const { data: categories } = await supabase
    .from("service_categories")
    .select("name, slug, services(name, duration_minutes, price_cents, online_bookable, sort_order)")
    .eq("active", true)
    .order("sort_order");

  return (
    <main>
      <nav className="nav-shell">
        <Link href="/" className="brand" aria-label="Ola Bonita inicio"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link>
        <div className="nav-actions"><a href="#servicios">Servicios</a><a href="#visitanos">Visítanos</a><Link className="button button-small" href="/reservar">Reservar</Link></div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">PUERTO ESCONDIDO · OAXACA</p>
          <h1>Un momento para<br /><em>volver a ti.</em></h1>
          <p className="hero-text">Masajes, faciales y rituales de belleza diseñados para que te sientas tan bien como te ves.</p>
          <div className="hero-cta"><Link className="button" href="/reservar">Reserva tu experiencia <span>→</span></Link><a className="text-link" href="#servicios">Explorar servicios</a></div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="sun"></div><div className="flower flower-one">✿</div><div className="flower flower-two">✿</div><p>respira<br />descansa<br />renueva</p></div>
      </section>

      <section id="servicios" className="services section-shell">
        <div className="section-heading"><p className="eyebrow">NUESTRO MENÚ</p><h2>Rituales hechos<br />para ti.</h2><p>Elige tu experiencia y encuentra un espacio que se acomode a tu día.</p></div>
        <div className="service-grid">{categories?.map((category, index) => {
          const services = category.services
            .filter((service) => service.online_bookable)
            .sort((a, b) => a.sort_order - b.sort_order)
            .slice(0, 3);
          return <article className="service-card" key={category.slug}><span className="service-number">{String(index + 1).padStart(2, "0")}</span><h3>{category.name}</h3><p>{descriptions[category.slug] ?? "Una experiencia creada para ti."}</p><ul>{services.map((service) => <li key={service.name}>{service.name} · {service.duration_minutes} min · {money.format(service.price_cents / 100)}</li>)}</ul><Link href="/reservar">Reservar <span>→</span></Link></article>;
        })}</div>
      </section>

      <section className="booking-band"><div><p className="eyebrow">CITA A TU RITMO</p><h2>Tu tiempo es<br /><em>valioso.</em></h2></div><p>Al reservar podrás elegir el servicio, especialista y horario. Si el servicio requiere anticipo, verás el monto antes de confirmar.</p><Link className="button button-light" href="/reservar">Reservar ahora <span>→</span></Link></section>

      <section id="visitanos" className="visit section-shell"><div><p className="eyebrow">ENCUÉNTRANOS</p><h2>Ola Bonita<br />Beauty Spa</h2><p>Guanajuato #655, Brisas de Zicatela<br />Puerto Escondido, Oaxaca, México</p><a className="text-link" href="tel:+529542010059">+52 954 201 0059</a></div><div className="hours"><h3>Horario</h3><p><span>Lunes — Viernes</span><strong>09:00 — 18:00</strong></p><p><span>Sábado — Domingo</span><strong>10:00 — 16:00</strong></p><small>Horario sujeto a disponibilidad de cada especialista.</small></div></section>

      <footer><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link><p>© {new Date().getFullYear()} Ola Bonita Beauty Spa</p><Link href="/reservar">Reservar una cita</Link></footer>
    </main>
  );
}
