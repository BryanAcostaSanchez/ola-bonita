// Clip answers in English with codes a cashier cannot act on. Everything the
// POS shows comes through here so the person holding the card reads what to
// do next, not what the API called it.

export class ClipApiError extends Error {
  readonly code: string | null;
  readonly httpStatus: number;

  constructor(message: string, code: string | null, httpStatus: number) {
    super(message);
    this.name = "ClipApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const codeMessages: Record<string, string> = {
  ERR10_04: "La terminal no está lista: puede estar apagada, sin internet, con la app Clip PinPad cerrada o cobrando otra cosa.",
  PINPAD_TERMINAL_TIMEOUT_EXCEPTION: "La terminal no respondió a tiempo. Revisa que esté encendida, con internet y en la pantalla de cobro.",
  PAYMENT_NOT_FOUND: "Clip ya no encuentra este cobro. Consulta el recibo en la terminal antes de volver a cobrar.",
  DEVICE_UNAVAILABLE: "La terminal no está disponible en este momento.",
  DEVICE_BUSY: "La terminal ya está cobrando. Termina o cancela ese cobro antes de enviar otro.",
};

const statusMessages: Record<number, string> = {
  400: "Clip rechazó el cobro. Revisa que la terminal esté encendida, con internet y en la pantalla de cobro.",
  401: "Las credenciales de Clip no son válidas. Vuelve a guardarlas en Configuración → Pagos.",
  403: "La cuenta de Clip no tiene permiso para cobrar en terminal. Confirma con Clip que la API PinPad esté habilitada.",
  404: "Clip no encontró este cobro.",
  409: "La terminal ya tiene un cobro en curso.",
  412: "Clip está recibiendo demasiadas peticiones. Espera unos segundos e inténtalo de nuevo.",
  500: "Clip tuvo un problema interno. Espera unos segundos e inténtalo de nuevo.",
  502: "No pudimos comunicarnos con Clip.",
  503: "El servicio de Clip no está disponible en este momento.",
};

export function clipErrorMessage(cause: unknown) {
  if (cause instanceof ClipApiError) {
    if (cause.code && codeMessages[cause.code]) return codeMessages[cause.code];
    if (statusMessages[cause.httpStatus]) return statusMessages[cause.httpStatus];
    return cause.message || "Clip rechazó la operación.";
  }
  if (cause instanceof Error && cause.message) return cause.message;
  return "No pudimos comunicarnos con Clip.";
}

// A terminal that cannot take the charge is worth naming, because the fix is
// physical and the cashier is standing next to the device.
export function isTerminalBusyError(cause: unknown) {
  if (!(cause instanceof ClipApiError)) return false;
  return cause.code === "ERR10_04" || cause.code === "DEVICE_BUSY" || cause.httpStatus === 409;
}

export const terminalUnavailableReasons = [
  "La terminal está apagada o se quedó sin batería.",
  "Perdió el Wi‑Fi o la señal es inestable.",
  "La app Clip PinPad está cerrada o la sesión se cerró.",
  "La pantalla está en otra app y no en la de cobro.",
  "Todavía tiene abierto un cobro anterior.",
];
