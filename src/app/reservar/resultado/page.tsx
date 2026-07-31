import Link from "next/link";

export default async function BookingResultPage({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const { booking } = await searchParams;
  return <main className="booking-page public-site"><header className="booking-header"><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link></header><section className="booking-result"><p className="eyebrow">PAGO RECIBIDO</p><h1>Estamos confirmando<br />tu <em>reserva.</em></h1><p>Mercado Pago nos notificará el resultado de tu pago en unos momentos. Conserva tu código de reserva.</p>{booking && <strong>#{booking}</strong>}<Link className="button" href="/">Volver al inicio <span>→</span></Link></section></main>;
}
