"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      className="new-booking"
      onClick={() => window.print()}
    >
      Imprimir esta guía
    </button>
  );
}
