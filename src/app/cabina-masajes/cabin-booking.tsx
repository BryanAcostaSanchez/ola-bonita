"use client";

import { useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n/locale";
import { intlLocale } from "@/lib/i18n/locale";
import { dictionary } from "@/lib/i18n/dictionary";

type Slot = { starts_at:string; ends_at:string; remaining_capacity:number };
const tz = "America/Mexico_City";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone:tz, year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
const keyFor = (date:Date) => new Intl.DateTimeFormat("en-CA", { timeZone:tz, year:"numeric", month:"2-digit", day:"2-digit" }).format(date);

export function CabinBooking({ priceCents, depositEnabled, depositPercent, locale }: { priceCents:number; depositEnabled:boolean; depositPercent:number; locale:Locale }) {
  const t = dictionary[locale].cabin;
  const [date, setDate] = useState("");
  const [month, setMonth] = useState(() => new Date(`${today()}T12:00:00-06:00`));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({ fullName:"", phone:"", email:"" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
    return Array.from({ length:first.getDay() + last.getDate() }, (_, index) => index < first.getDay() ? null : new Date(month.getFullYear(), month.getMonth(), index - first.getDay() + 1, 12));
  }, [month]);
  const minDate = today();

  useEffect(() => {
    if (!date) return;
    fetch(`/api/cabina/availability?date=${date}`).then((response) => response.json()).then((data) => setSlots(data.slots || [])).catch(() => setSlots([]));
  }, [date]);

  function chooseDate(value:string) { setSlots([]); setDate(value); setSelected(""); setMessage(""); }
  async function reserve() {
    if (!date) return setMessage(t.selectDateFirst);
    if (!selected || !form.fullName || !form.phone) return setMessage(t.completeFields);
    setBusy(true);
    const response = await fetch("/api/cabina/reservations", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ ...form, startsAt:selected }) });
    const result = await response.json();
    if (response.ok && result.checkout_url) window.location.assign(result.checkout_url);
    else setMessage(response.ok ? t.confirmed(result.reservation.public_code) : result.error);
    setBusy(false);
  }

  const deposit = Math.round(priceCents * depositPercent / 100);
  const monthName = new Intl.DateTimeFormat(intlLocale(locale), { month:"long", year:"numeric" }).format(month);
  return <div className="cabin-booking calendly-booking">
    <div className="booking-step"><span>1</span><div><strong>{t.step1}</strong><small>{t.step1Hint}</small></div></div>
    <div className="cabin-calendar"><div className="cabin-calendar-nav"><button type="button" aria-label={t.prevMonth} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}>←</button><strong>{monthName}</strong><button type="button" aria-label={t.nextMonth} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}>→</button></div><div className="calendar-weekdays">{t.weekdayInitials.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div><div className="cabin-calendar-days">{days.map((day, index) => day ? <button key={keyFor(day)} type="button" disabled={keyFor(day) < minDate} className={date === keyFor(day) ? "selected" : ""} onClick={() => chooseDate(keyFor(day))}>{day.getDate()}</button> : <i key={`empty-${index}`}/>)}</div></div>
    {date && <><div className="booking-step"><span>2</span><div><strong>{t.step2}</strong><small>{new Intl.DateTimeFormat(intlLocale(locale), { weekday:"long", day:"numeric", month:"long", timeZone:tz }).format(new Date(`${date}T12:00:00-06:00`))}</small></div></div><div className="cabin-slots">{slots.length ? slots.map((slot) => <button type="button" className={selected === slot.starts_at ? "selected" : ""} onClick={() => setSelected(slot.starts_at)} key={slot.starts_at}>{new Intl.DateTimeFormat(intlLocale(locale), { hour:"2-digit", minute:"2-digit", timeZone:tz, hour12: locale === "en" }).format(new Date(slot.starts_at))}</button>) : <p>{t.loadingSlots}</p>}</div></>}
    {selected && <>
      <div className="booking-step"><span>3</span><div><strong>{t.step3}</strong><small>{t.step3Hint}</small></div></div>
      <label>{t.fullName}<input placeholder={t.fullNamePlaceholder} value={form.fullName} onChange={(event) => setForm({ ...form, fullName:event.target.value })}/></label>
      <label>{t.phone}<input placeholder={t.phonePlaceholder} value={form.phone} onChange={(event) => setForm({ ...form, phone:event.target.value })}/></label>
      <label>{t.email}<input placeholder={t.emailPlaceholder} value={form.email} onChange={(event) => setForm({ ...form, email:event.target.value })}/></label>
    </>}
    {depositEnabled && <p className="deposit-note">{t.depositNote(Math.round(deposit / 100))}</p>}
    {selected && <button className="button" disabled={busy} onClick={reserve}>{busy ? t.bookingBusy : depositEnabled ? t.continueToPay : t.confirmBooking}</button>}
    {message && <p className="access-message">{message}</p>}
  </div>;
}
