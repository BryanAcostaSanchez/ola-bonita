"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Hint } from "./hint";

type Category = { id: string; name: string };
type Rule = {
  category_id: string;
  custom_schedule_enabled: boolean;
  web_booking_capacity: number;
  rental_space_id?: string | null;
};
type Hour = {
  category_id: string;
  day_of_week: number;
  opens_at: string;
  closes_at: string;
  active: boolean;
};

const days = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
const fallback = [
  { day_of_week: 0, opens_at: "10:00", closes_at: "16:00", active: true },
  { day_of_week: 1, opens_at: "09:00", closes_at: "18:00", active: true },
  { day_of_week: 2, opens_at: "09:00", closes_at: "18:00", active: true },
  { day_of_week: 3, opens_at: "09:00", closes_at: "18:00", active: true },
  { day_of_week: 4, opens_at: "09:00", closes_at: "18:00", active: true },
  { day_of_week: 5, opens_at: "09:00", closes_at: "18:00", active: true },
  { day_of_week: 6, opens_at: "10:00", closes_at: "16:00", active: true },
];

export function CategoryBookingSettings({
  categories,
  rules,
  hours,
  defaultHours,
  rentalSpaces,
}: {
  categories: Category[];
  rules: Rule[];
  hours: Hour[];
  defaultHours: Array<{
    day_of_week: number;
    opens_at: string;
    closes_at: string;
    active: boolean;
  }>;
  rentalSpaces: Array<{ id: string; name: string }>;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const selectedRule = useMemo(
    () => rules.find((rule) => rule.category_id === categoryId),
    [categoryId, rules],
  );
  const initialHours = (id: string) => {
    const saved = hours.filter((hour) => hour.category_id === id);
    const source = saved.length
      ? saved
      : defaultHours.length
        ? defaultHours
        : fallback;
    return source.map((hour) => ({
      ...hour,
      opens_at: hour.opens_at.slice(0, 5),
      closes_at: hour.closes_at.slice(0, 5),
    }));
  };
  const [custom, setCustom] = useState(
    selectedRule?.custom_schedule_enabled ?? false,
  );
  const [capacity, setCapacity] = useState(
    String(selectedRule?.web_booking_capacity ?? 1),
  );
  const [rentalSpaceId, setRentalSpaceId] = useState(
    selectedRule?.rental_space_id ?? "",
  );
  const [schedule, setSchedule] = useState(() => initialHours(categoryId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function selectCategory(id: string) {
    setCategoryId(id);
    const rule = rules.find((item) => item.category_id === id);
    setCustom(rule?.custom_schedule_enabled ?? false);
    setCapacity(String(rule?.web_booking_capacity ?? 1));
    setRentalSpaceId(rule?.rental_space_id ?? "");
    setSchedule(initialHours(id));
    setMessage("");
  }

  async function save() {
    if (!categoryId) return;
    setBusy(true);
    setMessage("");
    const client = createClient();
    const { error } = await client.rpc("save_category_booking_settings", {
      p_category_id: categoryId,
      p_custom_schedule_enabled: custom,
      p_web_booking_capacity: Math.max(1, Number(capacity)),
      p_hours: schedule,
    });
    if (!error) {
      const { error: spaceError } = await client.rpc(
        "set_category_booking_space",
        { p_category_id: categoryId, p_rental_space_id: rentalSpaceId || null },
      );
      if (spaceError) {
        setBusy(false);
        setMessage(spaceError.message);
        return;
      }
    }
    setBusy(false);
    setMessage(
      error?.message ||
        (custom
          ? "Disponibilidad de categoría guardada. La web ya la usa al buscar horarios."
          : "La categoría vuelve a usar el horario general."),
    );
  }

  if (!categories.length) return null;
  return (
    <section className="settings-card category-booking-settings">
      <p className="eyebrow">EXCEPCIONES POR CATEGORÍA</p>
      <h2>Disponibilidad por tipo de servicio</h2>
      <p>
        Elige si esta categoría usa el horario general del spa o si necesita
        su propio horario y límite de citas.
      </p>
      <div className="category-booking-picker">
        <label>
          Categoría
          <select
            value={categoryId}
            onChange={(event) => selectCategory(event.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Espacio requerido{" "}
          <Hint text="Al vincular Masajes con la Cabina de masajes, las citas de masaje y las rentas externas comparten la misma capacidad. La primera reserva bloquea la otra; una cancelación libera el horario." />
          <select
            value={rentalSpaceId}
            onChange={(event) => setRentalSpaceId(event.target.value)}
          >
            <option value="">No requiere un espacio</option>
            {rentalSpaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
          <small>
            Una reserva del espacio o un servicio vinculado bloquean ambos
            calendarios.
          </small>
        </label>
      </div>
      <fieldset className="schedule-mode">
        <legend>¿Qué horario debe usar {categories.find((category) => category.id === categoryId)?.name}?</legend>
        <label className={!custom ? "selected" : ""}>
          <input type="radio" name="schedule-mode" checked={!custom} onChange={() => setCustom(false)} />
          <span><strong>Horario general del spa</strong><small>Usa los horarios de la Agenda web y su capacidad general.</small></span>
        </label>
        <label className={custom ? "selected" : ""}>
          <input type="radio" name="schedule-mode" checked={custom} onChange={() => setCustom(true)} />
          <span><strong>Horario propio para esta categoría</strong><small>Define aquí los días, horas y máximo de citas simultáneas.</small></span>
        </label>
      </fieldset>
      {custom && (
        <div className="custom-schedule-panel">
          <label className="category-capacity">
            Máximo de citas simultáneas <Hint text="La web no ofrecerá más citas de esta categoría al mismo tiempo que este límite." />
            <input type="number" min="1" max="50" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
          </label>
          <p>Configura el horario propio que se mostrará para esta categoría.</p>
          <div className="web-agenda-days category-booking-days">
          {schedule.map((hour, index) => (
            <div key={hour.day_of_week}>
              <label>
                <input
                  type="checkbox"
                  checked={hour.active}
                  onChange={(event) =>
                    setSchedule((current) =>
                      current.map((item, position) =>
                        position === index
                          ? { ...item, active: event.target.checked }
                          : item,
                      ),
                    )
                  }
                />
                <strong>{days[hour.day_of_week]}</strong>
              </label>
              <input
                type="time"
                disabled={!hour.active}
                value={hour.opens_at}
                onChange={(event) =>
                  setSchedule((current) =>
                    current.map((item, position) =>
                      position === index
                        ? { ...item, opens_at: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <span>—</span>
              <input
                type="time"
                disabled={!hour.active}
                value={hour.closes_at}
                onChange={(event) =>
                  setSchedule((current) =>
                    current.map((item, position) =>
                      position === index
                        ? { ...item, closes_at: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </div>
          ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className="new-booking"
        disabled={busy}
        onClick={save}
      >
        {busy ? "Guardando…" : "Guardar disponibilidad"}
      </button>
      {message && <p className="access-message">{message}</p>}
    </section>
  );
}
