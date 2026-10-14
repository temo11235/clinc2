import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, patients, visits } from "@/db/schema";
import { requirePermission } from "@/lib/access";
import { patientBalance } from "@/lib/analytics";
import { formatEGP } from "@/lib/money";
import { displayPhone, fmtDate, fmtDateTime } from "@/lib/time";
import { getClinic } from "@/lib/settings";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function PatientPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("patients.read");
  const { id } = await params;
  const [patient] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, Number(id)), eq(patients.clinicId, user.clinicId)))
    .limit(1);
  if (!patient) notFound();

  const clinic = await getClinic(user.clinicId);
  const balance = await patientBalance(user.clinicId, patient.id);
  const visitRows = await db.select().from(visits).where(eq(visits.patientId, patient.id)).orderBy(desc(visits.visitDate)).limit(10);
  const apptRows = await db.select().from(appointments).where(eq(appointments.patientId, patient.id)).orderBy(desc(appointments.startsAt)).limit(10);

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm print:p-0">
      <PrintButton />
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-bold">{clinic?.name}</h1>
        <p className="text-slate-500">{clinic?.address} · {clinic?.phone}</p>
      </header>
      <h2 className="mb-2 text-lg font-bold">ملخص ملف المريض</h2>
      <table className="mb-6 w-full">
        <tbody>
          <tr><td className="py-1 font-semibold">الاسم</td><td>{patient.fullName}</td></tr>
          <tr><td className="py-1 font-semibold">كود المريض</td><td>{patient.code}</td></tr>
          <tr><td className="py-1 font-semibold">الهاتف</td><td>{displayPhone(patient.phone)}</td></tr>
          <tr><td className="py-1 font-semibold">تاريخ الميلاد</td><td>{patient.birthDate ?? "—"}</td></tr>
          <tr><td className="py-1 font-semibold">الحساسية</td><td>{patient.allergies ?? "لا يوجد"}</td></tr>
          <tr><td className="py-1 font-semibold">الأدوية الحالية</td><td>{patient.medications ?? "لا يوجد"}</td></tr>
          <tr><td className="py-1 font-semibold">الرصيد المستحق</td><td>{formatEGP(balance.balanceMinor)}</td></tr>
        </tbody>
      </table>

      <h3 className="mb-2 font-bold">آخر الزيارات</h3>
      {visitRows.length === 0 ? <p className="mb-4 text-slate-500">لا توجد زيارات.</p> : (
        <ul className="mb-6 space-y-1">
          {visitRows.map((v) => (
            <li key={v.id}>• {fmtDate(v.visitDate)} — {v.diagnosis ?? v.chiefComplaint ?? "زيارة"}</li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 font-bold">آخر المواعيد</h3>
      <ul className="space-y-1">
        {apptRows.map((a) => (
          <li key={a.id}>• {fmtDateTime(a.startsAt)} — {a.type} ({a.status})</li>
        ))}
      </ul>

      <footer className="mt-8 border-t pt-3 text-xs text-slate-400">
        طُبع بتاريخ {fmtDateTime(new Date())} — مستند طبي سري، للاستخدام داخل العيادة فقط.
      </footer>
    </div>
  );
}
