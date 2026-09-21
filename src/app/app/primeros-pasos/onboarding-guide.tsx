"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { OnboardingStepId, OnboardingStepState } from "@/lib/onboarding";
import type { OnboardingStepStatus } from "@/lib/onboarding-progress";

type Props = {
  fullName: string;
  initialSteps: OnboardingStepStatus[];
  initialDismissed: boolean;
};

const stateLabels: Record<OnboardingStepState, string> = {
  pending: "Pendiente",
  done: "Listo",
  skipped: "No aplica",
};

export function OnboardingGuide({
  fullName,
  initialSteps,
  initialDismissed,
}: Props) {
  const client = createClient();
  const [steps, setSteps] = useState(initialSteps);
  const [dismissed, setDismissed] = useState(initialDismissed);
  const [open, setOpen] = useState<OnboardingStepId | null>(
    initialSteps.find((status) => status.state === "pending")?.step.id ?? null,
  );
  const [busy, setBusy] = useState<OnboardingStepId | "guide" | null>(null);
  const [message, setMessage] = useState("");

  const counted = useMemo(
    () => steps.filter((status) => status.state !== "skipped"),
    [steps],
  );
  const done = counted.filter((status) => status.state === "done").length;
  const complete = counted.length > 0 && done === counted.length;

  async function setStepState(id: OnboardingStepId, state: OnboardingStepState) {
    setBusy(id);
    setMessage("");
    const { error } = await client.rpc("set_onboarding_step", {
      p_step: id,
      p_state: state,
    });
    setBusy(null);
    if (error) return setMessage(error.message);
    setSteps((current) =>
      current.map((status) =>
        status.step.id === id
          ? {
              ...status,
              marked: state === "pending" ? null : state,
              state: state === "pending" && status.detected ? "done" : state,
            }
          : status,
      ),
    );
    if (state !== "pending") {
      const next = steps.find(
        (status) => status.step.id !== id && status.state === "pending",
      );
      setOpen(next?.step.id ?? null);
    }
  }

  async function setGuideDismissed(value: boolean) {
    setBusy("guide");
    setMessage("");
    const { error } = await client.rpc("set_onboarding_dismissed", {
      p_dismissed: value,
    });
    setBusy(null);
    if (error) return setMessage(error.message);
    setDismissed(value);
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-hero">
        <div>
          <Link className="text-link onboarding-back" href="/app">
            ← Volver a la agenda
          </Link>
          <p className="eyebrow">PRIMEROS PASOS</p>
          <h1>Hola, {fullName}.</h1>
          <p>
            Antes de abrir la agenda al público quedan {steps.length} cosas por
            revisar. Puedes hacerlas en el orden que quieras y volver aquí
            cuando gustes; la app recuerda dónde te quedaste.
          </p>
        </div>
        <div className="onboarding-progress">
          <strong>
            {done} de {counted.length}
          </strong>
          <span>pasos listos</span>
          <div className="onboarding-bar" aria-hidden="true">
            <i
              style={{
                width: `${counted.length ? (done / counted.length) * 100 : 0}%`,
              }}
            />
          </div>
          <Link className="text-link" href="/app/primeros-pasos/manual">
            Ver el manual para imprimir ↗
          </Link>
        </div>
      </header>

      {complete && (
        <section className="settings-card onboarding-complete">
          <div>
            <p className="eyebrow">TODO LISTO</p>
            <h2>Tu spa ya está configurado.</h2>
            <p>
              Puedes empezar a recibir reservas. Si más adelante cambias precios
              u horarios, vuelve a Configuración cuando lo necesites.
            </p>
          </div>
          <div className="onboarding-complete-actions">
            {dismissed ? (
              <button
                type="button"
                className="secondary-button"
                disabled={busy === "guide"}
                onClick={() => setGuideDismissed(false)}
              >
                Volver a mostrar el recordatorio
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button"
                disabled={busy === "guide"}
                onClick={() => setGuideDismissed(true)}
              >
                Ocultar el recordatorio de la agenda
              </button>
            )}
            <Link className="new-booking" href="/app">
              Ir a la agenda <span>→</span>
            </Link>
          </div>
        </section>
      )}

      <ol className="onboarding-steps">
        {steps.map((status, index) => {
          const { step } = status;
          const expanded = open === step.id;
          return (
            <li
              key={step.id}
              className={`onboarding-step is-${status.state} ${expanded ? "is-open" : ""}`}
            >
              <button
                type="button"
                className="onboarding-step-head"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : step.id)}
              >
                <span className="onboarding-step-mark" aria-hidden="true">
                  {status.state === "done"
                    ? "✓"
                    : status.state === "skipped"
                      ? "–"
                      : index + 1}
                </span>
                <span className="onboarding-step-title">
                  <strong>{step.title}</strong>
                  <small>{step.summary}</small>
                </span>
                <span
                  className={`settings-status ${status.state === "done" ? "success" : ""}`}
                >
                  {stateLabels[status.state]}
                </span>
              </button>

              {expanded && (
                <div className="onboarding-step-body">
                  <p className="onboarding-step-detail">
                    <em>Así está hoy:</em> {status.detail}
                  </p>
                  <ol className="onboarding-step-actions">
                    {step.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ol>
                  <p className="onboarding-step-tip">{step.tip}</p>
                  {status.detected && !status.marked && (
                    <p className="onboarding-step-detected">
                      Marcamos este paso como listo porque ya encontramos la
                      configuración hecha.
                    </p>
                  )}
                  <div className="onboarding-step-buttons">
                    <Link className="new-booking" href={step.path}>
                      Ir a la sección <span>→</span>
                    </Link>
                    {status.state === "pending" ? (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy === step.id}
                        onClick={() => setStepState(step.id, "done")}
                      >
                        {busy === step.id ? "Guardando…" : "Ya lo revisé"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy === step.id}
                        onClick={() => setStepState(step.id, "pending")}
                      >
                        {busy === step.id
                          ? "Guardando…"
                          : "Volver a dejarlo pendiente"}
                      </button>
                    )}
                    {step.optional && status.state !== "skipped" && (
                      <button
                        type="button"
                        className="text-link onboarding-skip"
                        disabled={busy === step.id}
                        onClick={() => setStepState(step.id, "skipped")}
                      >
                        No aplica en mi negocio
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {message && <p className="access-message settings-message">{message}</p>}

      <p className="onboarding-foot">
        ¿Prefieres leerlo con calma?{" "}
        <Link className="text-link" href="/app/primeros-pasos/manual">
          Abre el manual completo
        </Link>{" "}
        y guárdalo impreso junto a la recepción.
      </p>
    </main>
  );
}
