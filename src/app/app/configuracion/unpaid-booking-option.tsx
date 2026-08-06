"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function UnpaidBookingOption({ settings }: { settings: { id: string; allow_booking_without_online_payment: boolean } | null }) {
  const [enabled, setEnabled] = useState(settings?.allow_booking_without_online_payment ?? false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() { if (!settings) return; setBusy(true); const { error } = await createClient().from("business_settings").update({ allow_booking_without_online_payment: enabled }).eq("id", settings.id); setBusy(false); setMessage(error?.message || "Regla de reserva sin pago guardada."); }
  return <section className="settings-card settings-form-card"><h2>Reserva sin pago online</h2><p>Decide si el sitio debe permitir confirmar una cita sin abrir Mercado Pago.</p><label className="switch-row"><span><strong>Permitir reservar sin pagar</strong><small>La clienta verá esta alternativa junto con las opciones de anticipo o pago completo.</small></span><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)}/><i/></label><button type="button" className="new-booking" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar regla"}</button>{message && <p className="access-message">{message}</p>}</section>;
}
