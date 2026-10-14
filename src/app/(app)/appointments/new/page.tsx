import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { patients, treatmentCatalog, dentists } from "@/db/schema";
import { requirePermission } from "@/lib/access";
import { getConfig } from "@/lib/settings";
import { cairoDayString, displayPhone } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { AppointmentForm } from "@/components/appointment-form";

export const dynamic = "force-dynamic";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; patientId?: string }>;
}) {
  const user = await requirePermission("appointments.write");
  const sp = await searchParams;
  const config = await getConfig(user.clinicId);

  const [patientRows, dentistRows, treatmentRows] = await Promise.all([
    db
      .select({ id: patients.id, fullName: patients.fullName, phone: patients.phone })
      .from(patients)
      .where(eq(patients.clinicId, user.clinicId))
      .orderBy(asc(patients.fullName))
      .limit(500),
    db
      .select({ id: dentists.id, fullName: dentists.fullName })
      .from(dentists)
      .where(and(eq(dentists.clinicId, user.clinicId), eq(dentists.isActive, true))),
    db
      .select()
      .from(treatmentCatalog)
      .where(and(eq(treatmentCatalog.clinicId, user.clinicId), eq(treatmentCatalog.isActive, true))),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="حجز موعد جديد" subtitle="يتم التحقق من مواعيد العمل والتعارضات تلقائيًا" />
      <AppointmentForm
        defaultDate={sp.date ?? cairoDayString()}
        defaultPatientId={sp.patientId ? Number(sp.patientId) : undefined}
        defaultDuration={config.defaultDurationMinutes}
        patientsList={patientRows.map((p) => ({ id: p.id, label: `${p.fullName} — ${displayPhone(p.phone)}` }))}
        dentists={dentistRows
          .filter(() => true)
          .map((d) => ({ id: d.id, label: d.fullName }))}
        treatments={treatmentRows.map((t) => ({ id: t.id, label: `${t.nameAr}`, duration: t.durationMinutes }))}
      />
    </div>
  );
}
