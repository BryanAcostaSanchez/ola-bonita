"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Provider = "mercadopago" | "getnet" | "none";
export function WebPaymentProviderSettings({ settings, onProviderSaved }: { settings: { id: string; web_payments_enabled: boolean; web_payment_provider: Provider } | null; onProviderSaved: (provider: Provider) => void }) {
  const [enabled, setEnabled] = useState(settings?.web_payments_enabled ?? true); const [provider, setProvider] = useState<Provider>(settings?.web_payment_provider ?? "mercadopago"); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function save() { if (!settings) return; setBusy(true); const { error } = await createClient().from("business_settings").update({ web_payments_enabled: enabled, web_payment_provider: provider }).eq("id", settings.id); setBusy(false); if (error) { setMessage(error.message); return; } onProviderSaved(provider); setMessage("Proveedor y política de cobro web guardados."); }
  return <section className="settings-card settings-form-card"><h2>Pasarela para cobros web</h2><p>Las reglas de anticipo, pago total y reservar sin pagar se conservan aunque cambies de proveedor.</p><label className="switch-row"><span><strong>Activar cobros online</strong><small>Al apagarlo, las reservas se confirman sin enviar a ninguna pasarela.</small></span><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)}/><i/></label><label>Proveedor de pago<select value={provider} disabled={!enabled} onChange={(event) => setProvider(event.target.value as Provider)}><option value="mercadopago">Mercado Pago</option><option value="getnet">Getnet</option><option value="none">Ninguno</option></select><small>{provider === "getnet" ? "Guarda esta selección para configurar después sus credenciales." : "El proveedor sólo procesa el importe que definan tus reglas de reserva."}</small></label><button type="button" className="new-booking" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar proveedor"}</button>{message && <p className="access-message">{message}</p>}</section>;
}
