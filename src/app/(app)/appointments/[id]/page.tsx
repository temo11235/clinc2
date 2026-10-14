import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointmentEvents, appointments, notificationJobs, patients, dentists } from "@/db/schema";
import { requirePermission, can } from "@/lib/access";
import { fmtDate, fmtDateTime, fmtTime, displayPhone } from "@/lib/time";
import { statusLabels } from "@/lib/scheduling";
import { Badge, Card, PageHeader, Table, Td, statusTone, Button, Field, Input, Textarea } from "@/components/ui";
import { updateNotesAction, updateStatusAction } from "../actions";
import { RescheduleForm } from "@/components/reschedule-form";

export const dynamic = "force-dynamic";

const NEXT_STATUSES = ["confirmed", "checked_in", "completed", "no_show", "cancelled"];

export default async function AppointmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("appointments.read");
  const { id } = await params;
  const appointmentId = Number(id);
  if (!Number.isFinite(appointmentId)) notFound();

  const [row] = await db
    .select({
      appt: appointments,
      patient: patients,
      dentist: dentists.fullName,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .leftJoin(dentists, eq(dentists.id, appointments.dentistId))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, user.clinicId)))
    .limit(1);
  if (!row) notFound();

  const events = await db
    .select()
    .from(appointmentEvents)
    .where(eq(appointmentEvents.appointmentId, appointmentId))
    .orderBy(asc(appointmentEvents.createdAt));

  const jobs = await db.select().from(notificationJobs).where(eq(notificationJobs.appointmentId, appointmentId));
  const writable = true;
  const durationMin = Math.round(
    (new Date(row.appt.endsAt).getTime() - new Date(row.appt.startsAt).getTime()) / 60000,
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`موعد ${row.patient.fullName}`}
        subtitle={`${fmtDate(row.appt.startsAt)} · ${fmtTime(row.appt.startsAt)} - ${fmtTime(row.appt.endsAt)} · ${durationMin} دقيقة`}
        action={<Badge tone={statusTone[row.appt.status]}>{statusLabels[row.appt.status]}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold text-slate-800">بيانات الموعد</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">المريض</dt><dd><Link className="text-teal-700 hover:underline" href={`/patients/${row.patient.id}`}>{row.patient.fullName}</Link></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">الهاتف</dt><dd className="font-mono">{displayPhone(row.patient.phone)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">النوع</dt><dd>{row.appt.type}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">الطبيب</dt><dd>{row.dentist ?? "غير محدد"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">المصدر</dt><dd>{row.appt.source === "ai" ? "المساعد الذكي" : "موظف العيادة"}</dd></div>
          </dl>

          {writable ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {NEXT_STATUSES.map((s) => (
                <form key={s} action={updateStatusAction}>
                  <input type="hidden" name="appointmentId" value={appointmentId} />
                  <input type="hidden" name="status" value={s} />
                  <Button variant={s === "cancelled" ? "danger" : "secondary"} type="submit">
                    {statusLabels[s]}
                  </Button>
                </form>
              ))}
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="mb-3 font-bold text-slate-800">تأجيل الموعد</h2>
          {writable ? (
            <RescheduleForm appointmentId={appointmentId} defaultDate={fmtDate(row.appt.startsAt)} defaultTime={fmtTime(row.appt.startsAt)} defaultDuration={durationMin} />
          ) : (
            <p className="text-sm text-slate-500">لا تملك صلاحية التعديل.</p>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 font-bold text-slate-800">ملاحظات داخلية</h2>
        {writable ? (
          <form action={updateNotesAction} className="space-y-3">
            <input type="hidden" name="appointmentId" value={appointmentId} />
            <Field label="ملاحظات (مرئية لفريق العيادة فقط)">
              <Textarea name="notes" defaultValue={row.appt.notes ?? ""} />
            </Field>
            <Button type="submit" variant="secondary">حفظ الملاحظات</Button>
          </form>
        ) : (
          <p className="text-sm text-slate-600">{row.appt.notes ?? "—"}</p>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold text-slate-800">سجل الأحداث</h2>
          <ul className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between border-b border-slate-100 pb-1">
                <span>{e.event}</span>
                <span className="text-slate-500">{e.actorLabel ?? "النظام"} · {fmtDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold text-slate-800">التذكيرات</h2>
          {jobs.length === 0 ? (
            <p className="text-sm text-slate-500">لم تتم جدولة تذكيرات.</p>
          ) : (
            <Table head={["النوع", "القناة", "الموعد", "الحالة"]}>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <Td>{j.kind}</Td>
                  <Td>{j.channel}</Td>
                  <Td>{fmtDateTime(j.scheduledFor)}</Td>
                  <Td><Badge tone={statusTone[j.status] ?? "slate"}>{j.status}</Badge></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Field label="">
          <Input type="hidden" />
        </Field>
      </div>
    </div>
  );
}
