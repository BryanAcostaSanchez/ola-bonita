import Image from "next/image";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteFooter } from "@/components/SiteFooter";
import { WhatsappFab } from "@/components/WhatsappFab";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function BeautyBeginsArticle() {
  const locale = await getLocale();
  return (
    <main className="public-site journal-article-page">
      <header className="article-header">
        <Link href="/" className="brand brand-logo" aria-label="Ola Bonita inicio"><Image src="/brand/ola-bonita.png" alt="Ola Bonita Beauty Spa" width={80} height={80} priority /></Link>
        <div><LanguageSwitcher locale={locale} /><Link href="/#journal" className="text-link">← Journal</Link></div>
      </header>

      <article className="journal-article">
        <header className="journal-article-hero journal-article-hero-golden">
          <p className="eyebrow">BIENESTAR · OLA BONITA JOURNAL</p>
          <h1>La belleza comienza cuando te sientes <em>bien.</em></h1>
          <p>Cuidarte, descansar y amarte es lo que realmente te hace brillar.</p>
        </header>

        <div className="journal-article-body">
          <p className="journal-lede">Durante mucho tiempo nos enseñaron que para sentirnos bonitas primero teníamos que cambiar algo.</p>
          <p>Cubrir una imperfección. Corregir un detalle. Ocultar el cansancio. Parecernos un poco más a alguien más.</p>
          <p>Pero la belleza no comienza cuando logras verte perfecta. Comienza cuando te sientes cómoda contigo.</p>
          <ul><li>Cuando sonríes sin pensarlo demasiado.</li><li>Cuando tu cuerpo se siente ligero.</li><li>Cuando recuperas energía.</li><li>Cuando te miras con amabilidad.</li></ul>
          <p>Porque la manera en la que te sientes también transforma la manera en la que te ves.</p>

          <h2>Sentirte bien también se refleja</h2>
          <p>Hay emociones que no necesitan palabras para hacerse visibles.</p>
          <p>La tranquilidad se nota en una expresión más suave. La seguridad se refleja en la postura. La alegría cambia la mirada. El bienestar aparece en la manera en la que caminas, hablas y te relacionas con los demás.</p>
          <p>No significa que todos los días tengas que sentirte feliz o segura. Significa que la belleza también puede surgir en esos momentos en los que vuelves a sentirte presente, conectada contigo y cómoda dentro de tu propia piel.</p>
          <blockquote>A veces, no necesitas cambiar tu rostro.<br /><em>Necesitas recuperar la forma en la que te miras.</em></blockquote>

          <h2>Cuidarte no significa corregirte</h2>
          <p>Un tratamiento de belleza no debería partir de la idea de que hay algo mal en ti.</p>
          <p>Cuidar tu piel, arreglar tus uñas, diseñar tu mirada o recibir un masaje puede ser simplemente una manera de dedicarte tiempo y atención. No para convertirte en alguien diferente, sino para recordarte que también mereces sentirte atendida.</p>
          <p>La belleza puede ser un ritual, una pausa o una experiencia que te ayude a recuperar seguridad. Puede estar en elegir un color que te encanta, en sentir tu piel más suave o en mirarte al espejo y reconocerte con una sonrisa.</p>
          <p>No todo cuidado nace de una inconformidad. También puede nacer del cariño.</p>

          <h2>Tu mejor versión no es otra persona</h2>
          <p>Hablar de tu “mejor versión” no significa perseguir una imagen perfecta, estar siempre arreglada o cumplir con expectativas ajenas.</p>
          <ul><li>Tu mejor versión puede ser la que se siente descansada.</li><li>La que tiene más confianza.</li><li>La que se permite disfrutar.</li><li>La que deja de compararse durante un momento y se concentra en lo que le hace bien.</li></ul>
          <p>No necesitas verte como alguien más para sentirte hermosa. Necesitas encontrar aquello que te ayuda a sentirte más tú.</p>

          <h2>La belleza también puede sentirse</h2>
          <p>No toda transformación tiene que ser evidente para los demás.</p>
          <p>A veces, el cambio más importante es salir de una cita sintiéndote más ligera, más segura o simplemente de mejor ánimo.</p>
          <p>Puede ser la sensación de tener las manos cuidadas, de sentir el rostro fresco, de liberar la tensión que llevabas en el cuerpo o de regalarte un momento que no estuvo dedicado al trabajo, a los pendientes ni a las necesidades de alguien más.</p>
          <p>Eso también es belleza. No solo el resultado que ves frente al espejo, sino la sensación que permanece contigo después.</p>

          <h2>Ayudarte a sentirte tú</h2>
          <p>En Ola Bonita no queremos cambiar quién eres. Queremos crear experiencias que te ayuden a sentirte cómoda, cuidada y segura.</p>
          <p>Que cada tratamiento respete tu esencia. Que puedas elegir lo que te hace sentir bien sin perseguir una idea imposible de perfección.</p>
          <p>Que al mirarte no veas a una persona distinta, sino a ti misma sintiéndote mejor.</p>
          <p>Porque la verdadera belleza no empieza con el maquillaje. Empieza cuando sonríes, cuando descansas, cuando te sientes ligera, cuando vuelves a disfrutar de ti.</p>
          <p>Nuestro trabajo no es transformarte en alguien más. Es ayudarte a reconocer y disfrutar la belleza que ya existe en ti.</p>
        </div>

        <aside className="journal-article-cta"><p className="eyebrow">TU PAUSA EMPIEZA AQUÍ</p><h2>Haz espacio para sentirte <em>bien.</em></h2><Link className="button" href="/reservar">Reservar una cita <span>→</span></Link></aside>
      </article>
      <SiteFooter locale={locale} />
      <WhatsappFab locale={locale} />
    </main>
  );
}
