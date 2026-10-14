import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, dentists } from "@/db/schema";
import { requireClinic } from "@/lib/access";
import { displayPhone, fmtDate } from "@/lib/time";
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle, Stat, Table, Td } from "@/components/ui";
import { DentistForm } from "@/components/dentist-form";
import { toggleDentistAction } from "../settings/actions";

export const dynamic = "force-dynamic";

export default async function DentistsPage() {
  const { clinicId } = await requireClinic();
  const [docs, upcomingRows, completedRows] = await Promise.all([
    db.select().from(dentists).where(eq(dentists.clinicId, clinicId)).orderBy(asc(dentists.id)),
    db
      .select({ dentistId: appointments.dentistId, value: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.clinicId, clinicId),
          gte(appointments.startsAt, new Date()),
          sql`${appointments.status} in ('scheduled','confirmed','checked_in')`,
        ),
      )
      .groupBy(appointments.dentistId),
    db
      .select({ dentistId: appointments.dentistId, value: count() })
      .from(appointments)
      .where(and(eq(appointments.clinicId, clinicId), eq(appointments.status, "completed")))
      .groupBy(appointments.dentistId),
  ]);

  const upcomingMap = new Map(upcomingRows.map((r) => [r.dentistId, Number(r.value)]));
  const completedMap = new Map(completedRows.map((r) => [r.dentistId, Number(r.value)]));
  const rows = docs.map((d) => ({
    ...d,
    upcoming: upcomingMap.get(d.id) ?? 0,
    completed: completedMap.get(d.id) ?? 0,
  }));

  const [{ value: totalAppointments }] = await db
    .select({ value: count() })
    .from(appointments)
    .where(eq(appointments.clinicId, clinicId));

  return (
    <div className="space-y-1">
      <PageHeader
        icon="🧑‍⚕️"
        title="الأطباء"
        subtitle="دليل الأطباء المستخدم في توزيع المواعيد ومنع التعارضات — لا توجد حسابات دخول في هذا الإصدار"
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="عدد الأطباء" value={rows.length} icon="🧑‍⚕️" tone="teal" />
        <Stat label="النشطون" value={rows.filter((r) => r.isActive).length} icon="✅" tone="good" />
        <Stat label="مواعيد قادمة" value={rows.reduce((s2, r) => s2 + r.upcoming, 0)} icon="⏭️" tone="sky" />
        <Stat label="إجمالي مواعيد العيادة" value={totalAppointments} icon="📅" tone="indigo" />
      </div>

      <Card className="mb-5" tone="indigo">
        <SectionTitle icon="➕">إضافة طبيب</SectionTitle>
        <DentistForm />
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon="🧑‍⚕️" title="لا يوجد أطباء مسجلون" hint="أضف طبيبًا واحدًا على الأقل لتفعيل منع تعارض المواعيد." />
      ) : (
        <Table head={["الطبيب", "التخصص", "الهاتف", "مواعيد قادمة", "زيارات مكتملة", "الحالة", "تاريخ الإضافة", ""]}>
          {rows.map((d) => (
            <tr key={d.id}>
              <Td><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: d.color ? `linear-gradient(135deg, ${d.color}, #0f766e)` : "linear-gradient(135deg,#14b8a6,#0f766e)" }}>🧑‍⚕️</span><span className="font-extrabold text-slate-800">{d.fullName}</span></div></Td>
              <Td>{d.specialty ? <Badge tone="indigo">{d.specialty}</Badge> : "—"}</Td>
              <Td className="font-mono text-xs">{displayPhone(d.phone)}</Td>
              <Td><Badge tone={d.upcoming > 0 ? "teal" : "slate"}>{d.upcoming} موعد</Badge></Td>
              <Td><Badge tone={d.completed > 0 ? "green" : "slate"}>{d.completed} زيارة</Badge></Td>
              <Td>{d.isActive ? <Badge tone="green" dot>نشط</Badge> : <Badge tone="slate" dot>موقوف</Badge>}</Td>
              <Td>{fmtDate(d.createdAt)}</Td>
              <Td>
                <form action={toggleDentistAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <Button type="submit" variant="ghost" className="text-xs">
                    {d.isActive ? "إيقاف" : "تفعيل"}
                  </Button>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      )}

    </div>
  );
}
