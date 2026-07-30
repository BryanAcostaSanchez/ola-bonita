import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { AnalyticsDashboard } from "./analytics-dashboard";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/app/acceso");

  const [{ data: profile }, { data: sales }, { data: saleItems }, { data: payments }, { data: expenses }, { data: expenseTags }, { data: tags }, { data: bookings }, { data: services }, { data: categories }, { data: specialists }, { data: specialistHours }, { data: cabinReservations }, { data: cabinHours }] = await Promise.all([
    supabase.from("profiles").select("full_name,role").eq("id", user.id).single(),
    supabase.from("sales").select("id,total_cents,customer_id,booking_id,created_at,status").eq("status", "completed").order("created_at", { ascending:false }).limit(1500),
    supabase.from("sale_items").select("sale_id,service_id,description,quantity,total_cents,unit_price_cents").limit(5000),
    supabase.from("payments").select("sale_id,booking_id,amount_cents,method,status,created_at").eq("status", "completed").limit(3000),
    supabase.from("expenses").select("id,category,description,amount_cents,expense_date,payment_method,created_at").order("expense_date", { ascending:false }).limit(2000),
    supabase.from("expense_tags").select("expense_id,tag_id").limit(5000),
    supabase.from("finance_tags").select("id,name,color").limit(100),
    supabase.from("bookings").select("id,customer_id,service_id,specialist_id,starts_at,ends_at,status,price_cents,deposit_due_cents,payment_status,source,created_at").order("starts_at", { ascending:false }).limit(3000),
    supabase.from("services").select("id,name,duration_minutes,price_cents,category_id").limit(500),
    supabase.from("service_categories").select("id,name").limit(100),
    supabase.from("profiles").select("id,full_name,color,role").eq("active", true).limit(20),
    supabase.from("specialist_hours").select("specialist_id,day_of_week,starts_at,ends_at,active").eq("active", true).limit(200),
    supabase.from("rental_reservations").select("id,full_name,starts_at,ends_at,status,price_cents,deposit_due_cents,payment_status,created_at").order("starts_at", { ascending:false }).limit(1500),
    supabase.from("rental_space_hours").select("day_of_week,opens_at,closes_at,active").eq("active", true).limit(20),
  ]);

  if (!profile || !["owner", "manager", "reception"].includes(profile.role)) redirect("/app");

  return <main className="ops-shell"><aside className="sidebar"><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link><nav><Link href="/app">▦ <span>Agenda</span></Link><Link href="/app/operacion">◇ <span>Ventas y caja</span></Link><Link className="active" href="/app/analitica">◔ <span>Analítica</span></Link><Link href="/app/configuracion">⚙ <span>Configuración</span></Link></nav><div className="sidebar-user"><span className="avatar">{profile.full_name.slice(0, 2).toUpperCase()}</span><div><strong>{profile.full_name}</strong><small>Analítica</small></div></div></aside><section className="ops-main analytics-main"><AnalyticsDashboard sales={sales ?? []} saleItems={saleItems ?? []} payments={payments ?? []} expenses={expenses ?? []} expenseTags={expenseTags ?? []} tags={tags ?? []} bookings={bookings ?? []} services={services ?? []} categories={categories ?? []} specialists={specialists ?? []} specialistHours={specialistHours ?? []} cabinReservations={cabinReservations ?? []} cabinHours={cabinHours ?? []}/></section></main>;
}
