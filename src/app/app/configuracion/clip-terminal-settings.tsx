"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Method = "cash" | "card" | "transfer";
type SetupStatus = "not_started" | "requested" | "app_installed" | "ready_to_test";
export type PaymentTerminal = {
  id: string;
  provider: string;
  device_id: string;
  label: string | null;
  active: boolean;
  setup_status: SetupStatus;
  last_seen_state: string | null;
  last_seen_at: string | null;
};
type LiveTerminal = PaymentTerminal & { live_state: string | null; live_label: string | null };

const methodLabels: Record<Method, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" };
const setupLabels: Record<SetupStatus, string> = {
  not_started: "Por iniciar",
  requested: "Solicitada a Clip",
  app_installed: "App Clip PinPad instalada",
  ready_to_test: "Lista para cobrar",
};

// Clip's own compatibility list, from the API de PinPad introduction. Its other
// pages name different models, so the page says so instead of picking one: a
// reader is expensive to get wrong.
const compatibleModels = ["Clip Total 3", "Clip Ultra", "Clip PinPad", "Clip Stand 2"];
const wakeupModels = ["Clip Pro 2", "Clip Total", "Clip Total 2"];
const incompatibleModels = ["Clip Plus", "Clip Mini", "Clip Lector Bluetooth"];

export function ClipTerminalSettings({
  settingsId,
  terminals,
  posMethods,
  methodProviders,
}: {
  settingsId: string | null;
  terminals: PaymentTerminal[];
  posMethods: Method[];
  methodProviders: Record<string, string | null>;
}) {
  const supabase = createClient();
  const existing = terminals[0] ?? null;
  const [terminal, setTerminal] = useState({
    serial: existing?.device_id ?? "",
    label: existing?.label ?? "",
    status: existing?.setup_status ?? ("not_started" as SetupStatus),
  });
  const [terminalMethod, setTerminalMethod] = useState<Method | "">(
    () => (Object.keys(methodProviders).find((method) => methodProviders[method]) as Method | undefined) ?? "",
  );
  const [live, setLive] = useState<LiveTerminal[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // What Clip reports right now, not what somebody typed when the terminal was
  // first registered.
  const refreshLive = useCallback(async () => {
    setChecking(true);
    setLiveError(null);
    try {
      const response = await fetch("/api/pos/terminal/devices", { cache: "no-store" });
      const result = await response.json().catch(() => ({})) as { terminals?: LiveTerminal[]; error?: string };
      if (!response.ok) { setLiveError(result.error ?? "No pudimos consultar el estado de la terminal."); return; }
      setLive(result.terminals ?? []);
      if (result.error) setLiveError(result.error);
    } catch {
      setLiveError("No pudimos consultar el estado de la terminal.");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshLive(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshLive]);

  async function saveTerminal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const serial = terminal.serial.trim();
    if (terminal.status !== "not_started" && !serial) {
      setMessage("Agrega el número de serie de la terminal antes de avanzar su estado.");
      return;
    }
    setBusy(true);
    setMessage("");
    const row = { provider: "clip", device_id: serial, label: terminal.label.trim() || null, active: true, setup_status: terminal.status, updated_at: new Date().toISOString() };
    const { error } = existing
      ? await supabase.from("payment_terminals").update(row).eq("id", existing.id)
      : await supabase.from("payment_terminals").insert(row);
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage(terminal.status === "ready_to_test"
      ? "Terminal lista. Falta marcar qué método de pago la usa para que el POS le mande cobros."
      : "Preparación de la terminal guardada.");
    void refreshLive();
  }

  // What sends a charge to the terminal is this switch, not the name of the
  // method, so "Tarjeta" can be renamed without turning the terminal off.
  async function saveTerminalMethod() {
    if (!settingsId) return;
    setBusy(true);
    setMessage("");
    const providers = terminalMethod ? { [terminalMethod]: "clip" } : {};
    const { error } = await supabase.from("business_settings").update({ pos_payment_method_providers: providers }).eq("id", settingsId);
    setBusy(false);
    setMessage(error?.message || (terminalMethod
      ? `Al cobrar con ${methodLabels[terminalMethod]} el POS enviará el importe a la terminal.`
      : "Ningún método usa la terminal. Los cobros con tarjeta se registran a mano."));
  }

  async function copyRequest() {
    const serial = terminal.serial.trim() || "[escribe aquí el número de serie]";
    const text = `Hola, escribo de Ola Bonita.

Quiero habilitar la API de PinPad para cobrar desde nuestro punto de venta web hacia una terminal física Clip.

Número de serie del lector: ${serial}

Nuestra cuenta Clip está activa y con la verificación de identidad (KYC) terminada, y ya tenemos credenciales de Producción.

¿Nos pueden ayudar con lo siguiente?
1. Confirmar si este lector es compatible con la API de PinPad.
2. Instalar la aplicación Clip PinPad en él.
3. Indicarnos los pasos para dejarlo listo para recibir cobros desde nuestro sistema.

Gracias.`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Solicitud copiada. Pégala en el correo a sdk@payclip.com.");
    } catch {
      setMessage("No se pudo copiar. Selecciona el texto de la solicitud y cópialo a mano.");
    }
  }

  const liveTerminal = live.find((item) => item.device_id === terminal.serial.trim()) ?? null;
  const readyButUnused = existing?.setup_status === "ready_to_test" && !terminalMethod;

  return (
    <section className="settings-card pinpad-card">
      <header>
        <div>
          <p className="eyebrow">TERMINAL FÍSICA</p>
          <h2>Cobrar en la terminal Clip</h2>
          <p>Al cobrar, el POS manda el importe exacto a la terminal y espera su respuesta. La venta se registra sólo si Clip aprueba el pago.</p>
        </div>
        <span className={liveTerminal?.live_state === "active" ? "settings-status success" : "settings-status"}>
          {checking ? "Consultando…" : liveTerminal?.live_label ?? setupLabels[terminal.status]}
        </span>
      </header>

      <div className="pinpad-models">
        <h3>¿Sirve tu lector?</h3>
        <p>
          La terminal tiene que ser un lector Clip con pantalla, capaz de correr la app Clip PinPad.
          Los lectores que se conectan al celular por Bluetooth no funcionan.
        </p>
        <div className="pinpad-model-lists">
          <div>
            <strong>Compatibles según la API de PinPad</strong>
            <ul>{compatibleModels.map((model) => <li key={model}>{model}</li>)}</ul>
          </div>
          <div>
            <strong>Mencionados en otra página de Clip</strong>
            <ul>{wakeupModels.map((model) => <li key={model}>{model}</li>)}</ul>
            <small>En estos hay que activar a mano el permiso «Mostrar sobre otras aplicaciones» para Clip PinPad.</small>
          </div>
          <div>
            <strong>No sirven</strong>
            <ul>{incompatibleModels.map((model) => <li key={model}>{model}</li>)}</ul>
          </div>
        </div>
        <p className="pinpad-models-warning">
          La documentación de Clip se contradice entre páginas, así que antes de comprar un lector
          confirma el modelo por escrito con Clip, citando el número de serie.
        </p>
      </div>

      <div className="pinpad-layout">
        <ol className="pinpad-steps">
          <li>
            <strong>Ten la cuenta Clip lista.</strong>
            <span>Activa y con la verificación de identidad (KYC) terminada, y credenciales de Producción guardadas arriba. La terminal no tiene ambiente de pruebas: Clip sólo la opera en Producción.</span>
          </li>
          <li>
            <strong>Escribe el número de serie del lector.</strong>
            <span>Viene impreso en la parte de atrás del aparato. Guárdalo aquí abajo.</span>
          </li>
          <li>
            <strong>Pide a Clip que instale la app.</strong>
            <span>Copia la solicitud y mándala a sdk@payclip.com. Sólo Clip puede instalar la app Clip PinPad en el lector, y sin ella el POS no puede cobrarle.</span>
            <a className="text-link" href="mailto:sdk@payclip.com?subject=Habilitar%20API%20de%20PinPad%20-%20Ola%20Bonita">Escribir a sdk@payclip.com ↗</a>
          </li>
          <li>
            <strong>Marca la terminal como lista y elige el método.</strong>
            <span>Cuando Clip confirme, cambia el estado a «Lista para cobrar» y marca abajo qué método de pago la usa.</span>
          </li>
        </ol>

        <form className="payment-credentials pinpad-form" onSubmit={saveTerminal}>
          <label>
            Número de serie del lector
            <input value={terminal.serial} placeholder="Ej. P8220724000042" onChange={(event) => setTerminal({ ...terminal, serial: event.target.value })} autoComplete="off" />
            <small>Clip lo usa para saber a qué aparato mandar cada cobro.</small>
          </label>
          <label>
            Nombre para identificarla
            <input value={terminal.label} placeholder="Ej. Mostrador" onChange={(event) => setTerminal({ ...terminal, label: event.target.value })} autoComplete="off" />
          </label>
          <label>
            Estado del trámite
            <select value={terminal.status} onChange={(event) => setTerminal({ ...terminal, status: event.target.value as SetupStatus })}>
              {(Object.keys(setupLabels) as SetupStatus[]).map((status) => <option value={status} key={status}>{setupLabels[status]}</option>)}
            </select>
          </label>
          <div className="pinpad-actions">
            <button type="button" className="secondary-button" onClick={copyRequest}>Copiar solicitud para Clip</button>
            <button className="new-booking" disabled={busy}>Guardar terminal</button>
          </div>
        </form>
      </div>

      <div className="pinpad-live">
        <div>
          <strong>Estado real de la terminal</strong>
          {liveTerminal?.live_label
            ? <span>{liveTerminal.live_label}{liveTerminal.last_seen_at ? ` · visto ${new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(liveTerminal.last_seen_at))}` : ""}</span>
            : <span>{liveError ?? "Clip todavía no reporta esta terminal."}</span>}
        </div>
        <button type="button" className="secondary-button" disabled={checking} onClick={() => void refreshLive()}>
          {checking ? "Consultando…" : "Volver a consultar"}
        </button>
      </div>

      <div className="pinpad-method">
        <h3>¿Qué método de pago cobra en la terminal?</h3>
        <p>Al elegir ese método en una venta, incluso como parte de una cuenta dividida, el POS manda ese importe a la terminal.</p>
        <div className="pinpad-method-options">
          <label>
            <input type="radio" name="terminal-method" checked={terminalMethod === ""} onChange={() => setTerminalMethod("")} />
            Ninguno: todo se registra a mano
          </label>
          {posMethods.map((method) => (
            <label key={method}>
              <input type="radio" name="terminal-method" checked={terminalMethod === method} onChange={() => setTerminalMethod(method)} />
              {methodLabels[method]}
            </label>
          ))}
        </div>
        <button type="button" className="new-booking" disabled={busy} onClick={() => void saveTerminalMethod()}>Guardar método</button>
      </div>

      {readyButUnused && (
        <aside className="pinpad-note" role="status">
          <strong>La terminal está lista pero ningún cobro la usa</strong>
          <span>Elige arriba, en «¿Qué método de pago cobra en la terminal?», el método que debe mandar el importe al aparato. Mientras no lo marques, los cobros con tarjeta se siguen registrando a mano.</span>
        </aside>
      )}

      {message && <p className="access-message settings-message">{message}</p>}
    </section>
  );
}
