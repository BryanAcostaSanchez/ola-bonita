import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { OperationDesk } from "./operation-desk";
export const dynamic = "force-dynamic";
export default async function OperationPage() {
  const supabase = await createServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/app/acceso");
  const [{ data: profile }, { data: services }, { data: cashSession }] = await Promise.all([supabase.from("profiles").select("full_name, role").eq("id", user.id).single(), supabase.from("services").select("id,name,price_cents").eq("active", true).order("name"), supabase.from("cash_sessions").select("id,opening_float_cents,opened_at").eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle()]);
  if (!profile || !["owner", "manager", "reception"].includes(profile.role)) redirect("/app");
  return <OperationDesk services={services ?? []} cashSession={cashSession} staffName={profile.full_name} />;
}
