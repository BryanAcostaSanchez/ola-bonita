"use client";

import { useMemo, useState } from "react";

type Service = { id: string; name: string; duration_minutes: number; price_cents: number; category: { name: string } | { name: string }[] | null };

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const categoryName = (service: Service) => Array.isArray(service.category) ? service.category[0]?.name : service.category?.name;

export function BookingServicePicker({ services }: { services: Service[] }) {
  const [selectedId, setSelectedId] = useState(services[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const selected = services.find((service) => service.id === selectedId);
  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-MX");
    if (!normalizedQuery) return services;
    return services.filter((service) => `${service.name} ${categoryName(service) ?? ""}`.toLocaleLowerCase("es-MX").includes(normalizedQuery));
  }, [query, services]);

  return <form className="booking-form">
    <fieldset><legend>1. Elige un servicio</legend><label className="service-search"><span className="sr-only">Buscar servicio</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar masaje, facial, uñas…" /></label><div className="booking-services">{filteredServices.map((service) => <label className="booking-service" key={service.id}><input type="radio" name="service" checked={selectedId === service.id} onChange={() => setSelectedId(service.id)} /><span className="radio-mark" /><span><strong>{service.name}</strong><small>{categoryName(service)} · {service.duration_minutes} min</small></span><b>{money.format(service.price_cents / 100)}</b></label>)}{!filteredServices.length && <p className="empty-services">No encontramos ese servicio. Prueba con otro nombre.</p>}</div></fieldset>
    <fieldset><legend>2. ¿Con quién te gustaría atenderte?</legend><div className="specialist-options"><label><input type="radio" name="specialist" defaultChecked /> La primera especialista disponible</label><label><input type="radio" name="specialist" /> Elegir especialista</label></div></fieldset>
    <button type="button" className="button" disabled={!selected}>Ver horarios disponibles <span>→</span></button><p className="form-disclaimer">{selected ? `${selected.name}: ${money.format(selected.price_cents / 100)}. ` : ""}Al continuar, podrás elegir fecha y hora. No se realiza ningún cargo sin mostrarte antes el total.</p>
  </form>;
}
