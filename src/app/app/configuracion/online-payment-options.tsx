"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Option = "deposit" | "full";

export function OnlinePaymentOptions({ settings }: { settings: { id: string; online_payment_options: Option[] | null } | null }) {
  const [options, setOptions] = useState<Option[]>(settings?.online_payment_options?.length ? settings.online_payment_options : ["deposit"]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (option: Option) => setOptions((current) => current.includes(option) ? current.filter((item) => item !== option) : [...current, option]);
  async function save() {
    if (!settings || !options.length) return setMessage("Activa al menos una opción de pago.");
    setBusy(true); setMessage("");
    const { error } = await createClient().from("business_settings").update({ online_payment_options: options }).eq("id", settings.id);
    setMessage(error?.message || "Opciones de pago online guardadas."); setBusy(false);
  }
  return <section className="settings-card settings-form-card"><h2>Cómo pagan los servicios en la web</h2><p>Elige qué alternativas verá la clienta antes de abrir Mercado Pago.</p><fieldset className="pos-methods"><legend>Opciones de pago online</legend><label><input type="checkbox" checked={options.includes("deposit")} onChange={() => toggle("deposit")}/> Apartado <small>Usa el porcentaje de anticipo configurado.</small></label><label><input type="checkbox" checked={options.includes("full")} onChange={() => toggle("full")}/> Pago completo <small>Cobra el total del servicio desde el sitio.</small></label></fieldset><p className="category-hint">Si activas ambas, la clienta podrá elegir cómo pagar. El apartado solo aparece si el servicio tiene un anticipo configurado.</p><button type="button" className="new-booking" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar opciones online"}</button>{message && <p className="access-message">{message}</p>}</section>;
}
