import { NextResponse } from "next/server";
import { getClipPinpadDevices } from "@/lib/clip";
import { clipErrorMessage } from "@/lib/clip-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePosSession } from "@/lib/terminal-session";

export const runtime = "nodejs";

const stateLabels: Record<string, string> = {
  active: "Lista para cobrar",
  inactive: "Desconectada",
  expired: "Sin reportarse",
  unknown: "Clip no tiene habilitada esta función",
};

// Settings shows what Clip says about the terminal right now, not what somebody
// typed the day it was set up.
export async function GET() {
  const { supabase, response } = await requirePosSession(["operations.pos", "settings.payments"]);
  if (!supabase) return response;

  const { data: terminals } = await supabase
    .from("payment_terminals")
    .select("id, provider, device_id, label, active, setup_status, last_seen_state, last_seen_at")
    .order("created_at", { ascending: true });

  try {
    const devices = await getClipPinpadDevices();
    const admin = createAdminClient();
    const seen = new Map(devices.map((device) => [device.serial_number, (device.status ?? "unknown").toLowerCase()]));
    await Promise.all((terminals ?? [])
      .filter((terminal) => seen.has(terminal.device_id))
      .map((terminal) => admin.rpc("record_terminal_device_state", {
        p_provider: terminal.provider,
        p_device_id: terminal.device_id,
        p_state: seen.get(terminal.device_id) ?? "unknown",
      })));

    return NextResponse.json({
      terminals: (terminals ?? []).map((terminal) => {
        const state = seen.get(terminal.device_id) ?? null;
        return {
          ...terminal,
          live_state: state,
          live_label: state ? stateLabels[state] ?? state : "Clip no reconoce este número de serie",
        };
      }),
      devices: devices.map((device) => ({ serial_number: device.serial_number, status: (device.status ?? "unknown").toLowerCase() })),
    });
  } catch (cause) {
    // Settings still has to render: the saved terminals matter even when Clip
    // cannot be reached, and the reason is worth showing.
    return NextResponse.json({
      terminals: (terminals ?? []).map((terminal) => ({ ...terminal, live_state: null, live_label: null })),
      devices: [],
      error: clipErrorMessage(cause),
    });
  }
}
