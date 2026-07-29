import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { BookingServicePicker } from "./service-picker";

export const dynamic = "force-dynamic";

export default async function BookingPage() {
  const supabase = await createServerClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name, duration_minutes, price_cents, category:service_categories(name)")
    .eq("active", true)
    .eq("online_bookable", true)
    .order("sort_order");
  return (
    <main className="booking-page">
      <header className="booking-header"><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link><Link className="text-link" href="/">← Volver al sitio</Link></header>
      <section className="booking-layout">
        <div className="booking-intro"><p className="eyebrow">RESERVA TU CITA</p><h1>Te guardamos<br />un momento <em>para ti.</em></h1><p>Elige el servicio que quieres disfrutar. Podrás elegir el horario y confirmar tus datos en el siguiente paso.</p><div className="booking-note"><strong>Anticipo flexible</strong><span>Cuando esté activado para tu servicio, verás el porcentaje a pagar en línea y el saldo a liquidar en el spa.</span></div></div>
        <BookingServicePicker services={services ?? []} />
      </section>
    </main>
  );
}
