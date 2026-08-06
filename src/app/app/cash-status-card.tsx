"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function toCents(value: string) {
  return Math.round(Number(value.replace(",", ".") || "0") * 100);
}

export function CashStatusCard({
  isOpen,
  canManage,
}: {
  isOpen: boolean;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = isOpen
      ? await supabase.rpc("close_cash_session", {
          p_counted_cash_cents: toCents(amount),
          p_notes: null,
        })
      : await supabase.rpc("open_cash_session", {
          p_opening_float_cents: toCents(amount),
        });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.reload();
  }

  const action = isOpen ? "Hacer corte de caja" : "Abrir caja";

  return <>
    <button
      type="button"
      className="cash-status-card"
      disabled={!canManage}
      onClick={() => { setAmount(""); setMessage(""); setOpen(true); }}
    >
      <span>ESTADO DE CAJA</span>
      <strong>{isOpen ? "Abierta" : "Cerrada"}</strong>
      <small>{isOpen ? "Haz clic para realizar el corte" : "Haz clic para registrar el fondo inicial"}</small>
    </button>
    {open && <div className="cash-modal-backdrop" role="presentation">
      <section className="cash-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-cash-modal-title">
        <button type="button" className="cash-modal-close" aria-label="Cerrar" onClick={() => setOpen(false)}>×</button>
        <p className="eyebrow">{isOpen ? "CORTE DE CAJA" : "APERTURA DE CAJA"}</p>
        <h2 id="dashboard-cash-modal-title">{isOpen ? "¿Cuánto efectivo hay en caja?" : "¿Con cuánto efectivo inicias?"}</h2>
        <p>{isOpen ? "Cuenta el efectivo físico para registrar el corte del día." : "Cuenta el efectivo físico que dejas en caja antes de comenzar a cobrar."}</p>
        <form onSubmit={save}>
          <label>{isOpen ? "Efectivo contado" : "Monto inicial"}
            <input autoFocus required value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="Ej. 500.00" />
          </label>
          {message && <p className="access-message">{message}</p>}
          <div>
            <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="submit" className="primary-operation" disabled={busy}>{busy ? "Guardando…" : action}</button>
          </div>
        </form>
      </section>
    </div>}
  </>;
}
