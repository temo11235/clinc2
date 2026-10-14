import { requirePermission } from "@/lib/access";
import { getClinic, getConfig } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePermission("settings.write");
  const [clinic, config] = await Promise.all([getClinic(user.clinicId), getConfig(user.clinicId)]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="إعدادات العيادة" subtitle="مواعيد العمل، التذكيرات، الأسئلة الشائعة، وقوالب الرسائل" />
      <SettingsForm
        clinic={{
          name: clinic?.name ?? "",
          phone: clinic?.phone ?? "",
          address: clinic?.address ?? "",
          mapsUrl: clinic?.mapsUrl ?? "",
          logoUrl: clinic?.logoUrl ?? "",
        }}
        config={config}
      />
    </div>
  );
}
