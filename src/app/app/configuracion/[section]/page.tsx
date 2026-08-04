import { SettingsPageContent } from "../page";

export const dynamic = "force-dynamic";

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return <SettingsPageContent section={section} />;
}
