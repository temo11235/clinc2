import Link from "next/link";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { patients, payments, refunds } from "@/db/schema";
import { requirePermission } from "@/lib/access";
import { formatEGP, sumMinor } from "@/lib/money";
import { addDaysStr, cairoDayBounds, cairoDayString, fmtDateTime, fmtTime, WEEKDAY_NAMES_AR } from "@/lib/time";
import { Badge, Card, EmptyState, LinkButton, PageHeader, ProgressBar, SectionTitle, Stat, Table, Td } from "@/components/ui";
import { RefundForm } from "@/components/finance-forms";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requirePermission("finance.read");
  const sp = await searchParams;
  const day = sp.date ?? cairoDayString();
  const weekday = WEEKDAY_NAMES_AR[new Date(`${day}T12:00:00Z`).getUTCDay()];
  const { start, end } = cairoDayBounds(day);

  const rows = await db
    .select({
      id: payments.id,
      amountMinor: payments.amountMinor,
      method: payments.method,
      paidAt: payments.paidAt,
      reference: payments.reference,
      invoiceId: payments.invoiceId,
      patientId: patients.id,
      patientName: patients.fullName,
      refunded: sql<number>`coalesce((select sum(amount_minor) from refunds r where r.payment_id = ${payments.id}),0)::bigint`,
    })
    .from(payments)
    .innerJoin(patients, eq(patients.id, payments.patientId))
    .where(and(eq(payments.clinicId, user.clinicId), gte(payments.paidAt, start), lt(payments.paidAt, end)))
    .orderBy(desc(payments.paidAt));

  const refundRows = await db
    .select()
    .from(refunds)
    .where(and(eq(refunds.clinicId, user.clinicId), gte(refunds.refundedAt, start), lt(refunds.refundedAt, end)));

  const cash = sumMinor(rows.filter((r) => r.method === "cash").map((r) => r.amountMinor));
  const card = sumMinor(rows.filter((r) => r.method === "card").map((r) => r.amountMinor));
  const transfer = sumMinor(rows.filter((r) => r.method === "transfer").map((r) => r.amountMinor));
  const refundTotal = sumMinor(refundRows.map((r) => r.amountMinor));
  const gross = cash + card + transfer;
  const net = gross - refundTotal;
  const share = (v: number) => (gross ? Math.round((v / gross) * 100) : 0);

  return (
    <div className="space-y-5">
      <PageHeader
        icon="💵"
        title="المدفوعات وملخص الخزينة"
        subtitle={`${weekday} ${day} · ${rows.length} عملية تحصيل`}
        action={
          <form action="/payments" method="get" className="flex gap-2">
            <input
              type="date"
              name="date"
              defaultValue={day}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
            />
            <button className="rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md">
              عرض
            </button>
          </form>
        }
      />

      <div className="flex flex-wrap gap-2">
        {[
          { label: "أمس", d: addDaysStr(day, -1) },
          { label: "اليوم", d: cairoDayString() },
          { label: "غدًا", d: addDaysStr(day, 1) },
        ].map((n) => (
          <Link
            key={n.label}
            href={`/payments?date=${n.d}`}
            className={`rounded-xl px-3.5 py-2 text-sm font-bold transition ${
              day === n.d ? "bg-gradient-to-l from-teal-600 to-emerald-600 text-white shadow-md" : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300"
            }`}
          >
            {n.label}
          </Link>
        ))}
        <LinkButton href={`/api/exports/payments?from=${day}&to=${day}`} variant="secondary" className="ms-auto">
          ⬇ تصدير اليوم
        </LinkButton>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="نقدًا 💵" value={formatEGP(cash)} icon="💵" tone="good" hint={`${share(cash)}% من التحصيل`} />
        <Stat label="بطاقة 💳" value={formatEGP(card)} icon="💳" tone="sky" hint={`${share(card)}%`} />
        <Stat label="تحويل بنكي 🏦" value={formatEGP(transfer)} icon="🏦" tone="indigo" hint={`${share(transfer)}%`} />
        <Stat label="مرتجعات" value={formatEGP(refundTotal)} icon="↩️" tone="bad" />
        <Stat label="صافي الخزينة" value={formatEGP(net)} icon="🧮" tone="teal" />
      </div>

      <Card tone="teal">
        <SectionTitle icon="📊">توزيع وسائل الدفع</SectionTitle>
        <div className="space-y-3">
          {[
            { label: "نقدًا", value: cash, tone: "teal" as const },
            { label: "بطاقة", value: card, tone: "amber" as const },
            { label: "تحويل بنكي", value: transfer, tone: "rose" as const },
          ].map((m) => (
            <div key={m.label}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-semibold text-slate-600">{m.label}</span>
                <span className="font-bold text-slate-800">
                  {formatEGP(m.value)} · {share(m.value)}%
                </span>
              </div>
              <ProgressBar value={share(m.value)} tone={m.tone} />
            </div>
          ))}
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon="💤" title="لا توجد مدفوعات في هذا اليوم" hint="اختر تاريخًا آخر أو سجّل دفعة من صفحة الفاتورة." action={<LinkButton href="/invoices">عرض الفواتير</LinkButton>} />
      ) : (
        <Table head={["الوقت", "المريض", "المبلغ", "الوسيلة", "الفاتورة", "مرتجع", "إجراء"]}>
          {rows.map((p) => (
            <tr key={p.id}>
              <Td className="font-bold text-slate-700">{fmtTime(p.paidAt)}</Td>
              <Td>
                <Link className="font-semibold text-teal-700 hover:underline" href={`/patients/${p.patientId}`}>
                  {p.patientName}
                </Link>
              </Td>
              <Td className="font-extrabold text-emerald-700">{formatEGP(p.amountMinor)}</Td>
              <Td>
                <Badge tone={p.method === "cash" ? "green" : p.method === "card" ? "blue" : "indigo"}>
                  {p.method === "cash" ? "💵 نقدًا" : p.method === "card" ? "💳 بطاقة" : "🏦 تحويل"}
                </Badge>
              </Td>
              <Td>
                {p.invoiceId ? (
                  <Link className="text-xs font-bold text-teal-700 hover:underline" href={`/invoices/${p.invoiceId}`}>
                    عرض ←
                  </Link>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </Td>
              <Td>
                {Number(p.refunded) > 0 ? (
                  <Badge tone="red">{formatEGP(Number(p.refunded))}</Badge>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </Td>
              <Td>
                <RefundForm paymentId={p.id} />
              </Td>
            </tr>
          ))}
        </Table>
      )}

      {refundRows.length > 0 ? (
        <Card tone="rose">
          <SectionTitle icon="↩️">مرتجعات اليوم</SectionTitle>
          <Table head={["الوقت", "المبلغ", "السبب"]}>
            {refundRows.map((r) => (
              <tr key={r.id}>
                <Td className="text-xs">{fmtDateTime(r.refundedAt)}</Td>
                <Td className="font-bold text-rose-600">{formatEGP(r.amountMinor)}</Td>
                <Td className="text-sm text-slate-600">{r.reason ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <div className="rounded-2xl bg-gradient-to-l from-teal-600 to-emerald-600 p-6 text-center text-white shadow-xl shadow-teal-600/25">
        <p className="text-sm font-semibold opacity-90">صافي تحصيل اليوم</p>
        <p className="mt-1 text-4xl font-extrabold">{formatEGP(net)}</p>
        <p className="mt-1 text-xs opacity-80">
          إجمالي {formatEGP(gross)} − مرتجعات {formatEGP(refundTotal)}
        </p>
      </div>
    </div>
  );
}
