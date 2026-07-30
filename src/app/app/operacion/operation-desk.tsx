"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Category = { id: string; name: string };
type Service = { id: string; name: string; price_cents: number; category: Category | Category[] | null };
type CashSession = { id: string; opening_float_cents: number; opened_at: string } | null;
type FinanceOption = { id:string; name:string; color:string };
type Customer = { id:string; full_name:string; phone:string|null; email:string|null };
type Method = "cash" | "card" | "transfer";

type PosDraft = Partial<{ cart:Record<string,number>; selectedCategoryId:string|null; method:Method; splitPayment:boolean; firstSplitMethod:Method; secondSplitMethod:Method; firstSplitAmount:string; customerName:string; customerPhone:string; clientDraft:{ fullName:string; phone:string; email:string; notes:string } }>;
function readPosDraft(): PosDraft { if (typeof window === "undefined") return {}; try { return JSON.parse(sessionStorage.getItem("ola-bonita:pos-draft:v1") || "{}"); } catch { sessionStorage.removeItem("ola-bonita:pos-draft:v1"); return {}; } }

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function friendlyError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("abre caja") || normalized.includes("caja antes") || normalized.includes("cash session")) return "Abre la caja antes de cobrar o registrar un gasto en efectivo.";
  if (normalized.includes("subtotal_cents") || normalized.includes("not-null constraint")) return "No pudimos registrar la venta. Actualiza la configuración de ventas en Supabase y vuelve a intentarlo.";
  if (normalized.includes("importes deben sumar")) return "Los dos importes deben sumar exactamente el total del ticket.";
  if (normalized.includes("método de pago no está habilitado")) return "Ese método de pago no está habilitado en Configuración.";
  return "No pudimos completar la operación. Revisa los datos e inténtalo de nuevo.";
}

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

export function OperationDesk({ services, cashSession, staffName, expenseCategories, expenseTags }: { services: Service[]; cashSession: CashSession; staffName: string; expenseCategories:FinanceOption[]; expenseTags:FinanceOption[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [initialDraft] = useState(readPosDraft);
  const [cart, setCart] = useState<Record<string, number>>(()=>initialDraft.cart ?? {});
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(()=>initialDraft.selectedCategoryId ?? null);
  const [method, setMethod] = useState<Method>(()=>initialDraft.method ?? "cash");
  const [splitPayment, setSplitPayment] = useState(()=>initialDraft.splitPayment ?? false);
  const [firstSplitMethod, setFirstSplitMethod] = useState<Method>(()=>initialDraft.firstSplitMethod ?? "cash");
  const [secondSplitMethod, setSecondSplitMethod] = useState<Method>(()=>initialDraft.secondSplitMethod ?? "card");
  const [firstSplitAmount, setFirstSplitAmount] = useState(()=>initialDraft.firstSplitAmount ?? "");
  const [customerName, setCustomerName] = useState(()=>initialDraft.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(()=>initialDraft.customerPhone ?? "");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [searchedCustomer, setSearchedCustomer] = useState(false);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientDraft, setClientDraft] = useState(()=>initialDraft.clientDraft ?? { fullName: "", phone: "", email: "", notes: "" });
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [cashModal, setCashModal] = useState<"open"|"adjust"|null>(null);
  const [expense, setExpense] = useState({ category: "", description: "", amount: "", method: "cash" as Method, tagIds:[] as string[] });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    sessionStorage.setItem("ola-bonita:pos-draft:v1", JSON.stringify({ cart, selectedCategoryId, method, splitPayment, firstSplitMethod, secondSplitMethod, firstSplitAmount, customerName, customerPhone, clientDraft }));
  }, [cart, selectedCategoryId, method, splitPayment, firstSplitMethod, secondSplitMethod, firstSplitAmount, customerName, customerPhone, clientDraft]);
  useEffect(() => { const term=customerSearch.replace(/[,%()]/g, "").trim(); const timeout=window.setTimeout(async()=>{ if (term.length < 2) { setCustomerResults([]); setSearchedCustomer(false); setSearchingCustomer(false); return; } setSearchingCustomer(true); const { data } = await supabase.from("customers").select("id,full_name,phone,email").or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`).limit(5); setCustomerResults(data ?? []); setSearchedCustomer(true); setSearchingCustomer(false); }, 250); return ()=>window.clearTimeout(timeout); }, [customerSearch, supabase]);

  const qty = (id: string) => cart[id] ?? 0;
  const categoryOf = (service: Service) => Array.isArray(service.category) ? service.category[0] : service.category;
  const categories = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; count: number }>();
    services.forEach((service) => {
      const category = categoryOf(service) || { id: "other", name: "Otros servicios" };
      const current = grouped.get(category.id);
      grouped.set(category.id, { ...category, count: (current?.count ?? 0) + 1 });
    });
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [services]);
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);
  const visibleServices = selectedCategoryId ? services.filter((service) => (categoryOf(service)?.id || "other") === selectedCategoryId) : [];
  const total = useMemo(
    () => services.reduce((sum, service) => sum + (cart[service.id] ?? 0) * service.price_cents, 0),
    [cart, services],
  );
  const itemCount = useMemo(() => Object.values(cart).reduce((sum, amount) => sum + amount, 0), [cart]);
  const add = (id: string) => setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  const remove = (id: string) => setCart((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) - 1) }));
  const cents = (value: string) => Math.round(Number(value.replace(",", ".")) * 100);
  const firstSplitCents = Math.max(0, cents(firstSplitAmount || "0"));
  const remainingSplitCents = Math.max(0, total - firstSplitCents);
  const splitIsValid = firstSplitCents > 0 && remainingSplitCents > 0;

  const run = async (work: () => PromiseLike<{ error: { message: string } | null }>, success: string, clearPosDraft = false) => {
    setBusy(true);
    setNotice(null);
    const { error } = await work();
    setBusy(false);
    if (error) return setNotice(friendlyError(error.message));
    if (clearPosDraft) sessionStorage.removeItem("ola-bonita:pos-draft:v1");
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
          p_payment_method: splitPayment ? firstSplitMethod : method,
          p_customer_name: customerName || null,
          p_customer_phone: customerPhone || null,
          p_payments: splitPayment ? [{ method:firstSplitMethod, amount_cents:firstSplitCents }, { method:secondSplitMethod, amount_cents:remainingSplitCents }] : null,
        }),
      "Venta registrada.", true,
    );
  const openCash = () => run(() => supabase.rpc("open_cash_session", { p_opening_float_cents: cents(opening || "0") }), "Caja abierta.");
  const adjustOpening = () => run(() => supabase.rpc("adjust_opening_cash", { p_opening_float_cents: cents(opening || "0") }), "Fondo inicial actualizado.");
  const closeCash = () => run(() => supabase.rpc("close_cash_session", { p_counted_cash_cents: cents(counted || "0"), p_notes: null }), "Corte de caja guardado.");
  const saveExpense = () => run(() => supabase.rpc("record_expense", { p_category: expense.category, p_description: expense.description || null, p_amount_cents: cents(expense.amount), p_payment_method: expense.method, p_expense_date: null, p_tag_ids:expense.tagIds }), "Gasto registrado.");

  async function saveCustomer() {
    if (!clientDraft.fullName.trim() || !clientDraft.phone.trim()) {
      setNotice("Escribe al menos el nombre y teléfono del cliente.");
      return;
    }
    setBusy(true); setNotice(null);
    const { data, error } = await supabase.from("customers").insert({
      full_name: clientDraft.fullName.trim(),
      phone: clientDraft.phone.trim(),
      email: clientDraft.email.trim() || null,
      notes: clientDraft.notes.trim() || null,
    }).select("id,full_name,phone,email").single();
    setBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    setCustomerName(clientDraft.fullName.trim());
    setCustomerPhone(clientDraft.phone.trim());
    setCustomerSearch(""); setCustomerResults(data ? [data] : []);
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
          <Link href="/app/analitica">◔ <span>Analítica</span></Link>
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
            <div className="section-top"><div><h2>{selectedCategory ? selectedCategory.name : "Nueva venta"}</h2><p>{selectedCategory ? "Toca un servicio para agregarlo al ticket." : "Primero selecciona una categoría."}</p></div><span className="touch-hint">◉ Modo táctil</span></div>
            {selectedCategory ? <><button type="button" className="back-to-categories" onClick={() => setSelectedCategoryId(null)}>← Ver categorías</button><div className="pos-services">{visibleServices.map((service) => <button type="button" key={service.id} onClick={() => add(service.id)} aria-label={`Agregar ${service.name}`}><span>{service.name}</span><strong>{money.format(service.price_cents / 100)}</strong><small>{qty(service.id) ? `${qty(service.id)} en ticket` : "Tocar para agregar"}</small></button>)}</div></> : <div className="pos-categories">{categories.map((category) => <button type="button" key={category.id} onClick={() => setSelectedCategoryId(category.id)}><span>{category.name}</span><small>{category.count} {category.count === 1 ? "servicio" : "servicios"}</small><b>Ver servicios →</b></button>)}</div>}
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
            <div className="pos-customer"><div className="section-top"><div><h3>Cliente</h3><p>{customerName ? "Cliente asociado al ticket" : "Opcional: busca antes de cobrar"}</p></div>{customerName && <button type="button" className="add-customer" onClick={()=>{setCustomerName("");setCustomerPhone("");setCustomerSearch("");setShowClientForm(false);}}>Quitar</button>}</div>{!customerName && <><div className="customer-search-wrap"><input className="customer-search" value={customerSearch} onChange={(event)=>{setCustomerSearch(event.target.value);setShowClientForm(false);}} placeholder="Buscar por nombre, teléfono o correo"/><button type="button" className="customer-quick-add" aria-label="Agregar cliente nuevo" onClick={()=>{setClientDraft((draft)=>({...draft,fullName:customerSearch || draft.fullName}));setCustomerResults([]);setShowClientForm(true);}}>+ Cliente</button></div>{searchingCustomer && <small className="customer-search-note">Buscando…</small>}{customerResults.length > 0 && <div className="customer-results">{customerResults.map((customer)=><button type="button" key={customer.id} onClick={()=>{setCustomerName(customer.full_name);setCustomerPhone(customer.phone ?? "");setCustomerSearch("");setCustomerResults([]);}}><strong>{customer.full_name}</strong><small>{customer.phone || customer.email || "Sin contacto"}</small></button>)}</div>}{searchedCustomer && !searchingCustomer && customerResults.length === 0 && <div className="customer-empty"><span>No encontramos a “{customerSearch}”.</span><button type="button" className="add-customer" onClick={()=>{setClientDraft((draft)=>({...draft,fullName:customerSearch}));setShowClientForm(true);}}>+ Agregar cliente</button></div>}{showClientForm && <div className="customer-form"><input value={clientDraft.fullName} onChange={(event) => setClientDraft({ ...clientDraft, fullName: event.target.value })} placeholder="Nombre completo *" /><input value={clientDraft.phone} onChange={(event) => setClientDraft({ ...clientDraft, phone: event.target.value })} inputMode="tel" placeholder="Teléfono *" /><input value={clientDraft.email} onChange={(event) => setClientDraft({ ...clientDraft, email: event.target.value })} inputMode="email" placeholder="Correo (opcional)" /><input value={clientDraft.notes} onChange={(event) => setClientDraft({ ...clientDraft, notes: event.target.value })} placeholder="Notas (opcional)" /><button type="button" className="secondary-operation" disabled={busy} onClick={saveCustomer}>Guardar cliente</button></div>}</>}</div>
            <div className="payment-heading"><p className="payment-label">¿Cómo pagó?</p><button type="button" className={splitPayment ? "split-toggle active" : "split-toggle"} onClick={()=>{setSplitPayment((current)=>!current);setFirstSplitAmount("");}}>Pago dividido</button></div>
            {!splitPayment ? <Methods value={method} change={setMethod} /> : <div className="split-payment"><div><select value={firstSplitMethod} onChange={(event)=>setFirstSplitMethod(event.target.value as Method)}><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option></select><input inputMode="decimal" value={firstSplitAmount} onChange={(event)=>setFirstSplitAmount(event.target.value)} placeholder="Importe"/></div><div><select value={secondSplitMethod} onChange={(event)=>setSecondSplitMethod(event.target.value as Method)}><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option></select><output>Resto: {money.format(remainingSplitCents / 100)}</output></div><small>Ingresa la primera parte; el resto se calcula automáticamente.</small></div>}
            <button type="button" className="primary-operation" disabled={!total || busy || (splitPayment && !splitIsValid)} onClick={checkout}>Cobrar {money.format(total / 100)}</button>
          </section>
          <aside className="operation-stack">
            <section className="operation-card">
              <div className="section-top"><div><h2>Caja</h2><p>{cashSession ? `Abierta desde ${new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(cashSession.opened_at))}` : "Sin sesión activa"}</p></div></div>
              {cashSession ? <><p className="cash-float">Fondo inicial: <strong>{money.format(cashSession.opening_float_cents / 100)}</strong></p>{cashSession.opening_float_cents === 0 && <button type="button" className="cash-adjust-link" onClick={()=>{setOpening("");setCashModal("adjust");}}>Registrar fondo inicial</button>}<input value={counted} onChange={(event) => setCounted(event.target.value)} inputMode="decimal" placeholder="Efectivo contado al cierre" /><button type="button" className="secondary-operation" disabled={busy} onClick={closeCash}>Hacer corte de caja</button></> : <button type="button" className="primary-operation" disabled={busy} onClick={()=>{setOpening("");setCashModal("open");}}>Abrir caja</button>}
            </section>
            <section className="operation-card">
              <div className="section-top"><div><h2>Registrar gasto</h2><p>Se descuenta del corte si es efectivo</p></div></div>
              <div className="operation-inputs"><select value={expense.category} onChange={(event) => setExpense({ ...expense, category:event.target.value })}><option value="">Selecciona una categoría</option>{expenseCategories.map((category)=><option value={category.name} key={category.id}>{category.name}</option>)}</select><input value={expense.description} onChange={(event) => setExpense({ ...expense, description: event.target.value })} placeholder="Descripción (opcional)" /><input value={expense.amount} onChange={(event) => setExpense({ ...expense, amount: event.target.value })} inputMode="decimal" placeholder="Importe" /></div>
              <div className="expense-tags"><span>Etiquetas <small>(opcional)</small></span><div>{expenseTags.map((tag)=><button type="button" key={tag.id} className={expense.tagIds.includes(tag.id)?"selected":""} onClick={()=>setExpense((current)=>({...current,tagIds:current.tagIds.includes(tag.id)?current.tagIds.filter((id)=>id!==tag.id):[...current.tagIds,tag.id]}))}><i style={{background:tag.color}}/>{tag.name}</button>)}</div><Link href="/app/configuracion#finanzas">Administrar categorías y etiquetas →</Link></div>
              <Methods value={expense.method} change={(selectedMethod) => setExpense({ ...expense, method: selectedMethod })} />
              <button type="button" className="secondary-operation" disabled={busy || !expense.category || !expense.amount} onClick={saveExpense}>Guardar gasto</button>
            </section>
          </aside>
        </div>
      </section>
      {cashModal && <div className="cash-modal-backdrop" role="presentation"><section className="cash-modal" role="dialog" aria-modal="true" aria-labelledby="cash-modal-title"><button type="button" className="cash-modal-close" aria-label="Cerrar" onClick={()=>setCashModal(null)}>×</button><p className="eyebrow">{cashModal === "open" ? "APERTURA DE CAJA" : "CORREGIR APERTURA"}</p><h2 id="cash-modal-title">{cashModal === "open" ? "¿Con cuánto efectivo inicias?" : "Registra el fondo inicial"}</h2><p>Cuenta el efectivo físico que dejas en caja antes de comenzar a cobrar.</p><label>Monto inicial<input autoFocus value={opening} onChange={(event)=>setOpening(event.target.value)} inputMode="decimal" placeholder="Ej. 500.00"/></label><div><button type="button" className="secondary-button" onClick={()=>setCashModal(null)}>Cancelar</button><button type="button" className="primary-operation" disabled={busy} onClick={()=>{if(cashModal === "open") openCash(); else adjustOpening(); setCashModal(null);}}>{cashModal === "open" ? "Abrir caja" : "Guardar fondo"}</button></div></section></div>}
    </main>
  );
}
