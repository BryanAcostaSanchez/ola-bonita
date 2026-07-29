import Link from "next/link";
import { AccessForm } from "./access-form";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StaffAccessPage() {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("has_bootstrapped_owner");

  return <main className="access-page"><section className="access-copy"><Link href="/" className="brand"><span>Ola</span> Bonita<small>BEAUTY SPA</small></Link><div><p className="eyebrow">ESPACIO DEL EQUIPO</p><h1>Todo el spa,<br /><em>en calma.</em></h1><p>Agenda, clientes, ventas y configuración en un solo lugar seguro.</p></div><Link className="text-link" href="/">← Volver al sitio</Link></section><section className="access-panel"><AccessForm canCreateFirstOwner={!data} /></section></main>;
}
