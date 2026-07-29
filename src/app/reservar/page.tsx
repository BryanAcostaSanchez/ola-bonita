import Link from "next/link";

const services = [
  { name: "Relax massage", duration: 60, price: 800 },
  { name: "Deep tissue", duration: 60, price: 900 },
  { name: "Hydrating facial", duration: 40, price: 800 },
  { name: "Luxury spa manicure", duration: 70, price: 500 },
  { name: "Luxury spa pedicure", duration: 80, price: 550 },
  { name: "Lash lifting", duration: 50, price: 450 },
  { name: "Classic extensions", duration: 120, price: 650 },
];

export default function BookingPage() {
  return (
    <main className="booking-page">
      <header className="booking-header"><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link><Link className="text-link" href="/">← Volver al sitio</Link></header>
      <section className="booking-layout">
        <div className="booking-intro"><p className="eyebrow">RESERVA TU CITA</p><h1>Te guardamos<br />un momento <em>para ti.</em></h1><p>Elige el servicio que quieres disfrutar. Podrás elegir el horario y confirmar tus datos en el siguiente paso.</p><div className="booking-note"><strong>Anticipo flexible</strong><span>Cuando esté activado para tu servicio, verás el porcentaje a pagar en línea y el saldo a liquidar en el spa.</span></div></div>
        <form className="booking-form"><fieldset><legend>1. Elige un servicio</legend><div className="booking-services">{services.map((service, index) => <label className="booking-service" key={service.name}><input type="radio" name="service" defaultChecked={index === 0} /><span className="radio-mark"></span><span><strong>{service.name}</strong><small>{service.duration} min</small></span><b>${service.price.toLocaleString("es-MX")}</b></label>)}</div></fieldset><fieldset><legend>2. ¿Con quién te gustaría atenderte?</legend><div className="specialist-options"><label><input type="radio" name="specialist" defaultChecked /> La primera especialista disponible</label><label><input type="radio" name="specialist" /> Elegir especialista</label></div></fieldset><button type="button" className="button">Ver horarios disponibles <span>→</span></button><p className="form-disclaimer">Al continuar, podrás elegir fecha y hora. No se realiza ningún cargo sin mostrarte antes el total.</p></form>
      </section>
    </main>
  );
}
