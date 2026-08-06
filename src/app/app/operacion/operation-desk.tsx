"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Category = { id: string; name: string };
type Service = {
  id: string;
  name: string;
  price_cents: number;
  category: Category | Category[] | null;
};
type CashSession = {
  id: string;
  opening_float_cents: number;
  opened_at: string;
} | null;
type FinanceOption = { id: string; name: string; color: string };
type Specialist = {
  id: string;
  full_name: string;
  commission_percent?: number | null;
};
type CustomService = {
  id: string;
  description: string;
  amount: string;
  note: string;
  commissionPercent: string;
  specialistId: string;
  externalProvider: boolean;
  externalProviderName: string;
  externalPaymentMethod: Method;
};
type Customer = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
};
type Method = "cash" | "card" | "transfer";

type PosDraft = Partial<{
  cart: Record<string, number>;
  customServices: CustomService[];
  selectedCategoryId: string | null;
  method: Method;
  splitPayment: boolean;
  firstSplitMethod: Method;
  secondSplitMethod: Method;
  firstSplitAmount: string;
  customerName: string;
  customerPhone: string;
  clientDraft: {
    fullName: string;
    phone: string;
    email: string;
    notes: string;
  };
}>;
const posDraftKey = "ola-bonita:pos-draft:v2";
function readPosDraft(): PosDraft {
  if (typeof window === "undefined") return {};
  try {
    const current = sessionStorage.getItem(posDraftKey);
    if (current) return JSON.parse(current);
    const previous = JSON.parse(
      sessionStorage.getItem("ola-bonita:pos-draft:v1") || "{}",
    ) as PosDraft;
    // Preserve an unfinished ticket but intentionally reset the legacy default.
    delete previous.method;
    delete previous.firstSplitMethod;
    sessionStorage.removeItem("ola-bonita:pos-draft:v1");
    return previous;
  } catch {
    sessionStorage.removeItem(posDraftKey);
    return {};
  }
}

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});
const currencyInputValue = (value: string) => {
  const cleaned = value.replace(/[^\d.,]/g, "");
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  if (comma >= 0 && dot >= 0)
    return comma > dot
      ? cleaned.replaceAll(".", "").replace(",", ".")
      : cleaned.replaceAll(",", "");
  return cleaned.replace(",", ".");
};
const currencyInputFormat = (value: string) => {
  const amount = Number(currencyInputValue(value));
  return Number.isFinite(amount) && amount > 0
    ? new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : "";
};

function friendlyError(message: string) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("abre caja") ||
    normalized.includes("caja antes") ||
    normalized.includes("cash session")
  )
    return "Abre la caja antes de cobrar o registrar un gasto en efectivo.";
  if (
    normalized.includes("subtotal_cents") ||
    normalized.includes("not-null constraint")
  )
    return "No pudimos registrar la venta. Actualiza la configuración de ventas en Supabase y vuelve a intentarlo.";
  if (normalized.includes("importes deben sumar"))
    return "Los dos importes deben sumar exactamente el total del ticket.";
  if (normalized.includes("método de pago no está habilitado"))
    return "Ese método de pago no está habilitado en Configuración.";
  return "No pudimos completar la operación. Revisa los datos e inténtalo de nuevo.";
}

function Methods({
  value,
  change,
}: {
  value: Method;
  change: (method: Method) => void;
}) {
  const labels: Record<Method, string> = {
    cash: "Efectivo",
    card: "Tarjeta",
    transfer: "Transferencia",
  };

  return (
    <div className="payment-methods" aria-label="Método de pago">
      {(Object.keys(labels) as Method[]).map((method) => (
        <button
          type="button"
          className={value === method ? "selected" : ""}
          onClick={() => change(method)}
          key={method}
        >
          {labels[method]}
        </button>
      ))}
    </div>
  );
}

function SwipeCartLine({
  service,
  quantity,
  onAdd,
  onRemove,
}: {
  service: Service;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [offset, setOffset] = useState(0);

  const finishSwipe = () => {
    if (offset >= 56) onAdd();
    if (offset <= -56) onRemove();
    start.current = null;
    setOffset(0);
  };

  return (
    <div className="cart-swipe-shell">
      <div
        className="cart-line cart-line-swipe"
        title="Desliza a la derecha para sumar o a la izquierda para restar"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          start.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!start.current) return;
          const horizontal = event.clientX - start.current.x;
          const vertical = event.clientY - start.current.y;
          if (Math.abs(vertical) > Math.abs(horizontal) + 8) return;
          setOffset(Math.max(-82, Math.min(82, horizontal)));
        }}
        onPointerUp={finishSwipe}
        onPointerCancel={() => {
          start.current = null;
          setOffset(0);
        }}
      >
        <div>
          <strong>{service.name}</strong>
          <small>{money.format(service.price_cents / 100)} c/u</small>
        </div>
        <div className="cart-adjust">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar uno de ${service.name}`}
          >
            −
          </button>
          <strong>{quantity}</strong>
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Agregar otro ${service.name}`}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export function OperationDesk({
  services,
  specialists,
  cashSession,
  staffName,
  expenseCategories,
  expenseTags,
  defaultCommissionPercent,
}: {
  services: Service[];
  specialists: Specialist[];
  cashSession: CashSession;
  staffName: string;
  expenseCategories: FinanceOption[];
  expenseTags: FinanceOption[];
  defaultCommissionPercent: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const ticketRef = useRef<HTMLElement>(null);
  const [initialDraft] = useState(readPosDraft);
  const [cart, setCart] = useState<Record<string, number>>(
    () => initialDraft.cart ?? {},
  );
  const [customServices, setCustomServices] = useState<CustomService[]>(
    () => initialDraft.customServices ?? [],
  );
  const [customDraft, setCustomDraft] = useState<Omit<CustomService, "id">>({
    description: "Servicio personalizado",
    amount: "",
    note: "",
    commissionPercent: String(defaultCommissionPercent),
    specialistId: "",
    externalProvider: false,
    externalProviderName: "",
    externalPaymentMethod: "cash",
  });
  const [saleNote, setSaleNote] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    () => initialDraft.selectedCategoryId ?? null,
  );
  const [method, setMethod] = useState<Method>(
    () => initialDraft.method ?? "card",
  );
  const [splitPayment, setSplitPayment] = useState(
    () => initialDraft.splitPayment ?? false,
  );
  const [firstSplitMethod, setFirstSplitMethod] = useState<Method>(
    () => initialDraft.firstSplitMethod ?? "card",
  );
  const [secondSplitMethod, setSecondSplitMethod] = useState<Method>(
    () => initialDraft.secondSplitMethod ?? "card",
  );
  const [firstSplitAmount, setFirstSplitAmount] = useState(
    () => initialDraft.firstSplitAmount ?? "",
  );
  const [customerName, setCustomerName] = useState(
    () => initialDraft.customerName ?? "",
  );
  const [customerPhone, setCustomerPhone] = useState(
    () => initialDraft.customerPhone ?? "",
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [searchedCustomer, setSearchedCustomer] = useState(false);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientDraft, setClientDraft] = useState(
    () =>
      initialDraft.clientDraft ?? {
        fullName: "",
        phone: "",
        email: "",
        notes: "",
      },
  );
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [cashModal, setCashModal] = useState<"open" | "adjust" | null>(null);
  const [expense, setExpense] = useState({
    category: "",
    description: "",
    amount: "",
    method: "cash" as Method,
    tagIds: [] as string[],
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    sessionStorage.setItem(
      posDraftKey,
      JSON.stringify({
        cart,
        customServices,
        selectedCategoryId,
        method,
        splitPayment,
        firstSplitMethod,
        secondSplitMethod,
        firstSplitAmount,
        customerName,
        customerPhone,
        clientDraft,
      }),
    );
  }, [
    cart,
    customServices,
    selectedCategoryId,
    method,
    splitPayment,
    firstSplitMethod,
    secondSplitMethod,
    firstSplitAmount,
    customerName,
    customerPhone,
    clientDraft,
  ]);
  useEffect(() => {
    const term = customerSearch.replace(/[,%()]/g, "").trim();
    const timeout = window.setTimeout(async () => {
      if (term.length < 2) {
        setCustomerResults([]);
        setSearchedCustomer(false);
        setSearchingCustomer(false);
        return;
      }
      setSearchingCustomer(true);
      const { data } = await supabase
        .from("customers")
        .select("id,full_name,phone,email")
        .or(
          `full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`,
        )
        .limit(5);
      setCustomerResults(data ?? []);
      setSearchedCustomer(true);
      setSearchingCustomer(false);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [customerSearch, supabase]);

  const qty = (id: string) => cart[id] ?? 0;
  const categoryOf = (service: Service) =>
    Array.isArray(service.category) ? service.category[0] : service.category;
  const categories = useMemo(() => {
    const grouped = new Map<
      string,
      { id: string; name: string; count: number }
    >();
    services.forEach((service) => {
      const category = categoryOf(service) || {
        id: "other",
        name: "Otros servicios",
      };
      const current = grouped.get(category.id);
      grouped.set(category.id, {
        ...category,
        count: (current?.count ?? 0) + 1,
      });
    });
    return [...grouped.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "es"),
    );
  }, [services]);
  const selectedCategory = categories.find(
    (category) => category.id === selectedCategoryId,
  );
  const isCustomService = selectedCategoryId === "custom";
  const visibleServices = selectedCategoryId
    ? services.filter(
        (service) =>
          (categoryOf(service)?.id || "other") === selectedCategoryId,
      )
    : [];
  const cents = (value: string) =>
    Math.round(Number(currencyInputValue(value)) * 100);
  const total = useMemo(
    () =>
      services.reduce(
        (sum, service) => sum + (cart[service.id] ?? 0) * service.price_cents,
        0,
      ) +
      customServices.reduce(
        (sum, service) => sum + Math.max(0, cents(service.amount || "0")),
        0,
      ),
    [cart, services, customServices],
  );
  const itemCount = useMemo(
    () =>
      Object.values(cart).reduce((sum, amount) => sum + amount, 0) +
      customServices.length,
    [cart, customServices],
  );
  const add = (id: string) =>
    setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  const remove = (id: string) =>
    setCart((current) => ({
      ...current,
      [id]: Math.max(0, (current[id] ?? 0) - 1),
    }));
  const addCustomService = () => {
    const amount = cents(customDraft.amount || "0");
    const commissionPercent = Number(
      customDraft.commissionPercent.replace(",", ".") || 0,
    );
    if (
      !customDraft.description.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0
    )
      return setNotice(
        "Agrega el nombre y un importe válido para el servicio personalizado.",
      );
    if (
      !Number.isFinite(commissionPercent) ||
      commissionPercent < 0 ||
      commissionPercent > 100
    )
      return setNotice("La comisión debe ser un porcentaje entre 0 y 100.");
    if (
      customDraft.externalProvider &&
      !customDraft.externalProviderName.trim()
    )
      return setNotice("Indica el nombre del prestador externo.");
    if (
      commissionPercent > 0 &&
      !customDraft.externalProvider &&
      !customDraft.specialistId
    )
      return setNotice("Selecciona a quién se pagó la comisión.");
    const serviceName = customDraft.description.trim();
    setCustomServices((current) => [
      ...current,
      { ...customDraft, description: serviceName, id: crypto.randomUUID() },
    ]);
    setCustomDraft({
      description: "Servicio personalizado",
      amount: "",
      note: "",
      commissionPercent: String(defaultCommissionPercent),
      specialistId: "",
      externalProvider: false,
      externalProviderName: "",
      externalPaymentMethod: "cash",
    });
    setSelectedCategoryId(null);
    setNotice(
      `${serviceName} se agregó al ticket por ${money.format(amount / 100)}.`,
    );
    requestAnimationFrame(() =>
      ticketRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const firstSplitCents = Math.max(0, cents(firstSplitAmount || "0"));
  const remainingSplitCents = Math.max(0, total - firstSplitCents);
  const splitIsValid = firstSplitCents > 0 && remainingSplitCents > 0;

  const run = async (
    work: () => PromiseLike<{ error: { message: string } | null }>,
    success: string,
    clearPosDraft = false,
  ) => {
    setBusy(true);
    setNotice(null);
    const { error } = await work();
    setBusy(false);
    if (error) return setNotice(friendlyError(error.message));
    if (clearPosDraft) sessionStorage.removeItem(posDraftKey);
    setNotice(success);
    window.setTimeout(() => window.location.reload(), 500);
  };

  const checkout = () => {
    if (!cashSession) {
      setNotice("Abre caja para registrar ventas. Tu ticket se conservará mientras la abres.");
      setOpening("");
      setCashModal("open");
      return;
    }
    return run(
      () =>
        supabase.rpc("record_pos_sale", {
          p_items: [
            ...services
              .filter((service) => qty(service.id))
              .map((service) => ({
                service_id: service.id,
                quantity: qty(service.id),
                sale_note: saleNote.trim() || null,
              })),
            ...customServices.map((service) => ({
              description: service.description.trim(),
              quantity: 1,
              unit_price_cents: cents(service.amount),
              commission_percent: Number(
                (
                  service.commissionPercent ?? String(defaultCommissionPercent)
                ).replace(",", ".") || 0,
              ),
              specialist_id: service.externalProvider
                ? null
                : service.specialistId || null,
              external_provider_name: service.externalProvider
                ? service.externalProviderName.trim()
                : null,
              external_payment_method: service.externalProvider
                ? service.externalPaymentMethod
                : null,
              note: service.note.trim() || null,
              sale_note: saleNote.trim() || null,
            })),
          ],
          p_payment_method: splitPayment ? firstSplitMethod : method,
          p_customer_name: customerName || null,
          p_customer_phone: customerPhone || null,
          p_payments: splitPayment
            ? [
                { method: firstSplitMethod, amount_cents: firstSplitCents },
                {
                  method: secondSplitMethod,
                  amount_cents: remainingSplitCents,
                },
              ]
            : null,
        }),
      "Venta registrada.",
      true,
    );
  };
  const openCash = () =>
    run(
      () =>
        supabase.rpc("open_cash_session", {
          p_opening_float_cents: cents(opening || "0"),
        }),
      "Caja abierta.",
    );
  const adjustOpening = () =>
    run(
      () =>
        supabase.rpc("adjust_opening_cash", {
          p_opening_float_cents: cents(opening || "0"),
        }),
      "Fondo inicial actualizado.",
    );
  const closeCash = () =>
    run(
      () =>
        supabase.rpc("close_cash_session", {
          p_counted_cash_cents: cents(counted || "0"),
          p_notes: null,
        }),
      "Corte de caja guardado.",
    );
  const saveExpense = () =>
    run(
      () =>
        supabase.rpc("record_expense", {
          p_category: expense.category,
          p_description: expense.description || null,
          p_amount_cents: cents(expense.amount),
          p_payment_method: expense.method,
          p_expense_date: null,
          p_tag_ids: expense.tagIds,
        }),
      "Gasto registrado.",
    );

  async function saveCustomer() {
    if (!clientDraft.fullName.trim() || !clientDraft.phone.trim()) {
      setNotice("Escribe al menos el nombre y teléfono del cliente.");
      return;
    }
    setBusy(true);
    setNotice(null);
    const { data, error } = await supabase
      .from("customers")
      .insert({
        full_name: clientDraft.fullName.trim(),
        phone: clientDraft.phone.trim(),
        email: clientDraft.email.trim() || null,
        notes: clientDraft.notes.trim() || null,
      })
      .select("id,full_name,phone,email")
      .single();
    setBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    setCustomerName(clientDraft.fullName.trim());
    setCustomerPhone(clientDraft.phone.trim());
    setCustomerSearch("");
    setCustomerResults(data ? [data] : []);
    setShowClientForm(false);
    setNotice(
      `${clientDraft.fullName.trim()} se agregó a clientes y quedó asociado al ticket.`,
    );
  }

  return (
    <main className="ops-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span>Ola</span> Bonita<small>BEAUTY SPA</small>
        </Link>
        <nav>
          <Link href="/app">
            ▦ <span>Agenda</span>
          </Link>
          <Link className="active" href="/app/operacion">
            ◇ <span>Ventas y caja</span>
          </Link>
          <Link href="/app/analitica">
            ◔ <span>Analítica</span>
          </Link>
          <Link href="/app/configuracion">
            ⚙ <span>Configuración</span>
          </Link>
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{staffName.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{staffName}</strong>
            <small>Equipo Ola Bonita</small>
          </div>
        </div>
      </aside>
      <section className="ops-main">
        <header className="ops-header">
          <div>
            <p className="eyebrow">PUNTO DE VENTA</p>
            <h1>
              Operación diaria <span>✦</span>
            </h1>
          </div>
          <Link className="new-booking" href="/app">
            Ver agenda
          </Link>
        </header>
        {notice && <p className="operation-notice">{notice}</p>}
        <div className="operations-grid touch-pos-grid">
          <section className="operation-card pos-catalog">
            <div className="section-top">
              <div>
                <h2>
                  {isCustomService
                    ? "Cobro personalizado"
                    : selectedCategory
                      ? selectedCategory.name
                      : "Nueva venta"}
                </h2>
                <p>
                  {isCustomService
                    ? "Agrega un concepto e importe; quedará listo para cobrar en el ticket."
                    : selectedCategory
                      ? "Toca un servicio para agregarlo al ticket."
                      : "Primero selecciona una categoría."}
                </p>
              </div>
              <span className="touch-hint">◉ Modo táctil</span>
            </div>
            {selectedCategory === undefined &&
            selectedCategoryId === "custom" ? (
              <>
                <button
                  type="button"
                  className="back-to-categories"
                  onClick={() => setSelectedCategoryId(null)}
                >
                  ← Ver categorías
                </button>
                <div className="operation-inputs">
                  <input
                    value={customDraft.description}
                    onChange={(event) =>
                      setCustomDraft({
                        ...customDraft,
                        description: event.target.value,
                      })
                    }
                    placeholder="Nombre del servicio"
                  />
                  <label className="currency-field">
                    <span>Importe a cobrar</span>
                    <input
                      value={customDraft.amount}
                      onChange={(event) =>
                        setCustomDraft({
                          ...customDraft,
                          amount: currencyInputValue(event.target.value),
                        })
                      }
                      onFocus={() =>
                        setCustomDraft({
                          ...customDraft,
                          amount: currencyInputValue(customDraft.amount),
                        })
                      }
                      onBlur={() =>
                        setCustomDraft({
                          ...customDraft,
                          amount: currencyInputFormat(customDraft.amount),
                        })
                      }
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]*"
                      enterKeyHint="next"
                      placeholder="$0.00"
                      aria-label="Importe a cobrar en pesos mexicanos"
                    />
                    <small>MXN</small>
                  </label>
                  <input
                    value={customDraft.note}
                    onChange={(event) =>
                      setCustomDraft({
                        ...customDraft,
                        note: event.target.value,
                      })
                    }
                    placeholder="Nota de venta (opcional)"
                  />
                  <p className="service-provider-label">
                    ¿Quién realiza este servicio?
                  </p>
                  <label className="external-provider-toggle">
                    <input
                      type="checkbox"
                      checked={customDraft.externalProvider}
                      onChange={(event) =>
                        setCustomDraft({
                          ...customDraft,
                          externalProvider: event.target.checked,
                          specialistId: event.target.checked
                            ? ""
                            : customDraft.specialistId,
                        })
                      }
                    />
                    <span>
                      <strong>Lo realiza un prestador externo</strong>
                      <small>No tendrá cuenta ni acceso a la app.</small>
                    </span>
                  </label>
                  <input
                    value={customDraft.commissionPercent}
                    onChange={(event) =>
                      setCustomDraft({
                        ...customDraft,
                        commissionPercent: event.target.value,
                      })
                    }
                    inputMode="decimal"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="Porcentaje de comisión"
                  />
                  {customDraft.externalProvider ? (
                    <div className="external-provider-fields">
                      <input
                        value={customDraft.externalProviderName}
                        onChange={(event) =>
                          setCustomDraft({
                            ...customDraft,
                            externalProviderName: event.target.value,
                          })
                        }
                        placeholder="Nombre del prestador externo"
                      />
                      <select
                        value={customDraft.externalPaymentMethod}
                        onChange={(event) =>
                          setCustomDraft({
                            ...customDraft,
                            externalPaymentMethod: event.target.value as Method,
                          })
                        }
                      >
                        <option value="cash">
                          Comisión pagada en efectivo
                        </option>
                        <option value="transfer">
                          Comisión pagada por transferencia
                        </option>
                        <option value="card">
                          Comisión pagada con tarjeta
                        </option>
                      </select>
                      <small>
                        Se liquida al finalizar este servicio. Usa el porcentaje
                        global por defecto o cámbialo para esta venta; al
                        cobrar, se registra como gasto vinculado.
                      </small>
                    </div>
                  ) : Number(customDraft.commissionPercent || 0) > 0 &&
                    specialists.length ? (
                    <select
                      value={customDraft.specialistId}
                      onChange={(event) => {
                        const specialist = specialists.find(
                          (item) => item.id === event.target.value,
                        );
                        setCustomDraft({
                          ...customDraft,
                          specialistId: event.target.value,
                          commissionPercent:
                            specialist?.commission_percent == null
                              ? String(defaultCommissionPercent)
                              : String(specialist.commission_percent),
                        });
                      }}
                    >
                      <option value="">Selecciona especialista</option>
                      {specialists.map((specialist) => (
                        <option value={specialist.id} key={specialist.id}>
                          {specialist.full_name}
                        </option>
                      ))}
                    </select>
                  ) : Number(customDraft.commissionPercent || 0) > 0 ? (
                    <small className="service-provider-note">
                      No hay especialistas activas. Usa “prestador externo” o
                      agrega una integrante al equipo.
                    </small>
                  ) : null}
                  <button
                    type="button"
                    className="secondary-operation"
                    onClick={addCustomService}
                    disabled={
                      !customDraft.externalProvider &&
                      Number(customDraft.commissionPercent || 0) > 0 &&
                      !specialists.length
                    }
                  >
                    Agregar al ticket
                  </button>
                </div>
              </>
            ) : selectedCategory ? (
              <>
                <button
                  type="button"
                  className="back-to-categories"
                  onClick={() => setSelectedCategoryId(null)}
                >
                  ← Ver categorías
                </button>
                <div className="pos-services">
                  {visibleServices.map((service) => (
                    <button
                      type="button"
                      key={service.id}
                      onClick={() => add(service.id)}
                      aria-label={`Agregar ${service.name}`}
                    >
                      <span>{service.name}</span>
                      <strong>{money.format(service.price_cents / 100)}</strong>
                      <small>
                        {qty(service.id)
                          ? `${qty(service.id)} en ticket`
                          : "Tocar para agregar"}
                      </small>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="pos-categories">
                {categories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    onClick={() => setSelectedCategoryId(category.id)}
                  >
                    <span>{category.name}</span>
                    <small>
                      {category.count}{" "}
                      {category.count === 1 ? "servicio" : "servicios"}
                    </small>
                    <b>Ver servicios →</b>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId("custom")}
                >
                  <span>Servicio personalizado</span>
                  <small>Monto, nota y comisión manual</small>
                  <b>Agregar →</b>
                </button>
              </div>
            )}
          </section>
          <section
            className="operation-card pos-ticket"
            ref={ticketRef}
            tabIndex={-1}
          >
            <div className="section-top">
              <div>
                <h2>Ticket actual</h2>
                <p>
                  {itemCount
                    ? `${itemCount} ${itemCount === 1 ? "servicio" : "servicios"}`
                    : "Aún no agregas servicios"}
                </p>
              </div>
              <strong className="ticket-total">
                {money.format(total / 100)}
              </strong>
            </div>
            <div className="cart-lines">
              {services
                .filter((service) => qty(service.id))
                .map((service) => (
                  <SwipeCartLine
                    key={service.id}
                    service={service}
                    quantity={qty(service.id)}
                    onAdd={() => add(service.id)}
                    onRemove={() => remove(service.id)}
                  />
                ))}
              {customServices.map((service) => (
                <div className="cart-line" key={service.id}>
                  <div>
                    <strong>{service.description}</strong>
                    <small>
                      {service.note || "Servicio personalizado"}
                      {Number(service.commissionPercent || 0) > 0
                        ? ` · Comisión ${service.commissionPercent}% (${money.format(Math.round((cents(service.amount) * Number(service.commissionPercent)) / 100) / 100)})`
                        : ""}
                      {service.externalProvider
                        ? ` · Externo: ${service.externalProviderName}`
                        : ""}
                    </small>
                  </div>
                  <div className="cart-adjust">
                    <strong>{money.format(cents(service.amount) / 100)}</strong>
                    <button
                      type="button"
                      aria-label={`Quitar ${service.description}`}
                      onClick={() =>
                        setCustomServices((current) =>
                          current.filter((item) => item.id !== service.id),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              {!itemCount && (
                <p className="empty-ticket">
                  Selecciona los servicios del panel izquierdo.
                </p>
              )}
            </div>
            {!!itemCount && (
              <p className="cart-swipe-hint">
                Desliza un servicio: derecha suma · izquierda resta.
              </p>
            )}
            <div className="pos-customer">
              <div className="section-top">
                <div>
                  <h3>Cliente</h3>
                  <p>
                    {customerName
                      ? "Cliente asociado al ticket"
                      : "Opcional: busca antes de cobrar"}
                  </p>
                </div>
                {customerName && (
                  <button
                    type="button"
                    className="add-customer"
                    onClick={() => {
                      setCustomerName("");
                      setCustomerPhone("");
                      setCustomerSearch("");
                      setShowClientForm(false);
                    }}
                  >
                    Quitar
                  </button>
                )}
              </div>
              {!customerName && (
                <>
                  <div className="customer-search-wrap">
                    <input
                      className="customer-search"
                      value={customerSearch}
                      onChange={(event) => {
                        setCustomerSearch(event.target.value);
                        setShowClientForm(false);
                      }}
                      placeholder="Buscar por nombre, teléfono o correo"
                    />
                    <button
                      type="button"
                      className="customer-quick-add"
                      aria-label="Agregar cliente nuevo"
                      onClick={() => {
                        setClientDraft((draft) => ({
                          ...draft,
                          fullName: customerSearch || draft.fullName,
                        }));
                        setCustomerResults([]);
                        setShowClientForm(true);
                      }}
                    >
                      + Cliente
                    </button>
                  </div>
                  {searchingCustomer && (
                    <small className="customer-search-note">Buscando…</small>
                  )}
                  {customerResults.length > 0 && (
                    <div className="customer-results">
                      {customerResults.map((customer) => (
                        <button
                          type="button"
                          key={customer.id}
                          onClick={() => {
                            setCustomerName(customer.full_name);
                            setCustomerPhone(customer.phone ?? "");
                            setCustomerSearch("");
                            setCustomerResults([]);
                          }}
                        >
                          <strong>{customer.full_name}</strong>
                          <small>
                            {customer.phone || customer.email || "Sin contacto"}
                          </small>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchedCustomer &&
                    !searchingCustomer &&
                    customerResults.length === 0 && (
                      <div className="customer-empty">
                        <span>No encontramos a “{customerSearch}”.</span>
                        <button
                          type="button"
                          className="add-customer"
                          onClick={() => {
                            setClientDraft((draft) => ({
                              ...draft,
                              fullName: customerSearch,
                            }));
                            setShowClientForm(true);
                          }}
                        >
                          + Agregar cliente
                        </button>
                      </div>
                    )}
                  {showClientForm && (
                    <div className="customer-form">
                      <input
                        value={clientDraft.fullName}
                        onChange={(event) =>
                          setClientDraft({
                            ...clientDraft,
                            fullName: event.target.value,
                          })
                        }
                        placeholder="Nombre completo *"
                      />
                      <input
                        value={clientDraft.phone}
                        onChange={(event) =>
                          setClientDraft({
                            ...clientDraft,
                            phone: event.target.value,
                          })
                        }
                        inputMode="tel"
                        placeholder="Teléfono *"
                      />
                      <input
                        value={clientDraft.email}
                        onChange={(event) =>
                          setClientDraft({
                            ...clientDraft,
                            email: event.target.value,
                          })
                        }
                        inputMode="email"
                        placeholder="Correo (opcional)"
                      />
                      <input
                        value={clientDraft.notes}
                        onChange={(event) =>
                          setClientDraft({
                            ...clientDraft,
                            notes: event.target.value,
                          })
                        }
                        placeholder="Notas (opcional)"
                      />
                      <button
                        type="button"
                        className="secondary-operation"
                        disabled={busy}
                        onClick={saveCustomer}
                      >
                        Guardar cliente
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            <input
              value={saleNote}
              onChange={(event) => setSaleNote(event.target.value)}
              placeholder="Nota de venta (opcional)"
            />
            {!cashSession && <aside className="cash-required-notice" aria-label="Caja cerrada"><span className="cash-required-icon" aria-hidden="true">$</span><div className="cash-required-copy"><span>CAJA CERRADA</span><strong>Abre la caja antes de cobrar</strong><p>Tu ticket se conserva mientras registras el fondo inicial.</p></div><button type="button" className="cash-required-action" onClick={() => { setOpening(""); setCashModal("open"); }}>Abrir caja <span aria-hidden="true">→</span></button></aside>}
            <div className="payment-heading">
              <p className="payment-label">¿Cómo pagó?</p>
              <button
                type="button"
                className={
                  splitPayment ? "split-toggle active" : "split-toggle"
                }
                onClick={() => {
                  setSplitPayment((current) => !current);
                  setFirstSplitAmount("");
                }}
              >
                Pago dividido
              </button>
            </div>
            {!splitPayment ? (
              <Methods value={method} change={setMethod} />
            ) : (
              <div className="split-payment">
                <div>
                  <select
                    value={firstSplitMethod}
                    onChange={(event) =>
                      setFirstSplitMethod(event.target.value as Method)
                    }
                  >
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="transfer">Transferencia</option>
                  </select>
                  <input
                    inputMode="decimal"
                    value={firstSplitAmount}
                    onChange={(event) =>
                      setFirstSplitAmount(event.target.value)
                    }
                    placeholder="Importe"
                  />
                </div>
                <div>
                  <select
                    value={secondSplitMethod}
                    onChange={(event) =>
                      setSecondSplitMethod(event.target.value as Method)
                    }
                  >
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="transfer">Transferencia</option>
                  </select>
                  <output>
                    Resto: {money.format(remainingSplitCents / 100)}
                  </output>
                </div>
                <small>
                  Ingresa la primera parte; el resto se calcula automáticamente.
                </small>
              </div>
            )}
            <button
              type="button"
              className="primary-operation"
              disabled={!total || busy || (splitPayment && !splitIsValid)}
              onClick={checkout}
            >
              Cobrar {money.format(total / 100)}
            </button>
          </section>
          <aside className="operation-stack">
            <section className="operation-card">
              <div className="section-top">
                <div>
                  <h2>Caja</h2>
                  <p>
                    {cashSession
                      ? `Abierta desde ${new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(cashSession.opened_at))}`
                      : "Sin sesión activa"}
                  </p>
                </div>
              </div>
              {cashSession ? (
                <>
                  <p className="cash-float">
                    Fondo inicial:{" "}
                    <strong>
                      {money.format(cashSession.opening_float_cents / 100)}
                    </strong>
                  </p>
                  {cashSession.opening_float_cents === 0 && (
                    <button
                      type="button"
                      className="cash-adjust-link"
                      onClick={() => {
                        setOpening("");
                        setCashModal("adjust");
                      }}
                    >
                      Registrar fondo inicial
                    </button>
                  )}
                  <input
                    value={counted}
                    onChange={(event) => setCounted(event.target.value)}
                    inputMode="decimal"
                    placeholder="Efectivo contado al cierre"
                  />
                  <button
                    type="button"
                    className="secondary-operation"
                    disabled={busy}
                    onClick={closeCash}
                  >
                    Hacer corte de caja
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="primary-operation"
                  disabled={busy}
                  onClick={() => {
                    setOpening("");
                    setCashModal("open");
                  }}
                >
                  Abrir caja
                </button>
              )}
            </section>
            <section className="operation-card">
              <div className="section-top">
                <div>
                  <h2>Registrar gasto</h2>
                  <p>Se descuenta del corte si es efectivo</p>
                </div>
              </div>
              <div className="operation-inputs">
                <select
                  value={expense.category}
                  onChange={(event) =>
                    setExpense({ ...expense, category: event.target.value })
                  }
                >
                  <option value="">Selecciona una categoría</option>
                  {expenseCategories.map((category) => (
                    <option value={category.name} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <input
                  value={expense.description}
                  onChange={(event) =>
                    setExpense({ ...expense, description: event.target.value })
                  }
                  placeholder="Descripción (opcional)"
                />
                <input
                  value={expense.amount}
                  onChange={(event) =>
                    setExpense({ ...expense, amount: event.target.value })
                  }
                  inputMode="decimal"
                  placeholder="Importe"
                />
              </div>
              <div className="expense-tags">
                <span>
                  Etiquetas <small>(opcional)</small>
                </span>
                <div>
                  {expenseTags.map((tag) => (
                    <button
                      type="button"
                      key={tag.id}
                      className={
                        expense.tagIds.includes(tag.id) ? "selected" : ""
                      }
                      onClick={() =>
                        setExpense((current) => ({
                          ...current,
                          tagIds: current.tagIds.includes(tag.id)
                            ? current.tagIds.filter((id) => id !== tag.id)
                            : [...current.tagIds, tag.id],
                        }))
                      }
                    >
                      <i style={{ background: tag.color }} />
                      {tag.name}
                    </button>
                  ))}
                </div>
                <Link href="/app/configuracion#finanzas">
                  Administrar categorías y etiquetas →
                </Link>
              </div>
              <Methods
                value={expense.method}
                change={(selectedMethod) =>
                  setExpense({ ...expense, method: selectedMethod })
                }
              />
              <button
                type="button"
                className="secondary-operation"
                disabled={busy || !expense.category || !expense.amount}
                onClick={saveExpense}
              >
                Guardar gasto
              </button>
            </section>
          </aside>
        </div>
      </section>
      {cashModal && (
        <div className="cash-modal-backdrop" role="presentation">
          <section
            className="cash-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cash-modal-title"
          >
            <button
              type="button"
              className="cash-modal-close"
              aria-label="Cerrar"
              onClick={() => setCashModal(null)}
            >
              ×
            </button>
            <p className="eyebrow">
              {cashModal === "open" ? "APERTURA DE CAJA" : "CORREGIR APERTURA"}
            </p>
            <h2 id="cash-modal-title">
              {cashModal === "open"
                ? "¿Con cuánto efectivo inicias?"
                : "Registra el fondo inicial"}
            </h2>
            <p>
              Cuenta el efectivo físico que dejas en caja antes de comenzar a
              cobrar.
            </p>
            <label>
              Monto inicial
              <input
                autoFocus
                value={opening}
                onChange={(event) => setOpening(event.target.value)}
                inputMode="decimal"
                placeholder="Ej. 500.00"
              />
            </label>
            <div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCashModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-operation"
                disabled={busy}
                onClick={() => {
                  if (cashModal === "open") openCash();
                  else adjustOpening();
                  setCashModal(null);
                }}
              >
                {cashModal === "open" ? "Abrir caja" : "Guardar fondo"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
