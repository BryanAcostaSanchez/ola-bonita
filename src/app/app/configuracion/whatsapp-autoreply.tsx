"use client";

import { useState } from "react";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.olabonita.shop";
const bookingUrl = `${siteUrl.replace(/\/$/, "")}/reservar`;

const defaultReply = `¡Hola! Gracias por escribir a Ola Bonita Beauty Spa 🌸

Puedes agendar tu cita tú misma en este link, elegir servicio, especialista y horario, y queda directo en nuestra agenda:
${bookingUrl}

Si tienes alguna duda, escríbenos aquí y te respondemos en cuanto podamos.`;

// Appointments only reach the agenda when they are booked on the site or
// captured by staff. WhatsApp chats never do, so the next best thing is to
// answer every new chat with the booking link.
export function WhatsappAutoreply() {
  const [text, setText] = useState(defaultReply);
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Mensaje copiado. Pégalo en WhatsApp Business como se indica en los pasos.");
    } catch {
      setMessage("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  return (
    <section className="settings-card whatsapp-autoreply">
      <div>
        <p className="eyebrow">WHATSAPP</p>
        <h2>Respuesta automática con el link para reservar</h2>
        <p>
          Las citas que se platican por WhatsApp no entran solas a la agenda. Con esta respuesta, cada persona que
          escriba recibe el link para reservar y su cita queda registrada en la agenda sin capturarla a mano.
        </p>
      </div>
      <label>
        Mensaje
        <textarea value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <div className="pinpad-actions">
        <button type="button" className="new-booking" onClick={() => void copy()}>Copiar mensaje</button>
        <button type="button" className="secondary-button" onClick={() => setText(defaultReply)}>Restaurar texto sugerido</button>
      </div>
      <ol>
        <li>En el celular del negocio abre WhatsApp Business.</li>
        <li>Ve a Herramientas para la empresa → Mensaje de bienvenida y actívalo.</li>
        <li>Borra el texto que trae, pega este mensaje y guarda.</li>
        <li>Opcional: en Herramientas para la empresa → Respuestas rápidas crea una con el atajo /reservar y este mismo texto, para mandarlo a quien ya les había escrito antes.</li>
      </ol>
      <small>WhatsApp manda el mensaje de bienvenida cuando alguien escribe por primera vez o después de 14 días sin conversación.</small>
      {message && <p className="access-message settings-message">{message}</p>}
    </section>
  );
}
