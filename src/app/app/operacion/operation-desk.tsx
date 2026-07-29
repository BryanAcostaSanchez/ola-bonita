"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Service = { id: string; name: string; price_cents: number };
type CashSession = { id: string; opening_float_cents: number; opened_at: string } | null;
type Method = "cash" | "card" | "transfer";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function Methods({ value, change }: { value: Method; change: (method: Method) => void }) {
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

export function OperationDesk({ services, cashSession, staffName }: { services: Service[]; cashSession: CashSession; staffName: string }) {
  const supabase = createClient();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<Method>("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientDraft, setClientDraft] = useState({ fullName: "", phone: "", email: "", notes: "" });
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [expense, setExpense] = useState({ category: "", description: "", amount: "", method: "cash" as Method });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const qty = (id: string) => cart[id] ?? 0;
  const total = useMemo(
    () => services.reduce((sum, service) => sum + (cart[service.id] ?? 0) * service.price_cents, 0),
    [cart, services],
  );
  const itemCount = useMemo(() => Object.values(cart).reduce((sum, amount) => sum + amount, 0), [cart]);
  const add = (id: string) => setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  const remove = (id: string) => setCart((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) - 1) }));
  const cents = (value: string) => Math.round(Number(value.replace(",", ".")) * 100);

  const run = async (work: () => PromiseLike<{ error: { message: string } | null }>, success: string) => {
    setBusy(true);
    setNotice(null);
    const { error } = await work();
    setBusy(false);
    if (error) return setNotice(error.message);
    setNotice(success);
    window.setTimeout(() => window.location.reload(), 500);
  };

  const checkout = () =>
    run(
      () =>
        supabase.rpc("record_pos_sale", {
          p_items: services
            .filter((service) => qty(service.id))
            .map((service) => ({ service_id: service.id, quantity: qty(service.id) })),
          p_payment_method: method,
          p_customer_name: customerName || null,
          p_customer_phone: customerPhone || null,
        }),
      "Venta registrada.",
    );
  const openCash = () => run(() => supabase.rpc("open_cash_session", { p_opening_float_cents: cents(opening || "0") }), "Caja abierta.");
  const closeCash = () => run(() => supabase.rpc("close_cash_session", { p_counted_cash_cents: cents(counted || "0"), p_notes: null }), "Corte de caja guardado.");
  const saveExpense = () => run(() => supabase.rpc("record_expense", { p_category: expense.category, p_description: expense.description || null, p_amount_cents: cents(expense.amount), p_payment_method: expense.method, p_expense_date: null }), "Gasto registrado.");

  async function saveCustomer() {
    if (!clientDraft.fullName.trim() || !clientDraft.phone.trim()) {
      setNotice("Escribe al menos el nombre y teléfono del cliente.");
      return;
    }
    setBusy(true); setNotice(null);
    const { error } = await supabase.from("customers").insert({
      full_name: clientDraft.fullName.trim(),
      phone: clientDraft.phone.trim(),
      email: clientDraft.email.trim() || null,
      notes: clientDraft.notes.trim() || null,
    });
    setBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    setCustomerName(clientDraft.fullName.trim());
    setCustomerPhone(clientDraft.phone.trim());
    setShowClientForm(false);
    setNotice(`${clientDraft.fullName.trim()} se agregó a clientes y quedó asociado al ticket.`);
  }

  return (
    <main className="ops-shell">
      <aside className="sidebar">
        <Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link>
        <nav>
          <Link href="/app">▦ <span>Agenda</span></Link>
          <Link className="active" href="/app/operacion">◇ <span>Ventas y caja</span></Link>
          <Link href="/app/finanzas">◔ <span>Finanzas</span></Link>
          <Link href="/app/configuracion">⚙ <span>Configuración</span></Link>
        </nav>
        <div className="sidebar-user"><span className="avatar">{staffName.slice(0, 2).toUpperCase()}</span><div><strong>{staffName}</strong><small>Equipo Ola Bonita</small></div></div>
      </aside>
      <section className="ops-main">
        <header className="ops-header">
          <div><p className="eyebrow">PUNTO DE VENTA</p><h1>Operación diaria <span>✦</span></h1></div>
          <Link className="new-booking" href="/app">Ver agenda</Link>
        </header>
        {notice && <p className="operation-notice">{notice}</p>}
        <div className="operations-grid touch-pos-grid">
          <section className="operation-card pos-catalog">
            <div className="section-top"><div><h2>Nueva venta</h2><p>Toca un servicio para agregarlo al ticket.</p></div><span className="touch-hint">◉ Modo táctil</span></div>
            <div className="pos-services">
              {services.map((service) => (
                <button type="button" key={service.id} onClick={() => add(service.id)} aria-label={`Agregar ${service.name}`}>
                  <span>{service.name}</span>
                  <strong>{money.format(service.price_cents / 100)}</strong>
                  <small>{qty(service.id) ? `${qty(service.id)} en ticket` : "Tocar para agregar"}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="operation-card pos-ticket">
            <div className="section-top"><div><h2>Ticket actual</h2><p>{itemCount ? `${itemCount} ${itemCount === 1 ? "servicio" : "servicios"}` : "Aún no agregas servicios"}</p></div><strong className="ticket-total">{money.format(total / 100)}</strong></div>
            <div className="cart-lines">
              {services.filter((service) => qty(service.id)).map((service) => (
                <div key={service.id} className="cart-line">
                  <div><strong>{service.name}</strong><small>{money.format(service.price_cents / 100)} c/u</small></div>
                  <div className="cart-adjust"><button type="button" onClick={() => remove(service.id)} aria-label={`Quitar uno de ${service.name}`}>−</button><strong>{qty(service.id)}</strong><button type="button" onClick={() => add(service.id)} aria-label={`Agregar otro ${service.name}`}>+</button></div>
                </div>
              ))}
              {!itemCount && <p className="empty-ticket">Selecciona los servicios del panel izquierdo.</p>}
            </div>
            <div className="pos-customer">
              <div className="customer-summary"><div><strong>{customerName || "Sin cliente asociado"}</strong><small>{customerPhone || "Puedes cobrar sin registrar datos."}</small></div><button type="button" className="add-customer" onClick={() => setShowClientForm((current) => !current)}>{showClientForm ? "Cerrar" : customerName ? "Editar cliente" : "+ Agregar cliente"}</button></div>
              {showClientForm && <div className="customer-form"><input value={clientDraft.fullName} onChange={(event) => setClientDraft({ ...clientDraft, fullName: event.target.value })} placeholder="Nombre completo *" /><input value={clientDraft.phone} onChange={(event) => setClientDraft({ ...clientDraft, phone: event.target.value })} inputMode="tel" placeholder="Teléfono *" /><input value={clientDraft.email} onChange={(event) => setClientDraft({ ...clientDraft, email: event.target.value })} inputMode="email" placeholder="Correo (opcional)" /><input value={clientDraft.notes} onChange={(event) => setClientDraft({ ...clientDraft, notes: event.target.value })} placeholder="Notas (opcional)" /><button type="button" className="secondary-operation" disabled={busy} onClick={saveCustomer}>Guardar cliente</button></div>}
            </div>
            <p className="payment-label">¿Cómo pagó?</p>
            <Methods value={method} change={setMethod} />
            <button type="button" className="primary-operation" disabled={!total || busy} onClick={checkout}>Cobrar {money.format(total / 100)}</button>
          </section>
          <aside className="operation-stack">
            <section className="operation-card">
              <div className="section-top"><div><h2>Caja</h2><p>{cashSession ? `Abierta desde ${new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(cashSession.opened_at))}` : "Sin sesión activa"}</p></div></div>
              {cashSession ? <><p className="cash-float">Fondo inicial: <strong>{money.format(cashSession.opening_float_cents / 100)}</strong></p><input value={counted} onChange={(event) => setCounted(event.target.value)} inputMode="decimal" placeholder="Efectivo contado al cierre" /><button type="button" className="secondary-operation" disabled={busy} onClick={closeCash}>Hacer corte de caja</button></> : <><input value={opening} onChange={(event) => setOpening(event.target.value)} inputMode="decimal" placeholder="Fondo inicial (ej. 500)" /><button type="button" className="primary-operation" disabled={busy} onClick={openCash}>Abrir caja</button></>}
            </section>
            <section className="operation-card">
              <div className="section-top"><div><h2>Registrar gasto</h2><p>Se descuenta del corte si es efectivo</p></div></div>
              <div className="operation-inputs"><input value={expense.category} onChange={(event) => setExpense({ ...expense, category: event.target.value })} placeholder="Categoría (ej. insumos)" /><input value={expense.description} onChange={(event) => setExpense({ ...expense, description: event.target.value })} placeholder="Descripción (opcional)" /><input value={expense.amount} onChange={(event) => setExpense({ ...expense, amount: event.target.value })} inputMode="decimal" placeholder="Importe" /></div>
              <Methods value={expense.method} change={(selectedMethod) => setExpense({ ...expense, method: selectedMethod })} />
              <button type="button" className="secondary-operation" disabled={busy || !expense.category || !expense.amount} onClick={saveExpense}>Guardar gasto</button>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
