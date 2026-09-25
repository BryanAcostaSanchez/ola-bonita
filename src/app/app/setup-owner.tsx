"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SetupOwner({ fullName }: { fullName: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function claimOwner() {
    setBusy(true);
    setError("");
    const { error: rpcError } = await createClient().rpc("bootstrap_owner");
    if (rpcError) setError(rpcError.message);
    // El tutorial es la primera pantalla: deja la configuración en orden antes
    // de abrir la agenda.
    else window.location.href = "/app/primeros-pasos";
    setBusy(false);
  }

  return <main className="setup-page"><section className="setup-card"><p className="eyebrow">CONFIGURACIÓN INICIAL</p><h1>Hola, {fullName}.</h1><p>Esta es la primera cuenta del espacio de trabajo. Al continuar será la cuenta administradora de Ola Bonita; después te guiamos paso a paso por todo lo que hay que configurar antes de abrir la agenda.</p><button className="button" onClick={claimOwner} disabled={busy}>{busy ? "Configurando…" : "Convertir en administradora"} <span>→</span></button>{error && <p className="access-message">{error}</p>}</section></main>;
}
