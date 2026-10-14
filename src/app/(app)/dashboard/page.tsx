import Link from "next/link";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, dentists, patients, payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import {
  dashboardStats,
  dentistPerformance,
  patientRetention,
  revenueTrend,
  statusDistribution,
  topTreatments,
} from "@/lib/analytics";
import { formatEGP } from "@/lib/money";
import { addDaysStr, cairoDayString, fmtDate, fmtTime } from "@/lib/time";
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
  statusIcon,
  statusTone,
} from "@/components/ui";
import { DentistBar, RevenueChart, StatusPie, TreatmentsBar } from "@/components/charts";
import { DateRangeForm } from "@/components/date-range-form";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = cairoDayString();
  const from = sp.from ?? addDaysStr(today, -29);
  const to = sp.to ?? today;
  const prevFrom = addDaysStr(from, -30);
  const prevTo = addDaysStr(from, -1);

  const [stats, prev, todayStats, trend, dist, treatments, retention, docs] = await Promise.all([
    dashboardStats(user.clinicId, from, to),
    dashboardStats(user.clinicId, prevFrom, prevTo),
    dashboardStats(user.clinicId),
    revenueTrend(user.clinicId, from, to),
    statusDistribution(user.clinicId, from, to),
    topTreatments(user.clinicId, from, to),
    patientRetention(user.clinicId),
    dentistPerformance(user.clinicId, from, to),
  ]);

  const upcoming = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      type: appointments.type,
      patientName: patients.fullName,
      patientId: patients.id,
      dentist: dentists.fullName,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .leftJoin(dentists, eq(dentists.id, appointments.dentistId))
    .where(
      and(
        eq(appointments.clinicId, user.clinicId),
        gte(appointments.startsAt, new Date()),
        sql`${appointments.status} in ('scheduled','confirmed','checked_in')`,
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(7);

  const recentPayments = await db
    .select({
      id: payments.id,
      amountMinor: payments.amountMinor,
      method: payments.method,
      paidAt: payments.paidAt,
      patientName: patients.fullName,
      patientId: patients.id,
    })
    .from(payments)
    .innerJoin(patients, eq(patients.id, payments.patientId))
    .where(eq(payments.clinicId, user.clinicId))
    .orderBy(desc(payments.paidAt))
    .limit(6);

  const topDebtors = await db
    .select({
      id: patients.id,
      name: patients.fullName,
      balance: sql<number>`(
        coalesce((select sum(total_minor) from invoices i where i.patient_id = ${patients.id} and i.status = 'finalized'),0)
        - coalesce((select sum(amount_minor) from payments p where p.patient_id = ${patients.id}),0)
      )::bigint`,
    })
    .from(patients)
    .where(eq(patients.clinicId, user.clinicId))
    .orderBy(
      desc(sql`(
        coalesce((select sum(total_minor) from invoices i where i.patient_id = ${patients.id} and i.status = 'finalized'),0)
        - coalesce((select sum(amount_minor) from payments p where p.patient_id = ${patients.id}),0)
      )`),
    )
    .limit(5);

  const net = stats.money.collectedMinor - stats.money.expensesMinor - stats.money.refundsMinor;
  const prevNet = prev.money.collectedMinor - prev.money.expensesMinor - prev.money.refundsMinor;
  const total = stats.appointments.total || 1;
  const pctOf = (n: number) => Math.round((n / total) * 100);
  const delta = (cur: number, before: number) => {
    if (!before) return undefined;
    const pct = Math.round(((cur - before) / Math.abs(before)) * 100);
    return { value: `${Math.abs(pct)}%`, up: pct >= 0 };
  };
  const collectionRate = stats.money.invoicedMinor
    ? Math.round((stats.money.collectedMinor / stats.money.invoicedMinor) * 100)
    : 0;
  const maxDebt = Math.max(1, ...topDebtors.map((d) => Number(d.balance)));

  return (
    <div className="space-y-6">
      <PageHeader
        icon="📊"
        title="لوحة التحكم"
        subtitle={`ملخص أداء العيادة · ${from} إلى ${to} · مقارنة بالفترة السابقة`}
        action={<DateRangeForm from={from} to={to} basePath="/dashboard" />}
      />

      {/* شريط اليوم */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="مواعيد اليوم" value={todayStats.appointments.total} icon="🗓️" tone="teal" hint={`${todayStats.appointments.upcoming} قادمة`} />
        <Stat label="مكتملة اليوم" value={todayStats.appointments.completed} icon="🎉" tone="good" />
        <Stat label="ملغاة اليوم" value={todayStats.appointments.cancelled} icon="✖️" tone="warn" />
        <Stat label="لم يحضروا اليوم" value={todayStats.appointments.noShow} icon="👻" tone="bad" />
        <Stat label="تحصيل اليوم" value={formatEGP(todayStats.money.collectedMinor)} icon="💵" tone="indigo" />
      </div>

      {/* مؤشرات الفترة */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="التحصيل خلال الفترة"
          value={formatEGP(stats.money.collectedMinor)}
          icon="💰"
          tone="good"
          trend={delta(stats.money.collectedMinor, prev.money.collectedMinor)}
          hint={`فواتير ${formatEGP(stats.money.invoicedMinor)}`}
        />
        <Stat
          label="المصروفات"
          value={formatEGP(stats.money.expensesMinor)}
          icon="📉"
          tone="bad"
          trend={delta(stats.money.expensesMinor, prev.money.expensesMinor)}
        />
        <Stat
          label="صافي التشغيل"
          value={formatEGP(net)}
          icon="📈"
          tone={net >= 0 ? "teal" : "bad"}
          trend={delta(net, prevNet)}
          hint="تحصيل − مصروفات − مرتجعات"
        />
        <Stat
          label="المستحقات غير المحصلة"
          value={formatEGP(stats.money.outstandingMinor)}
          icon="⏳"
          tone="warn"
          hint="إجمالي أرصدة المرضى"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي المواعيد" value={stats.appointments.total} icon="📅" tone="sky" trend={delta(stats.appointments.total, prev.appointments.total)} />
        <Stat label="مرضى جدد" value={stats.patients.new} icon="✨" tone="indigo" hint={`إجمالي ${stats.patients.total} مريض`} trend={delta(stats.patients.new, prev.patients.new)} />
        <Stat label="نسبة الإكمال" value={`${pctOf(stats.appointments.completed)}%`} icon="✅" tone="good" />
        <Stat label="نسبة عدم الحضور" value={`${pctOf(stats.appointments.noShow)}%`} icon="👻" tone="bad" />
      </div>

      {/* الرسوم */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card tone="teal" className="xl:col-span-2">
          <SectionTitle icon="💹">اتجاه الإيرادات والمصروفات</SectionTitle>
          <RevenueChart data={trend} />
        </Card>
        <Card tone="indigo">
          <SectionTitle icon="🥧">توزيع حالات المواعيد</SectionTitle>
          <StatusPie data={dist} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card tone="sky" className="xl:col-span-2">
          <SectionTitle icon="🏆">أكثر الإجراءات تنفيذًا</SectionTitle>
          <TreatmentsBar data={treatments.slice(0, 7).map((t) => ({ title: t.title, count: t.count }))} />
        </Card>
        <div className="space-y-4">
          <Card tone="amber">
            <SectionTitle icon="🔁">معدل عودة المرضى</SectionTitle>
            {retention.total < 5 ? (
              <EmptyState icon="📉" title="البيانات غير كافية" hint="يحتاج المؤشر إلى 5 مرضى على الأقل." />
            ) : (
              <div className="py-3 text-center">
                <p className="bg-gradient-to-l from-teal-600 to-indigo-600 bg-clip-text text-5xl font-extrabold text-transparent">
                  {retention.rate}%
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {retention.returning} من {retention.total} مريضًا لديهم أكثر من زيارة مكتملة
                </p>
                <div className="mt-3">
                  <ProgressBar value={retention.rate} />
                </div>
              </div>
            )}
          </Card>
          <Card tone="rose">
            <SectionTitle icon="🎯">نسبة التحصيل من الفواتير</SectionTitle>
            <p className="text-4xl font-extrabold text-emerald-600">{collectionRate}%</p>
            <div className="mt-3">
              <ProgressBar value={collectionRate} tone={collectionRate >= 70 ? "teal" : collectionRate >= 40 ? "amber" : "rose"} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {formatEGP(stats.money.collectedMinor)} من {formatEGP(stats.money.invoicedMinor)}
            </p>
          </Card>
        </div>
      </div>

      <Card tone="indigo">
        <SectionTitle icon="🧑‍⚕️">أداء الأطباء خلال الفترة</SectionTitle>
        <DentistBar data={docs} />
      </Card>

      {/* جداول */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle icon="⏭️">المواعيد القادمة</SectionTitle>
            <Link className="text-xs font-bold text-teal-700 hover:underline" href="/appointments">
              عرض التقويم ←
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState icon="🗓️" title="لا توجد مواعيد قادمة" action={<LinkButton href="/appointments/new">حجز موعد</LinkButton>} />
          ) : (
            <Table head={["المريض", "الموعد", "النوع", "الطبيب", "الحالة"]}>
              {upcoming.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <Link className="font-bold text-teal-700 hover:underline" href={`/patients/${a.patientId}`}>
                      {a.patientName}
                    </Link>
                  </Td>
                  <Td>
                    <span className="font-bold text-slate-800">{fmtTime(a.startsAt)}</span>
                    <span className="mr-2 text-xs text-slate-400">{fmtDate(a.startsAt)}</span>
                  </Td>
                  <Td className="max-w-36 truncate text-xs">{a.type}</Td>
                  <Td className="text-xs">{a.dentist ?? "—"}</Td>
                  <Td>
                    <Badge tone={statusTone[a.status]} dot>
                      {statusLabels[a.status] ?? a.status}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle icon="💳">أحدث المدفوعات</SectionTitle>
            <Link className="text-xs font-bold text-teal-700 hover:underline" href="/payments">
              الخزينة ←
            </Link>
          </div>
          {recentPayments.length === 0 ? (
            <EmptyState icon="💵" title="لا توجد مدفوعات مسجلة" />
          ) : (
            <Table head={["المريض", "المبلغ", "الوسيلة", "التاريخ"]}>
              {recentPayments.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Link className="hover:underline" href={`/patients/${p.patientId}`}>
                      {p.patientName}
                    </Link>
                  </Td>
                  <Td className="font-extrabold text-emerald-700">{formatEGP(p.amountMinor)}</Td>
                  <Td>
                    <Badge tone={p.method === "cash" ? "green" : p.method === "card" ? "blue" : "indigo"}>
                      {p.method === "cash" ? "💵 نقدًا" : p.method === "card" ? "💳 بطاقة" : "🏦 تحويل"}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {fmtDate(p.paidAt)} · {fmtTime(p.paidAt)}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>

      {topDebtors.some((d) => Number(d.balance) > 0) ? (
        <Card tone="rose">
          <SectionTitle icon="📌">أعلى الأرصدة المستحقة على المرضى</SectionTitle>
          <ul className="space-y-3">
            {topDebtors
              .filter((d) => Number(d.balance) > 0)
              .map((d) => (
                <li key={d.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <Link className="font-bold text-slate-700 hover:text-teal-700 hover:underline" href={`/patients/${d.id}`}>
                      {d.name}
                    </Link>
                    <span className="font-extrabold text-rose-600">{formatEGP(Number(d.balance))}</span>
                  </div>
                  <ProgressBar value={(Number(d.balance) / maxDebt) * 100} tone="rose" />
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/appointments/new", label: "حجز موعد جديد", icon: "🗓️", color: "from-teal-500 to-emerald-600" },
          { href: "/patients/new", label: "تسجيل مريض", icon: "👤", color: "from-indigo-500 to-violet-600" },
          { href: "/invoices/new", label: "إصدار فاتورة", icon: "🧾", color: "from-amber-500 to-orange-600" },
          { href: "/reports", label: "التقارير التفصيلية", icon: "📈", color: "from-sky-500 to-cyan-600" },
        ].map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className={`flex items-center gap-3 rounded-2xl bg-gradient-to-l ${q.color} p-4 text-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-xl">{q.icon}</span>
            <span className="font-bold">{q.label}</span>
          </Link>
        ))}
      </div>

      <p className="pb-2 text-center text-xs text-slate-400">
        آخر حالة مسجلة اليوم: {statusIcon.completed} {todayStats.appointments.completed} مكتملة ·{" "}
        {statusIcon.scheduled} {todayStats.appointments.upcoming} قادمة
      </p>
    </div>
  );
}
