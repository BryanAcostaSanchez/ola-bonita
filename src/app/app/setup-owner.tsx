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
    else window.location.reload();
    setBusy(false);
  }

  return <main className="setup-page"><section className="setup-card"><p className="eyebrow">CONFIGURACIÓN INICIAL</p><h1>Hola, {fullName}.</h1><p>Esta es la primera cuenta del espacio de trabajo. Al continuar será la cuenta administradora de Ola Bonita; después podrás crear y asignar los accesos del equipo.</p><button className="button" onClick={claimOwner} disabled={busy}>{busy ? "Configurando…" : "Convertir en administradora"} <span>→</span></button>{error && <p className="access-message">{error}</p>}</section></main>;
}
