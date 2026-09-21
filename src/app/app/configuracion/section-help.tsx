"use client";

import { useState } from "react";
import Link from "next/link";
import { ONBOARDING_STEPS, type OnboardingStepId } from "@/lib/onboarding";

/**
 * Ayuda contextual de cada sección de configuración. Usa el mismo contenido
 * que el tutorial de primeros pasos para que nadie lea dos versiones distintas
 * de lo mismo.
 */
export function SectionHelp({ step: id }: { step: OnboardingStepId }) {
  const [open, setOpen] = useState(false);
  const step = ONBOARDING_STEPS.find((item) => item.id === id);
  if (!step) return null;

  return (
    <span className="section-help">
      <button
        type="button"
        className="help-button"
        aria-label={`Cómo configurar: ${step.title}`}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <div className="help-overlay" role="dialog" aria-modal="true">
          <section className="help-dialog">
            <button
              type="button"
              className="help-close"
              aria-label="Cerrar ayuda"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow">GUÍA RÁPIDA</p>
            <h2>{step.title}</h2>
            <p className="help-dialog-summary">{step.summary}</p>
            <ol>
              {step.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
            <p className="help-dialog-tip">{step.tip}</p>
            <Link className="text-link" href="/app/primeros-pasos">
              Ver todos los primeros pasos →
            </Link>
          </section>
        </div>
      )}
    </span>
  );
}
