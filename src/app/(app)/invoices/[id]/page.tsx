import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoiceItems, invoices, patients, payments } from "@/db/schema";
import { requirePermission, can } from "@/lib/access";
import { formatEGP, sumMinor } from "@/lib/money";
import { fmtDate, fmtDateTime, displayPhone } from "@/lib/time";
import { getClinic } from "@/lib/settings";
import { Badge, Button, Card, PageHeader, Table, Td, statusTone } from "@/components/ui";
import { PaymentForm } from "@/components/finance-forms";
import { PrintButton } from "@/components/print-button";
import { cancelInvoiceAction, finalizeInvoiceAction } from "../../finance-actions";

export const dynamic = "force-dynamic";
const STATUS_AR: Record<string, string> = { draft: "مسودة", finalized: "نهائية", cancelled: "ملغاة" };

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("finance.read");
  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isFinite(invoiceId)) notFound();

  const [row] = await db
    .select({ inv: invoices, patient: patients })
    .from(invoices)
    .innerJoin(patients, eq(patients.id, invoices.patientId))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.clinicId, user.clinicId)))
    .limit(1);
  if (!row) notFound();

  const [items, paymentRows, clinic] = await Promise.all([
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)),
    db.select().from(payments).where(eq(payments.invoiceId, invoiceId)),
    getClinic(user.clinicId),
  ]);

  const paid = sumMinor(paymentRows.map((p) => p.amountMinor));
  const remaining = row.inv.totalMinor - paid;
  const writable = true;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`فاتورة ${row.inv.number}`}
        subtitle={`${row.patient.fullName} · ${fmtDate(row.inv.issuedAt)}`}
        action={<Badge tone={statusTone[row.inv.status] ?? "slate"}>{STATUS_AR[row.inv.status]}</Badge>}
      />
      <PrintButton label="🖨 طباعة الفاتورة" />

      <Card>
        <div className="mb-4 flex justify-between border-b border-slate-100 pb-3 text-sm">
          <div>
            <p className="text-lg font-bold">{clinic?.name}</p>
            <p className="text-slate-500">{clinic?.address}</p>
            <p className="text-slate-500">{clinic?.phone}</p>
          </div>
          <div className="text-left">
            <p className="font-semibold">{row.patient.fullName}</p>
            <p className="font-mono text-slate-500">{displayPhone(row.patient.phone)}</p>
            <p className="text-slate-500">كود: {row.patient.code}</p>
          </div>
        </div>

        <Table head={["البند", "الكمية", "سعر الوحدة", "الإجمالي"]}>
          {items.map((i) => (
            <tr key={i.id}>
              <Td>{i.description}</Td>
              <Td>{i.quantity}</Td>
              <Td>{formatEGP(i.unitPriceMinor)}</Td>
              <Td>{formatEGP(i.totalMinor)}</Td>
            </tr>
          ))}
        </Table>

        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between"><dt>الإجمالي قبل الخصم</dt><dd>{formatEGP(row.inv.subtotalMinor)}</dd></div>
          <div className="flex justify-between"><dt>الخصم</dt><dd>- {formatEGP(row.inv.discountMinor)}</dd></div>
          <div className="flex justify-between text-base font-bold"><dt>الإجمالي المستحق</dt><dd>{formatEGP(row.inv.totalMinor)}</dd></div>
          <div className="flex justify-between text-emerald-700"><dt>المحصّل</dt><dd>{formatEGP(paid)}</dd></div>
          <div className="flex justify-between font-semibold text-rose-600"><dt>المتبقي</dt><dd>{formatEGP(remaining)}</dd></div>
        </dl>

        <p className="mt-4 text-xs text-slate-400">
          هذه فاتورة داخلية للعيادة. للامتثال لمتطلبات الفاتورة الإلكترونية في مصر يلزم التكامل مع منظومة مصلحة
          الضرائب المصرية ومراجعة قانونية — غير مُفعّل في هذا الإصدار.
        </p>
      </Card>

      {writable ? (
        <div className="no-print mt-4 flex flex-wrap gap-2">
          {row.inv.status === "draft" ? (
            <>
              <form action={finalizeInvoiceAction}>
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <Button type="submit">اعتماد الفاتورة نهائيًا</Button>
              </form>
              {true ? (
                <form action={cancelInvoiceAction}>
                  <input type="hidden" name="invoiceId" value={invoiceId} />
                  <Button type="submit" variant="danger">
                    إلغاء المسودة
                  </Button>
                </form>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-500">الفواتير النهائية لا يمكن تعديلها — سجّل مرتجعًا عند الحاجة.</p>
          )}
        </div>
      ) : null}

      {writable && row.inv.status === "finalized" && remaining > 0 ? (
        <Card className="no-print mt-4">
          <h2 className="mb-3 font-bold text-slate-800">تحصيل دفعة</h2>
          <PaymentForm patientId={row.patient.id} invoiceId={invoiceId} maxAmount={remaining} />
        </Card>
      ) : null}

      {paymentRows.length > 0 ? (
        <Card className="mt-4">
          <h2 className="mb-3 font-bold text-slate-800">سجل الدفعات</h2>
          <Table head={["التاريخ", "المبلغ", "الوسيلة", "مرجع"]}>
            {paymentRows.map((p) => (
              <tr key={p.id}>
                <Td>{fmtDateTime(p.paidAt)}</Td>
                <Td>{formatEGP(p.amountMinor)}</Td>
                <Td>{p.method}</Td>
                <Td>{p.reference ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
