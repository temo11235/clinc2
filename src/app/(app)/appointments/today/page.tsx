import Link from "next/link";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { appointments, dentists, patients } from "@/db/schema";
import { requirePermission } from "@/lib/access";
import { cairoDayBounds, cairoDayString, displayPhone, fmtTime, nowMs, WEEKDAY_NAMES_AR } from "@/lib/time";
import { statusLabels } from "@/lib/scheduling";
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, ProgressBar, Stat, statusTone } from "@/components/ui";
import { updateStatusAction } from "../actions";

export const dynamic = "force-dynamic";

const QUICK = [
  { status: "confirmed", label: "تأكيد", cls: "bg-teal-50 text-teal-700 hover:bg-teal-100" },
  { status: "checked_in", label: "وصل", cls: "bg-amber-50 text-amber-700 hover:bg-amber-100" },
  { status: "completed", label: "إنهاء", cls: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  { status: "no_show", label: "لم يحضر", cls: "bg-violet-50 text-violet-700 hover:bg-violet-100" },
  { status: "cancelled", label: "إلغاء", cls: "bg-rose-50 text-rose-700 hover:bg-rose-100" },
];

export default async function TodayPage() {
  const user = await requirePermission("appointments.read");
  const today = cairoDayString();
  const weekday = WEEKDAY_NAMES_AR[new Date(`${today}T12:00:00Z`).getUTCDay()];
  const { start, end } = cairoDayBounds(today);

  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      type: appointments.type,
      source: appointments.source,
      notes: appointments.notes,
      patientId: patients.id,
      patientName: patients.fullName,
      phone: patients.phone,
      allergies: patients.allergies,
      conditions: patients.conditions,
      dentist: dentists.fullName,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .leftJoin(dentists, eq(dentists.id, appointments.dentistId))
    .where(and(eq(appointments.clinicId, user.clinicId), gte(appointments.startsAt, start), lt(appointments.startsAt, end)))
    .orderBy(asc(appointments.startsAt));

  const done = rows.filter((r) => r.status === "completed").length;
  const waiting = rows.filter((r) => r.status === "checked_in").length;
  const pending = rows.filter((r) => ["scheduled", "confirmed"].includes(r.status)).length;
  const progress = rows.length ? Math.round((done / rows.length) * 100) : 0;
  const now = nowMs();

  return (
    <div className="space-y-5">
      <PageHeader
        icon="⏱️"
        title="طابور مواعيد اليوم"
        subtitle={`${weekday} ${today} · ${rows.length} موعد`}
        action={<LinkButton href={`/appointments/new?date=${today}`}>➕ موعد</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي اليوم" value={rows.length} icon="📋" tone="teal" />
        <Stat label="في الانتظار بالعيادة" value={waiting} icon="🚪" tone="warn" />
        <Stat label="لم يحن موعدهم" value={pending} icon="🕐" tone="sky" />
        <Stat label="تم إنهاؤها" value={done} icon="🎉" tone="good" />
      </div>

      <Card tone="teal">
        <div className="mb-2 flex items-center justify-between text-sm font-bold text-slate-700">
          <span>تقدّم اليوم</span>
          <span className="text-teal-700">{progress}%</span>
        </div>
        <ProgressBar value={progress} />
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon="☕" title="لا توجد مواعيد اليوم" hint="استمتع بيوم هادئ أو أضف موعدًا جديدًا." action={<LinkButton href={`/appointments/new?date=${today}`}>حجز موعد</LinkButton>} />
      ) : (
        <div className="space-y-3">
          {rows.map((a) => {
            const isNow = new Date(a.startsAt).getTime() <= now && new Date(a.endsAt).getTime() >= now;
            const dim = ["cancelled", "no_show"].includes(a.status);
            return (
              <div
                key={a.id}
                className={`flex flex-wrap items-center gap-4 rounded-2xl border bg-white/90 p-4 shadow-sm backdrop-blur transition hover:shadow-md ${
                  isNow ? "border-teal-400 ring-2 ring-teal-200" : "border-white/70"
                } ${dim ? "opacity-60" : ""}`}
              >
                <div
                  className={`flex w-20 shrink-0 flex-col items-center justify-center rounded-xl py-2 text-white shadow-md ${
                    a.status === "completed"
                      ? "bg-gradient-to-br from-emerald-500 to-green-600"
                      : a.status === "checked_in"
                        ? "bg-gradient-to-br from-amber-500 to-orange-600"
                        : dim
                          ? "bg-gradient-to-br from-slate-400 to-slate-500"
                          : "bg-gradient-to-br from-teal-500 to-emerald-600"
                  }`}
                >
                  <span className="text-lg font-extrabold">{fmtTime(a.startsAt)}</span>
                  <span className="text-[10px] opacity-90">→ {fmtTime(a.endsAt)}</span>
                </div>

                <div className="min-w-48 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="font-extrabold text-slate-800 hover:text-teal-700 hover:underline" href={`/patients/${a.patientId}`}>
                      {a.patientName}
                    </Link>
                    {isNow ? <Badge tone="teal" dot>جارٍ الآن</Badge> : null}
                    {a.source === "ai" ? <Badge tone="indigo">🤖 حجز آلي</Badge> : null}
                    {a.allergies ? <Badge tone="red">⚠ {a.allergies}</Badge> : null}
                    {a.conditions ? <Badge tone="amber">🩺 {a.conditions}</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    <span className="font-mono">{displayPhone(a.phone)}</span> · {a.type}
                    {a.dentist ? ` · ${a.dentist}` : ""}
                  </p>
                  {a.notes ? <p className="mt-1 text-xs text-slate-400">📝 {a.notes}</p> : null}
                </div>

                <Badge tone={statusTone[a.status]} dot>
                  {statusLabels[a.status]}
                </Badge>

                <div className="flex flex-wrap gap-1.5">
                  {QUICK.filter((qa) => qa.status !== a.status).map((qa) => (
                    <form key={qa.status} action={updateStatusAction}>
                      <input type="hidden" name="appointmentId" value={a.id} />
                      <input type="hidden" name="status" value={qa.status} />
                      <Button type="submit" variant="ghost" className={`px-2.5 py-1.5 text-xs ${qa.cls}`}>
                        {qa.label}
                      </Button>
                    </form>
                  ))}
                  <Link className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100" href={`/appointments/${a.id}`}>
                    تفاصيل ←
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
