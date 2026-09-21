"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Props = {
  done: number;
  total: number;
  nextTitle: string | null;
};

/**
 * Recordatorio en la agenda mientras queden pasos de configuración
 * pendientes. Se oculta cuando la dueña lo pide y no vuelve a aparecer.
 */
export function OnboardingCard({ done, total, nextTitle }: Props) {
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  async function hide() {
    setBusy(true);
    const { error } = await createClient().rpc("set_onboarding_dismissed", {
      p_dismissed: true,
    });
    setBusy(false);
    if (!error) setHidden(true);
  }

  if (hidden) return null;

  return (
    <section className="onboarding-card">
      <div className="onboarding-card-copy">
        <p className="eyebrow">PRIMEROS PASOS</p>
        <h2>
          Te faltan {total - done} de {total} pasos para terminar de configurar
          el spa.
        </h2>
        <p>
          {nextTitle
            ? `Sigue: ${nextTitle}.`
            : "Revisa lo que quedó pendiente."}
        </p>
      </div>
      <div className="onboarding-card-bar" aria-hidden="true">
        <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <div className="onboarding-card-actions">
        <Link className="new-booking" href="/app/primeros-pasos">
          Continuar <span>→</span>
        </Link>
        <button
          type="button"
          className="onboarding-skip text-link"
          disabled={busy}
          onClick={hide}
        >
          Ocultar
        </button>
      </div>
    </section>
  );
}
