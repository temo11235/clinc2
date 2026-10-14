import { requirePermission } from "@/lib/access";
import { PageHeader } from "@/components/ui";
import { PatientForm } from "@/components/patient-form";

export const dynamic = "force-dynamic";

export default async function NewPatientPage() {
  await requirePermission("patients.write");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="مريض جديد" subtitle="سجل بيانات المريض الأساسية والطبية" />
      <PatientForm mode="create" />
    </div>
  );
}
