import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { patients } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { formatEGP } from "@/lib/money";
import { displayPhone, fmtDate } from "@/lib/time";
import { Badge, Button, EmptyState, Input, LinkButton, PageHeader, Stat, Table, Td } from "@/components/ui";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 15;

const AVATAR_COLORS = [
  "from-teal-400 to-emerald-500",
  "from-indigo-400 to-violet-500",
  "from-amber-400 to-orange-500",
  "from-sky-400 to-cyan-500",
  "from-rose-400 to-pink-500",
  "from-lime-400 to-green-500",
];

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; filter?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const filter = sp.filter ?? "all";
  const page = Math.max(1, Number(sp.page ?? 1));

  const balanceSql = sql<number>`(
    coalesce((select sum(total_minor) from invoices i where i.patient_id = ${patients.id} and i.status = 'finalized'),0)
    - coalesce((select sum(amount_minor) from payments p where p.patient_id = ${patients.id}),0)
  )::bigint`;

  const conditions = [eq(patients.clinicId, user.clinicId)];
  if (q) {
    conditions.push(
      or(
        ilike(patients.fullName, `%${q}%`),
        ilike(patients.phone, `%${q}%`),
        ilike(patients.code, `%${q}%`),
      )!,
    );
  }
  if (filter === "debt") conditions.push(sql`${balanceSql} > 0`);
  if (filter === "alerts") conditions.push(sql`(${patients.allergies} is not null or ${patients.conditions} is not null)`);
  const where = and(...conditions);

  const [{ value: total }] = await db.select({ value: count() }).from(patients).where(where);
  const [summary] = await db
    .select({
      all: count(),
      withDebt: sql<number>`count(*) filter (where ${balanceSql} > 0)::int`,
      debtTotal: sql<number>`coalesce(sum(greatest(${balanceSql}, 0)),0)::bigint`,
      alerts: sql<number>`count(*) filter (where ${patients.allergies} is not null or ${patients.conditions} is not null)::int`,
    })
    .from(patients)
    .where(eq(patients.clinicId, user.clinicId));

  const rows = await db
    .select({
      id: patients.id,
      code: patients.code,
      fullName: patients.fullName,
      phone: patients.phone,
      gender: patients.gender,
      lastVisitAt: patients.lastVisitAt,
      createdAt: patients.createdAt,
      allergies: patients.allergies,
      conditions: patients.conditions,
      visits: sql<number>`(select count(*) from appointments a where a.patient_id = ${patients.id} and a.status = 'completed')::int`,
      balance: balanceSql,
    })
    .from(patients)
    .where(where)
    .orderBy(desc(patients.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) =>
    `/patients?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}${filter !== "all" ? `&filter=${filter}` : ""}`;

  const FILTERS = [
    { key: "all", label: "كل المرضى", icon: "👥" },
    { key: "debt", label: "عليهم مستحقات", icon: "⏳" },
    { key: "alerts", label: "تنبيهات طبية", icon: "⚠️" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        icon="👥"
        title="ملفات المرضى"
        subtitle={`${summary.all} مريض مسجل · ${summary.withDebt} عليهم مستحقات`}
        action={<LinkButton href="/patients/new">➕ مريض جديد</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي المرضى" value={summary.all} icon="👥" tone="teal" />
        <Stat label="لديهم رصيد مستحق" value={summary.withDebt} icon="⏳" tone="warn" />
        <Stat label="إجمالي المستحقات" value={formatEGP(Number(summary.debtTotal))} icon="💰" tone="bad" />
        <Stat label="تنبيهات طبية" value={summary.alerts} icon="⚠️" tone="indigo" hint="حساسية أو حالات مزمنة" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/patients${f.key === "all" ? "" : `?filter=${f.key}`}`}
            className={`rounded-xl px-3.5 py-2 text-sm font-bold transition ${
              filter === f.key
                ? "bg-gradient-to-l from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/25"
                : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700"
            }`}
          >
            {f.icon} {f.label}
          </Link>
        ))}
        <form className="ms-auto flex gap-2" action="/patients" method="get">
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <Input name="q" defaultValue={q} placeholder="🔎 ابحث بالاسم أو الهاتف أو الكود" className="w-72" />
          <Button type="submit" variant="secondary">
            بحث
          </Button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={q ? "لا توجد نتائج مطابقة" : "لا يوجد مرضى بعد"}
          hint={q ? "جرّب كلمة بحث أخرى أو امسح الفلتر." : "أضف أول مريض للبدء في الحجز وتسجيل العلاجات."}
          action={<LinkButton href="/patients/new">إضافة مريض</LinkButton>}
        />
      ) : (
        <>
          <Table head={["المريض", "الهاتف", "الزيارات", "آخر زيارة", "الرصيد المستحق", "تنبيهات", ""]}>
            {rows.map((p, idx) => (
              <tr key={p.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${
                        AVATAR_COLORS[idx % AVATAR_COLORS.length]
                      } text-sm font-extrabold text-white shadow-sm`}
                    >
                      {p.fullName.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <Link className="block truncate font-bold text-slate-800 hover:text-teal-700 hover:underline" href={`/patients/${p.id}`}>
                        {p.fullName}
                      </Link>
                      <span className="font-mono text-[11px] text-slate-400">{p.code}</span>
                    </div>
                  </div>
                </Td>
                <Td className="font-mono text-xs text-slate-600">{displayPhone(p.phone)}</Td>
                <Td>
                  <Badge tone={p.visits > 2 ? "green" : "slate"}>{p.visits} زيارة</Badge>
                </Td>
                <Td className="text-xs text-slate-500">{p.lastVisitAt ? fmtDate(p.lastVisitAt) : "—"}</Td>
                <Td>
                  {Number(p.balance) > 0 ? (
                    <span className="font-extrabold text-rose-600">{formatEGP(Number(p.balance))}</span>
                  ) : (
                    <span className="font-bold text-emerald-600">مسدد ✓</span>
                  )}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {p.allergies ? <Badge tone="red">⚠ حساسية</Badge> : null}
                    {p.conditions ? <Badge tone="amber">🩺 حالة</Badge> : null}
                    {!p.allergies && !p.conditions ? <span className="text-xs text-slate-300">—</span> : null}
                  </div>
                </Td>
                <Td>
                  <div className="flex gap-1">
                    <Link className="rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-bold text-teal-700 hover:bg-teal-100" href={`/patients/${p.id}`}>
                      الملف
                    </Link>
                    <Link
                      className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                      href={`/appointments/new?patientId=${p.id}`}
                    >
                      حجز
                    </Link>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>

          {pages > 1 ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5 text-sm">
              {page > 1 ? (
                <Link href={link(page - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-600">
                  السابق
                </Link>
              ) : null}
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2)
                .map((n, i, arr) => (
                  <span key={n} className="flex items-center gap-1.5">
                    {i > 0 && n - arr[i - 1] > 1 ? <span className="text-slate-400">…</span> : null}
                    <Link
                      href={link(n)}
                      className={`rounded-lg px-3 py-1.5 font-bold ${
                        n === page ? "bg-gradient-to-l from-teal-600 to-emerald-600 text-white shadow" : "bg-white text-slate-600 border border-slate-200"
                      }`}
                    >
                      {n}
                    </Link>
                  </span>
                ))}
              {page < pages ? (
                <Link href={link(page + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-600">
                  التالي
                </Link>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
