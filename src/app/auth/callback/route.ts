import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/app/acceso";
  const destination = next.startsWith("/") ? new URL(next, requestUrl.origin) : new URL("/app/acceso", requestUrl.origin);
  const response = NextResponse.redirect(destination);

  if (!code) return response;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    },
  );
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const failedDestination = new URL("/app/acceso", requestUrl.origin);
    failedDestination.searchParams.set("flow", "invite");
    failedDestination.searchParams.set("error", "expired-link");
    return NextResponse.redirect(failedDestination);
  }
  return response;
}
