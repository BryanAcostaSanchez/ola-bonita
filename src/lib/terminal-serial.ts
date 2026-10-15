// Clip reports serials in capitals with no spaces or dashes, while the sticker
// on the reader is often read out with both. Every serial is compared and saved
// in Clip's form, so the one typed in Configuración matches the one Clip sees.
export function normalizeTerminalSerial(serial: string | null | undefined) {
  return (serial ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}
