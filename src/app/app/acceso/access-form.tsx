"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up" | "activate";

export function AccessForm({ canCreateFirstOwner }: { canCreateFirstOwner: boolean }) {
  const [mode, setMode] = useState<Mode>(canCreateFirstOwner ? "sign-up" : "sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const flow = query.get("flow") || hash.get("type");
    if (flow !== "invite" && flow !== "recovery") return;

    const supabase = createClient();
    const prepareActivation = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMessage("Estamos validando tu enlace seguro. Si ya expiró, pide a administración un enlace nuevo.");
        return;
      }
      setEmail(session.user.email || "");
      setMode("activate");
      setMessage("");
    };
    void prepareActivation();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setEmail(session.user.email || "");
        setMode("activate");
        setMessage("");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "activate" && password !== confirmPassword) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setMessage("");
    const supabase = createClient();

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else window.location.assign("/app");
    } else if (mode === "activate") {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setMessage(error.message);
      else window.location.assign("/app");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) setMessage(error.message);
      else if (data.session) window.location.assign("/app");
      else setMessage("Revisa tu correo para confirmar la cuenta. Después inicia sesión aquí.");
    }
    setBusy(false);
  }

  const eyebrow = mode === "activate" ? "ACTIVAR ACCESO" : mode === "sign-in" ? "INICIAR SESIÓN" : "CREAR CUENTA";
  const heading = mode === "activate" ? "Crea tu contraseña" : mode === "sign-in" ? "Bienvenida de vuelta" : "Configura el acceso";
  const description = mode === "activate" ? "Elige una contraseña de al menos 8 caracteres para activar tu acceso al equipo." : mode === "sign-in" ? "Usa la cuenta autorizada para entrar al punto de venta." : "Esta será la única cuenta que puede iniciar la administración.";

  return <div className="access-card"><p className="eyebrow">{eyebrow}</p><h2>{heading}</h2><p className="access-description">{description}</p><form onSubmit={submit} className="access-form">{mode === "sign-up" && <label>Nombre completo<input required value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>}{mode !== "activate" ? <label>Correo<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label> : <p className="activation-email">Activando acceso para <strong>{email || "tu correo"}</strong></p>}<label>{mode === "activate" ? "Nueva contraseña" : "Contraseña"}<input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} /></label>{mode === "activate" && <label>Confirmar contraseña<input required type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>}<button className="button" disabled={busy}>{busy ? "Un momento…" : mode === "activate" ? "Activar mi acceso" : mode === "sign-in" ? "Entrar al punto de venta" : "Crear cuenta"} <span>→</span></button></form>{message && <p className="access-message" role="status">{message}</p>}{canCreateFirstOwner && mode !== "activate" && <button type="button" className="access-switch" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }}>{mode === "sign-in" ? "¿Es la primera cuenta? Crear acceso" : "¿Ya tienes cuenta? Inicia sesión"}</button>}</div>;
}
