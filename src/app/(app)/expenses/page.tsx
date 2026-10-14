import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { requirePermission } from "@/lib/access";
import { formatEGP, sumMinor } from "@/lib/money";
import { addDaysStr, cairoDayString, cairoRangeBounds, fmtDate } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, SectionTitle, Stat, Table, Td } from "@/components/ui";
import { ExpenseForm } from "@/components/finance-forms";
import { DateRangeForm } from "@/components/date-range-form";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requirePermission("finance.read");
  const sp = await searchParams;
  const today = cairoDayString();
  const from = sp.from ?? addDaysStr(today, -29);
  const to = sp.to ?? today;
  const { start, end } = cairoRangeBounds(from, to);

  const rows = await db
    .select({
      id: expenses.id,
      category: expenses.category,
      description: expenses.description,
      amountMinor: expenses.amountMinor,
      spentAt: expenses.spentAt,
    })
    .from(expenses)
    .where(and(eq(expenses.clinicId, user.clinicId), gte(expenses.spentAt, start), lt(expenses.spentAt, end)))
    .orderBy(desc(expenses.spentAt));

  const total = sumMinor(rows.map((r) => r.amountMinor));
  const catMap = new Map<string, number>();
  for (const r of rows) catMap.set(r.category, (catMap.get(r.category) ?? 0) + r.amountMinor);
  const byCategory = [...catMap.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const maxCat = Math.max(1, ...byCategory.map((c) => c.amount));

  return (
    <div className="space-y-1">
      <PageHeader
        icon="📉"
        title="المصروفات"
        subtitle={`الفترة ${from} → ${to}`}
        action={<DateRangeForm from={from} to={to} basePath="/expenses" />}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="إجمالي المصروفات" value={formatEGP(total)} icon="📉" tone="bad" />
        <Stat label="عدد العمليات" value={rows.length} icon="🧮" tone="sky" />
        <Stat label="متوسط المصروف" value={formatEGP(rows.length ? Math.round(total / rows.length) : 0)} icon="📊" tone="indigo" />
        <Stat label="أكبر بند" value={byCategory[0]?.category ?? "—"} icon="🏷️" tone="amber" hint={byCategory[0] ? formatEGP(byCategory[0].amount) : undefined} />
      </div>

      <Card className="my-5" tone="rose">
        <SectionTitle icon="➕">تسجيل مصروف جديد</SectionTitle>
        <ExpenseForm />
      </Card>

      {byCategory.length > 0 ? (
        <Card tone="amber" className="mb-5">
          <SectionTitle icon="🏷️">توزيع المصروفات حسب البند</SectionTitle>
          <ul className="space-y-3">
            {byCategory.map((c) => (
              <li key={c.category}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold text-slate-600">{c.category}</span>
                  <span className="font-extrabold text-slate-800">{formatEGP(c.amount)}</span>
                </div>
                <ProgressBar value={(c.amount / maxCat) * 100} tone="amber" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon="📉" title="لا توجد مصروفات في هذه الفترة" />
      ) : (
        <Table head={["التاريخ", "البند", "الوصف", "المبلغ"]}>
          {rows.map((e) => (
            <tr key={e.id}>
              <Td>{fmtDate(e.spentAt)}</Td>
              <Td><Badge tone="amber">{e.category}</Badge></Td>
              <Td>{e.description ?? "—"}</Td>
              <Td className="font-extrabold text-rose-600">{formatEGP(e.amountMinor)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
