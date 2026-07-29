type BookingEmail = { id: string; public_code: string; starts_at: string; price_cents: number; deposit_due_cents: number; customer: { full_name: string; email: string | null }; service: { name: string }; specialist: { full_name: string } | null };
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olabonita.shop";
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const escape = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);

function details(booking: BookingEmail) {
  const date = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(booking.starts_at));
  return { date, name: escape(booking.customer.full_name), service: escape(booking.service.name), specialist: booking.specialist?.full_name ? escape(booking.specialist.full_name) : "Especialista Ola Bonita" };
}
async function deliver({ to, subject, html, idempotencyKey, scheduledAt }: { to: string; subject: string; html: string; idempotencyKey: string; scheduledAt?: string }) {
  const key = process.env.RESEND_API_KEY; const from = process.env.EMAIL_FROM;
  if (!key || !from) return null;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ from, to: [to], subject, html, ...(scheduledAt ? { scheduled_at: scheduledAt } : {}) }) });
  if (!response.ok) throw new Error("Transactional email failed");
  return response.json() as Promise<{ id: string }>;
}

export async function sendBookingEmails(booking: BookingEmail) {
  if (!booking.customer.email) return;
  const { date, name, service, specialist } = details(booking);
  const reference = `<p style="color:#527271">Código de reserva: <strong>${booking.public_code}</strong></p>`;
  await deliver({ to: booking.customer.email, subject: "Tu reserva en Ola Bonita está apartada", idempotencyKey: `booking-${booking.id}-confirmation`, html: `<main style="font-family:Arial,sans-serif;color:#17494a;max-width:580px;margin:auto"><h1>Hola, ${name} ✦</h1><p>Tu espacio en <strong>Ola Bonita Beauty Spa</strong> está apartado.</p><hr/><p><strong>${service}</strong><br/>${date}<br/>${specialist}</p><p>Total: <strong>${money.format(booking.price_cents / 100)}</strong>${booking.deposit_due_cents ? `<br/>Anticipo pendiente: <strong>${money.format(booking.deposit_due_cents / 100)}</strong>` : ""}</p>${reference}<p>Si necesitas ayuda, contáctanos por teléfono al +52 954 201 0059.</p><p><a href="${siteUrl}">olabonita.shop</a></p></main>` });
  const reminderAt = new Date(new Date(booking.starts_at).getTime() - 24 * 60 * 60 * 1000);
  if (reminderAt.getTime() > Date.now() + 5 * 60 * 1000 && reminderAt.getTime() < Date.now() + 30 * 86400000) await deliver({ to: booking.customer.email, subject: "Mañana te esperamos en Ola Bonita", idempotencyKey: `booking-${booking.id}-reminder-24h`, scheduledAt: reminderAt.toISOString(), html: `<main style="font-family:Arial,sans-serif;color:#17494a;max-width:580px;margin:auto"><h1>Nos vemos mañana ✦</h1><p>Hola, ${name}. Te esperamos para tu cita de <strong>${service}</strong>.</p><p><strong>${date}</strong><br/>${specialist}</p>${reference}<p>Si necesitas ayuda, contáctanos al +52 954 201 0059.</p></main>` });
}
