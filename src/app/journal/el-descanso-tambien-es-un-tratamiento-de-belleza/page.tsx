import Image from "next/image";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteFooter } from "@/components/SiteFooter";
import { WhatsappFab } from "@/components/WhatsappFab";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function RestIsBeautyArticle() {
  const locale = await getLocale();

  return (
    <main className="public-site journal-article-page">
      <header className="article-header">
        <Link href="/" className="brand brand-logo" aria-label="Ola Bonita inicio"><Image src="/brand/ola-bonita.png" alt="Ola Bonita Beauty Spa" width={80} height={80} priority /></Link>
        <div><LanguageSwitcher locale={locale} /><Link href="/#journal" className="text-link">← Journal</Link></div>
      </header>

      <article className="journal-article">
        <header className="journal-article-hero">
          <p className="eyebrow">BIENESTAR · OLA BONITA JOURNAL</p>
          <h1>El descanso también es un <em>tratamiento de belleza.</em></h1>
          <p>Una pausa consciente puede cambiar la forma en la que habitas tu día — y tu propia piel.</p>
        </header>

        <div className="journal-article-body">
          <p className="journal-lede">Hay días en los que no necesitas transformarte.<br /><strong>Necesitas detenerte.</strong></p>
          <p>Bajar los hombros, soltar la mandíbula, cerrar los ojos durante unos minutos y permitir que alguien más cuide de ti.</p>
          <p>Porque la belleza no siempre empieza haciendo más. A veces comienza justo cuando dejas de correr, respiras profundamente y vuelves a escuchar lo que tu cuerpo necesita.</p>

          <h2>Tu rostro también refleja lo que sientes</h2>
          <p>El cansancio se acumula en lugares que no siempre notamos:</p>
          <ul><li>En el ceño que permanece fruncido.</li><li>En la tensión del cuello.</li><li>En una mirada que se siente pesada.</li><li>En una sonrisa que ya no aparece con la misma facilidad.</li></ul>
          <p>Cuando haces una pausa, tu cuerpo deja de estar en alerta. La respiración se vuelve más lenta, los músculos comienzan a relajarse y las facciones recuperan suavidad.</p>
          <p>No porque te conviertas en alguien diferente, sino porque poco a poco vuelves a reconocerte.</p>

          <h2>Cuidarte también puede ser detenerte</h2>
          <p>Muchas veces pensamos que el autocuidado significa cumplir con una rutina: tomar agua, hacer ejercicio, utilizar ciertos productos o reservar una cita.</p>
          <p>Pero también puede ser guardar el teléfono, recibir un masaje sin pensar en el siguiente pendiente o permanecer en silencio sin sentir que deberías estar haciendo algo más.</p>
          <blockquote>No todos los días necesitas exigirte una mejor versión de ti.<br /><em>Algunos días necesitas tratar con más suavidad la versión que ya eres.</em></blockquote>

          <h2>La calma también se nota</h2>
          <p>Se nota en tu expresión, en tu postura y en la manera en la que habitas tu cuerpo.</p>
          <p>Una mente tranquila no hace desaparecer los problemas, pero puede darte el espacio necesario para respirar, ordenar tus pensamientos y recuperar energía.</p>
          <p>Por eso, un tratamiento de belleza puede ser mucho más que un resultado frente al espejo.</p>
          <p>También puede convertirse en una pausa. En un momento para desconectarte del ruido, liberar tensión y volver a sentirte presente.</p>
          <p>Porque no se trata solamente de cómo te ves al salir. También importa cómo te sientes.</p>

          <h2>Un momento para regresar a ti</h2>
          <p>En Ola Bonita queremos que cada experiencia sea una pausa dentro de tu día.</p>
          <p>Un espacio para cerrar los ojos, respirar y recordar que cuidarte no es un premio que tienes que ganarte. Es una forma de escucharte.</p>
          <p>Cuando tu cuerpo descansa, tu rostro se suaviza. Tu energía se renueva. Tu sonrisa se siente diferente.</p>
          <p>Porque la belleza también nace de la calma, del bienestar y de sentirte cómoda dentro de tu propia piel.</p>
        </div>

        <aside className="journal-article-cta"><p className="eyebrow">TU PAUSA EMPIEZA AQUÍ</p><h2>Regálate un momento <em>para ti.</em></h2><Link className="button" href="/reservar">Reservar una cita <span>→</span></Link></aside>
      </article>

      <SiteFooter locale={locale} />
      <WhatsappFab locale={locale} />
    </main>
  );
}
