import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { loadOnboardingProgress } from "@/lib/onboarding-progress";
import { OnboardingGuide } from "./onboarding-guide";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/app/acceso");

  const [{ data: profile }, { data: permissions }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, active")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.rpc("my_permissions"),
  ]);
  if (!profile?.active) redirect("/app/acceso?error=not-authorized");

  const granted: string[] = Array.isArray(permissions) ? permissions : [];
  const progress = await loadOnboardingProgress(granted);
  if (!progress || !progress.steps.length) redirect("/app");

  return (
    <OnboardingGuide
      fullName={profile.full_name.split(" ")[0]}
      initialSteps={progress.steps}
      initialDismissed={progress.dismissed}
    />
  );
}
