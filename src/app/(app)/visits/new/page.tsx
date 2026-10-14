import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { patients } from "@/db/schema";
import { requirePermission } from "@/lib/access";
import { displayPhone } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { NewVisitForm } from "@/components/visit-forms";

export const dynamic = "force-dynamic";

export default async function NewVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const user = await requirePermission("clinical.write");
  const sp = await searchParams;
  const list = await db
    .select({ id: patients.id, fullName: patients.fullName, phone: patients.phone })
    .from(patients)
    .where(eq(patients.clinicId, user.clinicId))
    .orderBy(asc(patients.fullName))
    .limit(500);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="زيارة سريرية جديدة" subtitle="تُنسب الزيارة للطبيب المسجل دخوله ولا يمكن حذفها بعد القفل" />
      <NewVisitForm
        patientsList={list.map((p) => ({ id: p.id, label: `${p.fullName} — ${displayPhone(p.phone)}` }))}
        defaultPatientId={sp.patientId ? Number(sp.patientId) : undefined}
      />
    </div>
  );
}
