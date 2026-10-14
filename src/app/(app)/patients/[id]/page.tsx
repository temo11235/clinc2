import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, dentists, invoices, patientConsents, payments, patients, visitProcedures, visits } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { patientBalance } from "@/lib/analytics";
import { formatEGP } from "@/lib/money";
import { displayPhone, fmtDate, fmtDateTime } from "@/lib/time";
import { statusLabels } from "@/lib/scheduling";
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  ProgressBar,
  SectionTitle,
  Stat,
  Table,
  Td,
  statusTone,
} from "@/components/ui";
import { DentalChart } from "@/components/dental-chart";
import { PatientForm } from "@/components/patient-form";

export const dynamic = "force-dynamic";

const STATUS_AR: Record<string, string> = { draft: "مسودة", finalized: "نهائية", cancelled: "ملغاة" };

export default async function PatientProfile({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const patientId = Number(id);
  if (!Number.isFinite(patientId)) notFound();

  const [patient] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, user.clinicId)))
    .limit(1);
  if (!patient) notFound();

  const [appts, visitRows, procedures, invoiceRows, paymentRows, consents, balance] = await Promise.all([
    db
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        status: appointments.status,
        type: appointments.type,
        source: appointments.source,
        dentist: dentists.fullName,
      })
      .from(appointments)
      .leftJoin(dentists, eq(dentists.id, appointments.dentistId))
      .where(eq(appointments.patientId, patientId))
      .orderBy(desc(appointments.startsAt))
      .limit(30),
    db.select().from(visits).where(eq(visits.patientId, patientId)).orderBy(desc(visits.visitDate)).limit(25),
    db.select().from(visitProcedures).where(eq(visitProcedures.patientId, patientId)).orderBy(desc(visitProcedures.createdAt)),
    db.select().from(invoices).where(eq(invoices.patientId, patientId)).orderBy(desc(invoices.issuedAt)).limit(20),
    db.select().from(payments).where(eq(payments.patientId, patientId)).orderBy(desc(payments.paidAt)).limit(20),
    db.select().from(patientConsents).where(eq(patientConsents.patientId, patientId)),
    patientBalance(user.clinicId, patientId),
  ]);

  const completed = appts.filter((a) => a.status === "completed").length;
  const upcoming = appts.filter((a) => ["scheduled", "confirmed", "checked_in"].includes(a.status));
  const paidPct = balance.invoicedMinor ? Math.round((balance.paidMinor / balance.invoicedMinor) * 100) : 100;
  const age = patient.birthDate ? new Date().getFullYear() - Number(String(patient.birthDate).slice(0, 4)) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        icon="🧑"
        title={patient.fullName}
        subtitle={`كود ${patient.code} · ${displayPhone(patient.phone)}${age ? ` · ${age} سنة` : ""} · مسجل منذ ${fmtDate(patient.createdAt)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/patients/${patient.id}/print`} variant="secondary">
              🖨 ملخص
            </LinkButton>
            <LinkButton href={`/visits/new?patientId=${patient.id}`} variant="indigo">
              🩺 زيارة
            </LinkButton>
            <LinkButton href={`/appointments/new?patientId=${patient.id}`}>🗓️ حجز موعد</LinkButton>
          </div>
        }
      />

      {patient.allergies || patient.conditions || patient.medications ? (
        <div className="rounded-2xl border-r-4 border-amber-400 bg-gradient-to-l from-amber-50 to-orange-50/60 p-4 shadow-sm">
          <p className="mb-2 font-extrabold text-amber-900">⚠️ تنبيهات طبية هامة</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {patient.allergies ? <Badge tone="red">حساسية: {patient.allergies}</Badge> : null}
            {patient.conditions ? <Badge tone="amber">حالات: {patient.conditions}</Badge> : null}
            {patient.medications ? <Badge tone="indigo">أدوية: {patient.medications}</Badge> : null}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="إجمالي المواعيد" value={appts.length} icon="📅" tone="sky" />
        <Stat label="زيارات مكتملة" value={completed} icon="🎉" tone="good" />
        <Stat label="إجمالي الفواتير" value={formatEGP(balance.invoicedMinor)} icon="🧾" tone="indigo" />
        <Stat label="إجمالي المدفوع" value={formatEGP(balance.paidMinor)} icon="💵" tone="teal" />
        <Stat
          label="الرصيد المستحق"
          value={formatEGP(balance.balanceMinor)}
          icon={balance.balanceMinor > 0 ? "⏳" : "✅"}
          tone={balance.balanceMinor > 0 ? "bad" : "good"}
        />
      </div>

      <Card tone="teal">
        <div className="mb-2 flex items-center justify-between text-sm font-bold text-slate-700">
          <span>نسبة السداد</span>
          <span className={paidPct >= 100 ? "text-emerald-600" : "text-amber-600"}>{paidPct}%</span>
        </div>
        <ProgressBar value={paidPct} tone={paidPct >= 100 ? "teal" : paidPct >= 50 ? "amber" : "rose"} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <SectionTitle icon="📇">البيانات الشخصية</SectionTitle>
          <dl className="space-y-2.5 text-sm">
            {[
              ["الهاتف", displayPhone(patient.phone)],
              ["البريد", patient.email ?? "—"],
              ["تاريخ الميلاد", patient.birthDate ?? "—"],
              ["النوع", patient.gender === "female" ? "أنثى" : patient.gender === "male" ? "ذكر" : "—"],
              ["العنوان", patient.address ?? "—"],
              ["طوارئ", patient.emergencyContact ?? "—"],
              ["قناة التواصل", patient.preferredChannel],
              ["آخر زيارة", patient.lastVisitAt ? fmtDate(patient.lastVisitAt) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-3 border-b border-slate-50 pb-2">
                <dt className="shrink-0 text-slate-400">{k}</dt>
                <dd className="truncate text-left font-semibold text-slate-700">{v}</dd>
              </div>
            ))}
          </dl>
          {patient.notes ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">📝 {patient.notes}</p> : null}
        </Card>

        <Card className="xl:col-span-2" tone="sky">
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle icon="📅">سجل المواعيد</SectionTitle>
            {upcoming.length > 0 ? <Badge tone="teal">{upcoming.length} موعد قادم</Badge> : null}
          </div>
          {appts.length === 0 ? (
            <EmptyState icon="🗓️" title="لا توجد مواعيد" />
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table head={["الموعد", "النوع", "الطبيب", "الحالة"]}>
                {appts.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      <Link className="font-bold text-teal-700 hover:underline" href={`/appointments/${a.id}`}>
                        {fmtDateTime(a.startsAt)}
                      </Link>
                    </Td>
                    <Td className="max-w-36 truncate text-xs">
                      {a.source === "ai" ? "🤖 " : ""}
                      {a.type}
                    </Td>
                    <Td className="text-xs">{a.dentist ?? "—"}</Td>
                    <Td>
                      <Badge tone={statusTone[a.status]}>{statusLabels[a.status] ?? a.status}</Badge>
                    </Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>
      </div>

      <Card tone="indigo">
        <SectionTitle icon="🦷">مخطط الأسنان (ترقيم FDI)</SectionTitle>
        <DentalChart
          records={procedures
            .filter((p) => p.toothNumber)
            .map((p) => ({
              toothNumber: p.toothNumber as number,
              title: p.title,
              status: p.status,
              surfaces: p.surfaces,
              date: fmtDate(p.createdAt),
            }))}
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card tone="amber">
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle icon="🩺">الزيارات السريرية</SectionTitle>
            <LinkButton href={`/visits/new?patientId=${patient.id}`} variant="secondary">
              + زيارة
            </LinkButton>
          </div>
          {visitRows.length === 0 ? (
            <EmptyState icon="🩺" title="لا توجد زيارات مسجلة" />
          ) : (
            <ul className="max-h-96 space-y-2.5 overflow-y-auto text-sm">
              {visitRows.map((v) => (
                <li key={v.id} className="rounded-xl border border-slate-100 bg-gradient-to-l from-white to-slate-50/50 p-3 transition hover:shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-800">{fmtDate(v.visitDate)}</span>
                    <div className="flex items-center gap-2">
                      {v.locked ? <Badge tone="green">مقفل</Badge> : <Badge tone="amber">مفتوح</Badge>}
                      <Link className="text-xs font-bold text-teal-700 hover:underline" href={`/visits/${v.id}`}>
                        التفاصيل ←
                      </Link>
                    </div>
                  </div>
                  <p className="mt-1 text-slate-600">🗣️ {v.chiefComplaint ?? "—"}</p>
                  <p className="text-slate-500">🔎 {v.diagnosis ?? "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card tone="rose">
            <SectionTitle icon="🧾">الفواتير</SectionTitle>
            {invoiceRows.length === 0 ? (
              <EmptyState icon="🧾" title="لا توجد فواتير" />
            ) : (
              <div className="max-h-44 overflow-y-auto">
                <Table head={["رقم", "التاريخ", "الإجمالي", "الحالة"]}>
                  {invoiceRows.map((inv) => (
                    <tr key={inv.id}>
                      <Td>
                        <Link className="font-mono text-xs text-teal-700 hover:underline" href={`/invoices/${inv.id}`}>
                          {inv.number}
                        </Link>
                      </Td>
                      <Td className="text-xs">{fmtDate(inv.issuedAt)}</Td>
                      <Td className="font-bold">{formatEGP(inv.totalMinor)}</Td>
                      <Td>
                        <Badge tone={statusTone[inv.status] ?? "slate"}>{STATUS_AR[inv.status]}</Badge>
                      </Td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>

          <Card tone="teal">
            <SectionTitle icon="💵">المدفوعات</SectionTitle>
            {paymentRows.length === 0 ? (
              <EmptyState icon="💵" title="لا توجد مدفوعات" />
            ) : (
              <div className="max-h-44 overflow-y-auto">
                <Table head={["التاريخ", "المبلغ", "الوسيلة"]}>
                  {paymentRows.map((p) => (
                    <tr key={p.id}>
                      <Td className="text-xs">{fmtDateTime(p.paidAt)}</Td>
                      <Td className="font-extrabold text-emerald-700">{formatEGP(p.amountMinor)}</Td>
                      <Td>
                        <Badge tone={p.method === "cash" ? "green" : p.method === "card" ? "blue" : "indigo"}>
                          {p.method === "cash" ? "نقدًا" : p.method === "card" ? "بطاقة" : "تحويل"}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <SectionTitle icon="✍️">الموافقات المسجلة</SectionTitle>
        {consents.length === 0 ? (
          <p className="text-sm text-slate-400">لا توجد موافقات مسجلة.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {consents.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Badge tone={c.granted ? "green" : "red"}>{c.granted ? "موافق" : "مرفوض"}</Badge>
                <span className="text-slate-600">{c.type}</span>
                <span className="text-xs text-slate-400">{fmtDateTime(c.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <details className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur">
        <summary className="cursor-pointer text-base font-extrabold text-slate-800">✏️ تعديل بيانات المريض</summary>
        <div className="mt-4">
          <PatientForm
            mode="edit"
            defaults={{
              id: patient.id,
              fullName: patient.fullName,
              phone: displayPhone(patient.phone),
              email: patient.email,
              birthDate: patient.birthDate,
              gender: patient.gender,
              address: patient.address,
              emergencyContact: patient.emergencyContact,
              medicalHistory: patient.medicalHistory,
              allergies: patient.allergies,
              medications: patient.medications,
              conditions: patient.conditions,
              notes: patient.notes,
              preferredChannel: patient.preferredChannel,
            }}
          />
        </div>
      </details>
    </div>
  );
}
