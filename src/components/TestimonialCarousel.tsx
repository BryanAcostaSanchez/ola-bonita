"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n/locale";
import { dictionary } from "@/lib/i18n/dictionary";

const avatarClasses = ["review-avatar-0", "review-avatar-1", "review-avatar-2", "review-avatar-3", "review-avatar-4"];

export function TestimonialCarousel({ locale }: { locale: Locale }) {
  const t = dictionary[locale].reviews;
  const [index, setIndex] = useState(0);
  const total = t.items.length;
  const current = t.items[index];
  const go = (delta: number) => setIndex((value) => (value + delta + total) % total);

  return (
    <div className="quote-card">
      <div className="review-stars" aria-label="5 estrellas">★★★★★</div>
      <blockquote className="quote-text">&ldquo;{current.quote}&rdquo;</blockquote>
      <div className="quote-author">
        <span className={`review-avatar ${avatarClasses[index % avatarClasses.length]}`}>{current.initial}</span>
        <div><strong>{current.name}</strong><small><span aria-hidden="true">{current.flag}</span> {t.googleLabel}</small></div>
      </div>
      <div className="quote-controls">
        <button type="button" onClick={() => go(-1)} aria-label={t.prev}>←</button>
        <span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        <button type="button" onClick={() => go(1)} aria-label={t.next}>→</button>
      </div>
    </div>
  );
}
