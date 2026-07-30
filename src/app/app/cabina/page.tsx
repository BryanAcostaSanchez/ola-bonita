import { redirect } from "next/navigation";
export default function CabinSettingsPage() {
  redirect("/app/configuracion?seccion=cabina");
}
