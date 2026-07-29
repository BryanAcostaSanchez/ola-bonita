"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AccessForm({ canCreateFirstOwner }: { canCreateFirstOwner: boolean }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">(canCreateFirstOwner ? "sign-up" : "sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createClient();

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else window.location.assign("/app");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/app` },
      });
      if (error) setMessage(error.message);
      else if (data.session) window.location.assign("/app");
      else setMessage("Revisa tu correo para confirmar la cuenta. Después inicia sesión aquí.");
    }
    setBusy(false);
  }

  return <div className="access-card"><p className="eyebrow">{mode === "sign-in" ? "INICIAR SESIÓN" : "CREAR CUENTA"}</p><h2>{mode === "sign-in" ? "Bienvenida de vuelta" : "Configura el acceso"}</h2><p className="access-description">{mode === "sign-in" ? "Usa la cuenta autorizada para entrar al punto de venta." : "Esta será la única cuenta que puede iniciar la administración."}</p><form onSubmit={submit} className="access-form">{mode === "sign-up" && <label>Nombre completo<input required value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>}<label>Correo<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label>Contraseña<input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} /></label><button className="button" disabled={busy}>{busy ? "Un momento…" : mode === "sign-in" ? "Entrar al punto de venta" : "Crear cuenta"} <span>→</span></button></form>{message && <p className="access-message" role="status">{message}</p>}{canCreateFirstOwner && <button type="button" className="access-switch" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }}>{mode === "sign-in" ? "¿Es la primera cuenta? Crear acceso" : "¿Ya tienes cuenta? Inicia sesión"}</button>}</div>;
}
