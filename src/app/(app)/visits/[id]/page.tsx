import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { patients, treatmentCatalog, dentists, visitProcedures, visits } from "@/db/schema";
import { requirePermission } from "@/lib/access";
import { formatEGP } from "@/lib/money";
import { fmtDateTime } from "@/lib/time";
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { AddProcedureForm } from "@/components/visit-forms";
import { lockVisitAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function VisitDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("clinical.read");
  const { id } = await params;
  const visitId = Number(id);
  if (!Number.isFinite(visitId)) notFound();

  const [row] = await db
    .select({ visit: visits, patient: patients, dentist: dentists.fullName })
    .from(visits)
    .innerJoin(patients, eq(patients.id, visits.patientId))
    .leftJoin(dentists, eq(dentists.id, visits.dentistId))
    .where(and(eq(visits.id, visitId), eq(visits.clinicId, user.clinicId)))
    .limit(1);
  if (!row) notFound();

  const [procedures, treatments] = await Promise.all([
    db.select().from(visitProcedures).where(eq(visitProcedures.visitId, visitId)).orderBy(asc(visitProcedures.id)),
    db.select().from(treatmentCatalog).where(eq(treatmentCatalog.clinicId, user.clinicId)),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`زيارة — ${row.patient.fullName}`}
        subtitle={`${fmtDateTime(row.visit.visitDate)} · الطبيب: ${row.dentist ?? "—"}`}
        action={
          <div className="flex gap-2">
            <LinkButton href={`/patients/${row.patient.id}`} variant="secondary">
              ملف المريض
            </LinkButton>
            <LinkButton href={`/invoices/new?patientId=${row.patient.id}&visitId=${visitId}`}>إصدار فاتورة</LinkButton>
          </div>
        }
      />

      <Card>
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div><p className="font-semibold text-slate-500">الشكوى الرئيسية</p><p>{row.visit.chiefComplaint ?? "—"}</p></div>
          <div><p className="font-semibold text-slate-500">الفحص</p><p>{row.visit.examination ?? "—"}</p></div>
          <div><p className="font-semibold text-slate-500">التشخيص</p><p>{row.visit.diagnosis ?? "—"}</p></div>
          <div><p className="font-semibold text-slate-500">خطة العلاج</p><p>{row.visit.treatmentPlan ?? "—"}</p></div>
          <div><p className="font-semibold text-slate-500">المتابعة</p><p>{row.visit.followUp ?? "—"}</p></div>
          <div><p className="font-semibold text-slate-500">الروشتة</p><p>{row.visit.prescription ?? "—"}</p></div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          {row.visit.locked ? (
            <Badge tone="green">سجل مقفل — محفوظ كما هو</Badge>
          ) : (
            <form action={lockVisitAction}>
              <input type="hidden" name="visitId" value={visitId} />
              <Button type="submit" variant="secondary">
                قفل السجل نهائيًا
              </Button>
            </form>
          )}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-bold text-slate-800">الإجراءات المنفذة</h2>
        {procedures.length === 0 ? (
          <EmptyState title="لا توجد إجراءات مسجلة" />
        ) : (
          <Table head={["الإجراء", "السن", "الأسطح", "الحالة", "الخامات", "السعر"]}>
            {procedures.map((p) => (
              <tr key={p.id}>
                <Td>{p.title}</Td>
                <Td>{p.toothNumber ?? "—"}</Td>
                <Td>{p.surfaces ?? "—"}</Td>
                <Td>{p.status}</Td>
                <Td>{p.materials ?? "—"}</Td>
                <Td>{formatEGP(p.priceMinor)}</Td>
              </tr>
            ))}
          </Table>
        )}
        {!row.visit.locked ? (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="mb-3 font-semibold text-slate-700">إضافة إجراء</h3>
            <AddProcedureForm
              visitId={visitId}
              treatments={treatments.map((t) => ({ id: t.id, label: t.nameAr, priceMinor: t.priceMinor }))}
            />
          </div>
        ) : null}
      </Card>

      <p className="mt-4 text-xs text-slate-400">
        <Link href="/visits" className="hover:underline">
          ← العودة لقائمة الزيارات
        </Link>
      </p>
    </div>
  );
}
