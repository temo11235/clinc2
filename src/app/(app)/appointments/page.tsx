import Link from "next/link";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { appointments, dentists, patients } from "@/db/schema";
import { requirePermission } from "@/lib/access";
import { addDaysStr, cairoDayBounds, cairoDayString, fmtTime, WEEKDAY_NAMES_AR } from "@/lib/time";
import { statusLabels } from "@/lib/scheduling";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Stat, statusTone } from "@/components/ui";

export const dynamic = "force-dynamic";

type View = "day" | "week" | "month";

const DENTIST_COLORS = ["border-r-teal-500", "border-r-indigo-500", "border-r-amber-500", "border-r-rose-500", "border-r-sky-500"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: View }>;
}) {
  const user = await requirePermission("appointments.read");
  const sp = await searchParams;
  const view: View = sp.view ?? "week";
  const anchor = sp.date ?? cairoDayString();
  const today = cairoDayString();

  const span = view === "day" ? 1 : view === "week" ? 7 : 30;
  const startDay = view === "month" ? `${anchor.slice(0, 7)}-01` : anchor;
  const endDay = addDaysStr(startDay, span - 1);
  const start = cairoDayBounds(startDay).start;
  const end = cairoDayBounds(endDay).end;

  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      type: appointments.type,
      source: appointments.source,
      patientName: patients.fullName,
      patientId: patients.id,
      dentist: dentists.fullName,
      dentistId: appointments.dentistId,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .leftJoin(dentists, eq(dentists.id, appointments.dentistId))
    .where(and(eq(appointments.clinicId, user.clinicId), gte(appointments.startsAt, start), lt(appointments.startsAt, end)))
    .orderBy(asc(appointments.startsAt));

  const docs = await db.select().from(dentists).where(eq(dentists.clinicId, user.clinicId));
  const colorOf = (id: number | null) => {
    const i = docs.findIndex((d) => d.id === id);
    return DENTIST_COLORS[i >= 0 ? i % DENTIST_COLORS.length : 0];
  };

  const days: string[] = Array.from({ length: span }, (_, i) => addDaysStr(startDay, i));
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = cairoDayString(new Date(r.startsAt));
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }

  const counts = {
    completed: rows.filter((r) => r.status === "completed").length,
    active: rows.filter((r) => ["scheduled", "confirmed", "checked_in"].includes(r.status)).length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    ai: rows.filter((r) => r.source === "ai").length,
  };

  const navLink = (d: string, v: View) => `/appointments?date=${d}&view=${v}`;

  return (
    <div className="space-y-5">
      <PageHeader
        icon="🗓️"
        title="تقويم المواعيد"
        subtitle={`${startDay} → ${endDay} · توقيت القاهرة`}
        action={<LinkButton href={`/appointments/new?date=${anchor}`}>➕ موعد جديد</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي المواعيد" value={rows.length} icon="📅" tone="teal" />
        <Stat label="نشطة / قادمة" value={counts.active} icon="⏭️" tone="sky" />
        <Stat label="مكتملة" value={counts.completed} icon="🎉" tone="good" />
        <Stat label="حجوزات المساعد الذكي" value={counts.ai} icon="🤖" tone="indigo" />
      </div>

      <div className="no-print flex flex-wrap items-center gap-2 rounded-2xl border border-white/70 bg-white/80 p-3 backdrop-blur">
        <div className="flex rounded-xl bg-slate-100 p-1">
          {(["day", "week", "month"] as View[]).map((v) => (
            <Link
              key={v}
              href={navLink(anchor, v)}
              className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${
                view === v ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {v === "day" ? "يومي" : v === "week" ? "أسبوعي" : "شهري"}
            </Link>
          ))}
        </div>
        <Link href={navLink(addDaysStr(anchor, -span), view)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:border-teal-300">
          ◀ السابق
        </Link>
        <Link href={navLink(today, view)} className="rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md">
          اليوم
        </Link>
        <Link href={navLink(addDaysStr(anchor, span), view)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:border-teal-300">
          التالي ▶
        </Link>

        <div className="ms-auto flex flex-wrap items-center gap-3 text-xs">
          {docs.map((d, i) => (
            <span key={d.id} className="flex items-center gap-1.5 font-bold text-slate-600">
              <span className={`h-3 w-3 rounded-full ${DENTIST_COLORS[i % DENTIST_COLORS.length].replace("border-r-", "bg-")}`} />
              {d.fullName}
            </span>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="🗓️"
          title="لا توجد مواعيد في هذه الفترة"
          hint="يمكنك حجز موعد جديد أو تغيير الفترة الزمنية."
          action={<LinkButton href="/appointments/new">حجز موعد</LinkButton>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const weekday = WEEKDAY_NAMES_AR[new Date(`${d}T12:00:00Z`).getUTCDay()];
            const isToday = d === today;
            return (
              <Card
                key={d}
                className={`${items.length === 0 ? "opacity-70" : ""} ${isToday ? "ring-2 ring-teal-400 ring-offset-2" : ""}`}
              >
                <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="flex items-center gap-2 font-extrabold text-slate-800">
                    {weekday}
                    {isToday ? <Badge tone="teal">اليوم</Badge> : null}
                    <span className="text-xs font-normal text-slate-400">{d}</span>
                  </h3>
                  <Link className="rounded-lg bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100" href={`/appointments/new?date=${d}`}>
                    + حجز
                  </Link>
                </div>
                {items.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-300">لا توجد مواعيد</p>
                ) : (
                  <ul className="max-h-80 space-y-2 overflow-y-auto pe-1">
                    {items.map((a) => (
                      <li
                        key={a.id}
                        className={`rounded-xl border border-slate-100 border-r-4 bg-gradient-to-l from-white to-slate-50/60 p-2.5 text-sm transition hover:shadow-md ${colorOf(a.dentistId)}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link className="font-extrabold text-slate-800 hover:text-teal-700" href={`/appointments/${a.id}`}>
                            {fmtTime(a.startsAt)}
                            <span className="text-xs font-normal text-slate-400"> → {fmtTime(a.endsAt)}</span>
                          </Link>
                          <Badge tone={statusTone[a.status]}>{statusLabels[a.status]}</Badge>
                        </div>
                        <p className="mt-1 truncate font-semibold text-slate-700">
                          {a.source === "ai" ? "🤖 " : ""}
                          {a.patientName}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {a.type}
                          {a.dentist ? ` · ${a.dentist}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
