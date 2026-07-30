import { redirect } from "next/navigation";

export default function TeamRedirect() {
  redirect("/app/configuracion?seccion=equipo");
}
