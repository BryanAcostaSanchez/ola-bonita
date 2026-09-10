import Image from "next/image";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteFooter } from "@/components/SiteFooter";
import { WhatsappFab } from "@/components/WhatsappFab";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function YouMatterArticle() {
  const locale = await getLocale();
  return (
    <main className="public-site journal-article-page">
      <header className="article-header">
        <Link href="/" className="brand brand-logo" aria-label="Ola Bonita inicio"><Image src="/brand/ola-bonita.png" alt="Ola Bonita Beauty Spa" width={80} height={80} priority /></Link>
        <div><LanguageSwitcher locale={locale} /><Link href="/#journal" className="text-link">← Journal</Link></div>
      </header>

      <article className="journal-article">
        <header className="journal-article-hero journal-article-hero-warm">
          <p className="eyebrow">BIENESTAR · OLA BONITA JOURNAL</p>
          <h1>Porque tú también eres <em>importante.</em></h1>
          <p>Tu bienestar no es un lujo: es una prioridad que también merece espacio en tu día.</p>
        </header>

        <div className="journal-article-body">
          <p className="journal-lede">Siempre hay algo que resolver.<br /><strong>Y casi sin darte cuenta, comienzas a dejarte para después.</strong></p>
          <p>Un mensaje que responder. Una persona que necesita ayuda. Una responsabilidad que no puede esperar. Un pendiente que parece más urgente que tú.</p>
          <p>Después descansas. Después haces esa cita. Después te tomas un momento. Después piensas en lo que tú necesitas.</p>
          <p>Pero ese “después” no siempre llega.</p>

          <h2>Cuando cuidar de todos se vuelve costumbre</h2>
          <p>Muchas mujeres aprendieron a demostrar amor cuidando.</p>
          <p>Están pendientes de la familia, del trabajo, de la casa, de sus amistades y de las necesidades de quienes las rodean. Recuerdan fechas, organizan planes, resuelven problemas y procuran que todo esté bien.</p>
          <p>Cuidar de otras personas puede ser una forma hermosa de querer.</p>
          <p>El problema aparece cuando, en medio de tantas responsabilidades, dejas de preguntarte cómo estás tú.</p>
          <p>Porque estar disponible para todos no significa que tengas que olvidarte de ti.</p>
          <ul><li>Tú también necesitas atención.</li><li>También necesitas descanso.</li><li>También necesitas sentirte acompañada y cuidada.</li></ul>

          <h2>No tienes que llegar al límite</h2>
          <p>A veces esperamos hasta estar completamente agotadas para detenernos.</p>
          <p>Hasta que el cuerpo se siente pesado. Hasta que la tensión se acumula en la espalda y el cuello. Hasta que perdemos la paciencia con facilidad. Hasta que incluso las cosas que disfrutamos comienzan a sentirse como otra obligación.</p>
          <p>Pero no necesitas llegar al cansancio extremo para darte permiso de hacer una pausa.</p>
          <blockquote>Cuidarte no debería ser únicamente una respuesta al agotamiento.<br /><em>También puede ser una forma de prevenirlo.</em></blockquote>
          <p>Escuchar a tu cuerpo antes de que tenga que pedirte descanso a gritos también es una manera de respetarte.</p>

          <h2>Recibir cuidado también es importante</h2>
          <p>Estamos acostumbradas a pensar en el autocuidado como algo que debemos hacer solas: cumplir una rutina, organizar mejor nuestro tiempo o encontrar la forma de sentirnos bien sin incomodar a nadie.</p>
          <p>Pero también existe valor en permitir que alguien más cuide de ti.</p>
          <ul><li>Cerrar los ojos durante un masaje.</li><li>Dejar que tus manos, tu piel o tu cuerpo reciban atención.</li><li>Guardar el teléfono y olvidarte por un momento de lo que sigue.</li><li>Entrar a un espacio en el que no tienes que resolver nada.</li></ul>
          <p>Recibir cuidado no te hace egoísta. Tampoco significa que estés ignorando tus responsabilidades.</p>
          <p>Significa reconocer que tú también necesitas momentos en los que no seas la persona encargada de sostenerlo todo.</p>

          <h2>Sentirte hermosa también es una necesidad</h2>
          <p>Sentirte hermosa no se trata de cumplir con una expectativa ni de verte perfecta. Se trata de sentirte cómoda contigo.</p>
          <p>De mirarte con más amabilidad. De recuperar seguridad. De regalarte una experiencia que te recuerde que tu cuerpo también merece atención, suavidad y tiempo.</p>
          <p>A veces, un tratamiento, un masaje o una cita de belleza no cambia únicamente lo que ves frente al espejo. También puede cambiar la manera en la que te sientes durante el resto del día.</p>
          <p>No porque necesites arreglar algo en ti, sino porque mereces dedicarte el mismo cuidado que entregas constantemente a los demás.</p>

          <h2>Hoy queremos cuidar de ti</h2>
          <p>En Ola Bonita sabemos que detrás de cada mujer existe una historia llena de responsabilidades, pendientes y personas importantes.</p>
          <p>Por eso queremos ofrecerte un espacio en el que, durante un momento, la prioridad seas tú. Un lugar para bajar el ritmo, descansar, sentirte atendida y disfrutar sin culpa.</p>
          <p>No tienes que justificar cada momento que dedicas a ti misma. No necesitas ganártelo siendo más productiva, resolviendo todo o esperando a que los demás ya no te necesiten.</p>
          <p>Tú también eres importante. También mereces atención. También mereces descansar. También mereces sentirte hermosa.</p>
          <p>Y recordarlo también es una forma de cuidarte.</p>
        </div>

        <aside className="journal-article-cta"><p className="eyebrow">TU PAUSA EMPIEZA AQUÍ</p><h2>Hoy, la prioridad puedes ser <em>tú.</em></h2><Link className="button" href="/reservar">Reservar una cita <span>→</span></Link></aside>
      </article>
      <SiteFooter locale={locale} />
      <WhatsappFab locale={locale} />
    </main>
  );
}
