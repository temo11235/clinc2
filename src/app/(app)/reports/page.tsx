import { requirePermission } from "@/lib/access";
import {
  appointmentSources,
  dashboardStats,
  dentistPerformance,
  patientRetention,
  revenueTrend,
  statusDistribution,
  topTreatments,
} from "@/lib/analytics";
import { formatEGP } from "@/lib/money";
import { addDaysStr, cairoDayString } from "@/lib/time";
import { Card, EmptyState, LinkButton, PageHeader, ProgressBar, SectionTitle, Stat, Table, Td } from "@/components/ui";
import { DentistBar, RevenueChart, SourcePie, StatusPie, TreatmentsBar } from "@/components/charts";
import { DateRangeForm } from "@/components/date-range-form";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requirePermission("reports.read");
  const sp = await searchParams;
  const today = cairoDayString();
  const from = sp.from ?? addDaysStr(today, -29);
  const to = sp.to ?? today;
  const prevFrom = addDaysStr(from, -30);
  const prevTo = addDaysStr(from, -1);

  const [stats, prev, trend, dist, treatments, retention, docs, sources] = await Promise.all([
    dashboardStats(user.clinicId, from, to),
    dashboardStats(user.clinicId, prevFrom, prevTo),
    revenueTrend(user.clinicId, from, to),
    statusDistribution(user.clinicId, from, to),
    topTreatments(user.clinicId, from, to),
    patientRetention(user.clinicId),
    dentistPerformance(user.clinicId, from, to),
    appointmentSources(user.clinicId, from, to),
  ]);

  const totalAppts = stats.appointments.total;
  const pct = (n: number) => (totalAppts ? Math.round((n / totalAppts) * 100) : 0);
  const net = stats.money.collectedMinor - stats.money.expensesMinor - stats.money.refundsMinor;
  const prevNet = prev.money.collectedMinor - prev.money.expensesMinor - prev.money.refundsMinor;
  const delta = (cur: number, before: number) => {
    if (!before) return undefined;
    const p = Math.round(((cur - before) / Math.abs(before)) * 100);
    return { value: `${Math.abs(p)}%`, up: p >= 0 };
  };
  const maxTreat = Math.max(1, ...treatments.map((t) => t.revenueMinor));
  const aiBookings = sources.find((s) => s.source === "ai")?.count ?? 0;
  const totalSources = sources.reduce((s, x) => s + x.count, 0) || 1;

  return (
    <div className="space-y-5">
      <PageHeader
        icon="📈"
        title="التقارير والتحليلات"
        subtitle={`${from} → ${to} · كل الأرقام محسوبة مباشرة من قاعدة البيانات`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeForm from={from} to={to} basePath="/reports" />
            <LinkButton href={`/api/exports/report?from=${from}&to=${to}`} variant="secondary">
              ⬇ CSV
            </LinkButton>
          </div>
        }
      />
      <PrintButton label="🖨 طباعة التقرير" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="التحصيل" value={formatEGP(stats.money.collectedMinor)} icon="💰" tone="good" trend={delta(stats.money.collectedMinor, prev.money.collectedMinor)} />
        <Stat label="الفواتير النهائية" value={formatEGP(stats.money.invoicedMinor)} icon="🧾" tone="sky" trend={delta(stats.money.invoicedMinor, prev.money.invoicedMinor)} />
        <Stat label="المصروفات" value={formatEGP(stats.money.expensesMinor)} icon="📉" tone="bad" trend={delta(stats.money.expensesMinor, prev.money.expensesMinor)} />
        <Stat label="صافي التشغيل" value={formatEGP(net)} icon="📊" tone={net >= 0 ? "teal" : "bad"} trend={delta(net, prevNet)} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="المستحقات" value={formatEGP(stats.money.outstandingMinor)} icon="⏳" tone="warn" />
        <Stat label="المرتجعات" value={formatEGP(stats.money.refundsMinor)} icon="↩️" tone="bad" />
        <Stat label="إجمالي المواعيد" value={totalAppts} icon="📅" tone="indigo" />
        <Stat label="مرضى جدد" value={stats.patients.new} icon="✨" tone="teal" hint={`إجمالي ${stats.patients.total}`} />
      </div>

      <Card tone="teal">
        <SectionTitle icon="💹">الإيرادات مقابل المصروفات</SectionTitle>
        <RevenueChart data={trend} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card tone="indigo">
          <SectionTitle icon="🥧">حالات المواعيد</SectionTitle>
          <StatusPie data={dist} />
        </Card>
        <Card tone="amber">
          <SectionTitle icon="📌">معدلات التشغيل</SectionTitle>
          <div className="space-y-4 py-2">
            {[
              { label: "نسبة الإكمال", value: pct(stats.appointments.completed), tone: "teal" as const, icon: "✅" },
              { label: "نسبة الإلغاء", value: pct(stats.appointments.cancelled), tone: "amber" as const, icon: "✖️" },
              { label: "نسبة عدم الحضور", value: pct(stats.appointments.noShow), tone: "rose" as const, icon: "👻" },
              {
                label: "نسبة التحصيل من الفواتير",
                value: stats.money.invoicedMinor ? Math.round((stats.money.collectedMinor / stats.money.invoicedMinor) * 100) : 0,
                tone: "teal" as const,
                icon: "💵",
              },
              { label: "معدل عودة المرضى", value: retention.total < 5 ? 0 : retention.rate, tone: "teal" as const, icon: "🔁" },
            ].map((m) => (
              <div key={m.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-600">
                    {m.icon} {m.label}
                  </span>
                  <span className="font-extrabold text-slate-800">{m.value}%</span>
                </div>
                <ProgressBar value={m.value} tone={m.tone} />
              </div>
            ))}
          </div>
        </Card>
        <Card tone="sky">
          <SectionTitle icon="🤖">مصدر الحجز وتحويل المساعد</SectionTitle>
          <SourcePie data={sources} />
          <p className="mt-2 rounded-xl bg-indigo-50 p-3 text-center text-sm font-bold text-indigo-700">
            المساعد الذكي أنجز {aiBookings} حجزًا ({Math.round((aiBookings / totalSources) * 100)}% من الحجوزات)
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card tone="teal">
          <SectionTitle icon="🏆">أكثر الإجراءات تنفيذًا</SectionTitle>
          <TreatmentsBar data={treatments.slice(0, 8).map((t) => ({ title: t.title, count: t.count }))} />
        </Card>
        <Card tone="indigo">
          <SectionTitle icon="🧑‍⚕️">أداء الأطباء</SectionTitle>
          <DentistBar data={docs} />
        </Card>
      </div>

      <div>
        <SectionTitle icon="💎">إيراد كل إجراء</SectionTitle>
        {treatments.length === 0 ? (
          <EmptyState icon="🧾" title="لا توجد إجراءات في هذه الفترة" />
        ) : (
          <Table head={["الإجراء", "عدد المرات", "إجمالي الإيراد", "الوزن النسبي"]}>
            {treatments.map((t) => (
              <tr key={t.title}>
                <Td className="font-bold text-slate-800">{t.title}</Td>
                <Td>{t.count}</Td>
                <Td className="font-extrabold text-emerald-700">{formatEGP(t.revenueMinor)}</Td>
                <Td className="w-48">
                  <ProgressBar value={(t.revenueMinor / maxTreat) * 100} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { href: `/api/exports/payments?from=${from}&to=${to}`, label: "تصدير المدفوعات", icon: "💵" },
          { href: `/api/exports/expenses?from=${from}&to=${to}`, label: "تصدير المصروفات", icon: "📉" },
          { href: "/api/exports/invoices", label: "تصدير الفواتير", icon: "🧾" },
        ].map((e) => (
          <a
            key={e.href}
            href={e.href}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:text-teal-700 hover:shadow-md"
          >
            <span className="text-xl">{e.icon}</span>
            {e.label}
            <span className="ms-auto text-xs text-slate-400">CSV ⬇</span>
          </a>
        ))}
      </div>
    </div>
  );
}
