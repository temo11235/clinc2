import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { expenses, invoices, patients, payments } from "@/db/schema";
import { requireClinic } from "@/lib/access";
import { fromMinor } from "@/lib/money";
import { addDaysStr, cairoDayString, cairoRangeBounds, fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return "\uFEFFno_data\n";
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return (
    "\uFEFF" +
    [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h] ?? "")).join(","))].join("\n") +
    "\n"
  );
}

export async function GET(request: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { clinicId } = await requireClinic();

  const { kind } = await ctx.params;
  const url = new URL(request.url);
  const today = cairoDayString();
  const from = url.searchParams.get("from") ?? addDaysStr(today, -29);
  const to = url.searchParams.get("to") ?? today;
  const { start, end } = cairoRangeBounds(from, to);

  let rows: Array<Record<string, string | number>> = [];

  if (kind === "invoices") {
    const data = await db
      .select({ number: invoices.number, total: invoices.totalMinor, status: invoices.status, issuedAt: invoices.issuedAt, patient: patients.fullName })
      .from(invoices)
      .innerJoin(patients, eq(patients.id, invoices.patientId))
      .where(eq(invoices.clinicId, clinicId))
      .orderBy(desc(invoices.issuedAt));
    rows = data.map((d) => ({
      رقم_الفاتورة: d.number,
      المريض: d.patient,
      التاريخ: fmtDateTime(d.issuedAt),
      الإجمالي_جنيه: fromMinor(d.total),
      الحالة: d.status,
    }));
  } else if (kind === "payments") {
    const data = await db
      .select({ amount: payments.amountMinor, method: payments.method, paidAt: payments.paidAt, patient: patients.fullName })
      .from(payments)
      .innerJoin(patients, eq(patients.id, payments.patientId))
      .where(and(eq(payments.clinicId, clinicId), gte(payments.paidAt, start), lt(payments.paidAt, end)))
      .orderBy(desc(payments.paidAt));
    rows = data.map((d) => ({
      التاريخ: fmtDateTime(d.paidAt),
      المريض: d.patient,
      المبلغ_جنيه: fromMinor(d.amount),
      الوسيلة: d.method,
    }));
  } else if (kind === "expenses") {
    const data = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.clinicId, clinicId), gte(expenses.spentAt, start), lt(expenses.spentAt, end)))
      .orderBy(desc(expenses.spentAt));
    rows = data.map((d) => ({
      التاريخ: fmtDateTime(d.spentAt),
      البند: d.category,
      الوصف: d.description ?? "",
      المبلغ_جنيه: fromMinor(d.amountMinor),
    }));
  } else if (kind === "report") {
    const { dashboardStats } = await import("@/lib/analytics");
    const s = await dashboardStats(clinicId, from, to);
    rows = [
      {
        من: from,
        إلى: to,
        التحصيل_جنيه: fromMinor(s.money.collectedMinor),
        الفواتير_جنيه: fromMinor(s.money.invoicedMinor),
        المصروفات_جنيه: fromMinor(s.money.expensesMinor),
        المستحقات_جنيه: fromMinor(s.money.outstandingMinor),
        مواعيد: s.appointments.total,
        مكتملة: s.appointments.completed,
        ملغاة: s.appointments.cancelled,
        لم_يحضر: s.appointments.noShow,
        مرضى_جدد: s.patients.new,
      },
    ];
  } else {
    return new Response("Not found", { status: 404 });
  }

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${from}-${to}.csv"`,
    },
  });
}
