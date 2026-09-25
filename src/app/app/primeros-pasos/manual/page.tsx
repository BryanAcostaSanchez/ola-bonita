import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { ONBOARDING_STEPS } from "@/lib/onboarding";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function OnboardingManualPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/app/acceso");

  return (
    <main className="manual-page">
      <header className="manual-head">
        <div>
          <p className="eyebrow">OLA BONITA BEAUTY SPA</p>
          <h1>Guía de inicio</h1>
          <p>
            Todo lo que hay que dejar configurado antes de abrir la agenda al
            público. Imprímela y tenla a la mano en recepción.
          </p>
        </div>
        <div className="manual-head-actions">
          <PrintButton />
          <Link className="text-link" href="/app/primeros-pasos">
            ← Volver a primeros pasos
          </Link>
        </div>
      </header>

      <section className="manual-intro">
        <h2>Antes de empezar</h2>
        <p>
          Entra a <strong>app.olabonita.shop</strong> con tu correo y
          contraseña. La primera persona que entra se convierte en la cuenta
          administradora del spa; desde ahí se crean los demás accesos.
        </p>
        <p>
          Todo lo de esta guía vive en el menú{" "}
          <strong>Configuración</strong>, y puedes cambiarlo cuando quieras. No
          hay nada que se rompa por ajustarlo después.
        </p>
      </section>

      {ONBOARDING_STEPS.map((step, index) => (
        <section className="manual-step" key={step.id}>
          <h2>
            <span>{index + 1}</span> {step.title}
            {step.optional && <em> · opcional</em>}
          </h2>
          <p className="manual-step-summary">{step.summary}</p>
          <p className="manual-step-where">
            Dónde: Configuración → <strong>{step.title}</strong> (
            {step.path.replace("/app/configuracion/", "")})
          </p>
          <ol>
            {step.actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
          <p className="manual-step-tip">
            <strong>Ten en cuenta:</strong> {step.tip}
          </p>
        </section>
      ))}

      <section className="manual-intro">
        <h2>Cuando ya esté todo listo</h2>
        <p>
          Haz una reserva de prueba desde <strong>olabonita.shop</strong> para
          confirmar que aparecen los horarios, que se elige la especialista
          correcta y que el cobro del anticipo llega a Clip. Cancélala después
          desde la agenda.
        </p>
        <p>
          Si algo no aparece como esperabas, casi siempre es una de tres cosas:
          el servicio no está marcado como reservable en línea, la especialista
          no tiene ese servicio asignado, o ese día no está abierto en la agenda
          web.
        </p>
      </section>

      <footer className="manual-foot">
        Ola Bonita Beauty Spa · Guía de inicio · app.olabonita.shop
      </footer>
    </main>
  );
}
