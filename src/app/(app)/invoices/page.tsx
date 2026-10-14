import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, patients } from "@/db/schema";
import { requirePermission } from "@/lib/access";
import { formatEGP } from "@/lib/money";
import { fmtDate } from "@/lib/time";
import { Badge, EmptyState, LinkButton, PageHeader, ProgressBar, Stat, Table, Td, statusTone } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_AR: Record<string, string> = { draft: "مسودة", finalized: "نهائية", cancelled: "ملغاة" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requirePermission("finance.read");
  const sp = await searchParams;
  const statusFilter = sp.status ?? "all";

  const paidSql = sql<number>`coalesce((select sum(amount_minor) from payments p where p.invoice_id = ${invoices.id}),0)::bigint`;

  const [summary] = await db
    .select({
      total: sql<number>`count(*)::int`,
      finalized: sql<number>`count(*) filter (where ${invoices.status} = 'finalized')::int`,
      drafts: sql<number>`count(*) filter (where ${invoices.status} = 'draft')::int`,
      invoiced: sql<number>`coalesce(sum(${invoices.totalMinor}) filter (where ${invoices.status} = 'finalized'),0)::bigint`,
      collected: sql<number>`coalesce((select sum(amount_minor) from payments p where p.clinic_id = ${user.clinicId}),0)::bigint`,
    })
    .from(invoices)
    .where(eq(invoices.clinicId, user.clinicId));

  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      issuedAt: invoices.issuedAt,
      totalMinor: invoices.totalMinor,
      discountMinor: invoices.discountMinor,
      status: invoices.status,
      patientName: patients.fullName,
      patientId: patients.id,
      paid: paidSql,
    })
    .from(invoices)
    .innerJoin(patients, eq(patients.id, invoices.patientId))
    .where(
      statusFilter === "all"
        ? eq(invoices.clinicId, user.clinicId)
        : statusFilter === "unpaid"
          ? sql`${invoices.clinicId} = ${user.clinicId} and ${invoices.status} = 'finalized' and ${paidSql} < ${invoices.totalMinor}`
          : sql`${invoices.clinicId} = ${user.clinicId} and ${invoices.status} = ${statusFilter}`,
    )
    .orderBy(desc(invoices.issuedAt))
    .limit(80);

  const outstanding = Number(summary.invoiced) - Number(summary.collected);
  const FILTERS = [
    { key: "all", label: "الكل", icon: "📋" },
    { key: "finalized", label: "نهائية", icon: "✅" },
    { key: "draft", label: "مسودات", icon: "📝" },
    { key: "unpaid", label: "غير مسددة بالكامل", icon: "⏳" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        icon="🧾"
        title="الفواتير"
        subtitle="الفواتير النهائية فقط تدخل في حسابات الإيرادات والمستحقات"
        action={
          <div className="flex gap-2">
            <LinkButton href="/api/exports/invoices" variant="secondary">
              ⬇ CSV
            </LinkButton>
            <LinkButton href="/invoices/new">➕ فاتورة جديدة</LinkButton>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي الفواتير" value={summary.total} icon="📋" tone="sky" hint={`${summary.drafts} مسودة`} />
        <Stat label="قيمة الفواتير النهائية" value={formatEGP(Number(summary.invoiced))} icon="🧾" tone="indigo" />
        <Stat label="إجمالي التحصيل" value={formatEGP(Number(summary.collected))} icon="💵" tone="good" />
        <Stat label="المتبقي غير المحصل" value={formatEGP(Math.max(0, outstanding))} icon="⏳" tone="warn" />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/invoices${f.key === "all" ? "" : `?status=${f.key}`}`}
            className={`rounded-xl px-3.5 py-2 text-sm font-bold transition ${
              statusFilter === f.key
                ? "bg-gradient-to-l from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/25"
                : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700"
            }`}
          >
            {f.icon} {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="🧾" title="لا توجد فواتير مطابقة" action={<LinkButton href="/invoices/new">إنشاء فاتورة</LinkButton>} />
      ) : (
        <Table head={["رقم الفاتورة", "المريض", "التاريخ", "الإجمالي", "المحصّل", "نسبة السداد", "الحالة"]}>
          {rows.map((inv) => {
            const paid = Number(inv.paid);
            const pct = inv.totalMinor ? Math.min(100, Math.round((paid / inv.totalMinor) * 100)) : 0;
            const remaining = inv.status === "finalized" ? inv.totalMinor - paid : 0;
            return (
              <tr key={inv.id}>
                <Td>
                  <Link className="font-mono font-bold text-teal-700 hover:underline" href={`/invoices/${inv.id}`}>
                    {inv.number}
                  </Link>
                  {inv.discountMinor > 0 ? <Badge tone="amber">خصم</Badge> : null}
                </Td>
                <Td>
                  <Link className="font-semibold hover:underline" href={`/patients/${inv.patientId}`}>
                    {inv.patientName}
                  </Link>
                </Td>
                <Td className="text-xs text-slate-500">{fmtDate(inv.issuedAt)}</Td>
                <Td className="font-extrabold text-slate-800">{formatEGP(inv.totalMinor)}</Td>
                <Td className="font-bold text-emerald-700">{formatEGP(paid)}</Td>
                <Td className="w-40">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={pct} tone={pct >= 100 ? "teal" : pct > 0 ? "amber" : "rose"} />
                    <span className="w-10 shrink-0 text-xs font-bold text-slate-500">{pct}%</span>
                  </div>
                  {remaining > 0 ? <span className="text-[11px] font-bold text-rose-600">متبقي {formatEGP(remaining)}</span> : null}
                </Td>
                <Td>
                  <Badge tone={statusTone[inv.status] ?? "slate"} dot>
                    {STATUS_AR[inv.status]}
                  </Badge>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
