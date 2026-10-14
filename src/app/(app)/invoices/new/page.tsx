import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { patients, treatmentCatalog } from "@/db/schema";
import { requirePermission, can } from "@/lib/access";
import { displayPhone } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { InvoiceForm } from "@/components/finance-forms";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; visitId?: string }>;
}) {
  const user = await requirePermission("finance.write");
  const sp = await searchParams;
  const [list, treatments] = await Promise.all([
    db
      .select({ id: patients.id, fullName: patients.fullName, phone: patients.phone })
      .from(patients)
      .where(eq(patients.clinicId, user.clinicId))
      .orderBy(asc(patients.fullName))
      .limit(500),
    db
      .select()
      .from(treatmentCatalog)
      .where(and(eq(treatmentCatalog.clinicId, user.clinicId), eq(treatmentCatalog.isActive, true))),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="فاتورة جديدة" subtitle="تُنشأ كمسودة، ويمكن اعتمادها نهائيًا بعد المراجعة" />
      <InvoiceForm
        patientsList={list.map((p) => ({ id: p.id, label: `${p.fullName} — ${displayPhone(p.phone)}` }))}
        treatments={treatments.map((t) => ({ id: t.id, label: t.nameAr, price: t.priceMinor }))}
        defaultPatientId={sp.patientId ? Number(sp.patientId) : undefined}
        visitId={sp.visitId ? Number(sp.visitId) : undefined}
        canDiscount={true}
      />
    </div>
  );
}
