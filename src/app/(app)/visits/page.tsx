import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { patients, dentists, visits } from "@/db/schema";
import { requirePermission } from "@/lib/access";
import { fmtDateTime } from "@/lib/time";
import { Badge, EmptyState, LinkButton, PageHeader, Table, Td } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VisitsPage() {
  const user = await requirePermission("clinical.read");
  const rows = await db
    .select({
      id: visits.id,
      visitDate: visits.visitDate,
      chiefComplaint: visits.chiefComplaint,
      diagnosis: visits.diagnosis,
      locked: visits.locked,
      patientId: patients.id,
      patientName: patients.fullName,
      dentist: dentists.fullName,
    })
    .from(visits)
    .innerJoin(patients, eq(patients.id, visits.patientId))
    .leftJoin(dentists, eq(dentists.id, visits.dentistId))
    .where(eq(visits.clinicId, user.clinicId))
    .orderBy(desc(visits.visitDate))
    .limit(80);

  return (
    <div className="space-y-5">
      <PageHeader
        icon="🩺"
        title="السجلات العلاجية"
        subtitle={`${rows.length} زيارة سريرية مسجلة — تُحفظ منسوبة للطبيب ولا تُحذف بعد القفل`}
        action={<LinkButton href="/visits/new">➕ زيارة جديدة</LinkButton>}
      />
      {rows.length === 0 ? (
        <EmptyState icon="🩺" title="لا توجد زيارات مسجلة" action={<LinkButton href="/visits/new">تسجيل زيارة</LinkButton>} />
      ) : (
        <Table head={["التاريخ", "المريض", "الشكوى", "التشخيص", "الطبيب", "الحالة"]}>
          {rows.map((v) => (
            <tr key={v.id}>
              <Td>
                <Link className="font-bold text-teal-700 hover:underline" href={`/visits/${v.id}`}>
                  {fmtDateTime(v.visitDate)}
                </Link>
              </Td>
              <Td>
                <Link className="hover:underline" href={`/patients/${v.patientId}`}>
                  {v.patientName}
                </Link>
              </Td>
              <Td className="max-w-48 truncate text-slate-600">🗣️ {v.chiefComplaint ?? "—"}</Td>
              <Td className="max-w-48 truncate text-slate-600">🔎 {v.diagnosis ?? "—"}</Td>
              <Td>{v.dentist ?? "—"}</Td>
              <Td>{v.locked ? <Badge tone="green" dot>مقفلة</Badge> : <Badge tone="amber" dot>قابلة للتعديل</Badge>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
