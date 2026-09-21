import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// A POS tab stays open for hours, so an expired session is the ordinary case,
// not an attack. 401 tells the browser to refresh and try once more; 403 means
// the person is signed in but may not charge, and retrying will not help.
export async function requirePosSession(permissions: string[] = ["operations.pos"]) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { supabase: null, response: NextResponse.json({ error: "Tu sesión expiró. Vuelve a entrar." }, { status: 401 }) } as const;
  }
  const granted = await Promise.all(permissions.map((permission) => supabase.rpc("has_permission", { p_permission: permission })));
  if (!granted.some(({ data, error }) => !error && data)) {
    return { supabase: null, response: NextResponse.json({ error: "No tienes permiso para esta operación." }, { status: 403 }) } as const;
  }
  return { supabase, response: null } as const;
}

export type TerminalIntent = {
  id: string;
  provider: string;
  provider_payment_id: string | null;
  device_id: string;
  amount_cents: number;
  state: "creating" | "pending" | "completed" | "failed" | "cancelled" | "requires_review";
  created_at: string;
  expires_at: string | null;
  sale_id: string | null;
  last_error_code: string | null;
};

// What Clip returned when a charge was created or read back, minus anything
// that identifies a card. Enough to tell an account problem from a device one.
export function logTerminalEvent(event: string, detail: Record<string, unknown>) {
  console.info(JSON.stringify({ at: "clip-terminal", event, ...detail }));
}
