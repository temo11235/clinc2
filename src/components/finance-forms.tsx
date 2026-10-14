"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addExpenseAction,
  addPaymentAction,
  addRefundAction,
  createInvoiceAction,
  saveTreatmentAction,
  type FinanceState,
} from "@/app/(app)/finance-actions";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";

export function TreatmentForm() {
  const [state, action, pending] = useActionState(saveTreatmentAction, {} as FinanceState);
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.success ? <Alert kind="success">{state.success}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-5">
        <Field label="اسم العلاج (عربي)" required>
          <Input name="nameAr" required />
        </Field>
        <Field label="الاسم بالإنجليزية">
          <Input name="nameEn" dir="ltr" />
        </Field>
        <Field label="التصنيف">
          <Input name="category" placeholder="حشو / جراحة / تجميل" />
        </Field>
        <Field label="السعر (ج.م)" required>
          <Input name="price" type="number" step="0.01" min="0" required />
        </Field>
        <Field label="المدة (دقيقة)">
          <Input name="durationMinutes" type="number" min={5} step={5} defaultValue={30} />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        إضافة للعلاجات
      </Button>
    </form>
  );
}

type Line = { description: string; quantity: number; unitPrice: string };

export function InvoiceForm({
  patientsList,
  treatments,
  defaultPatientId,
  visitId,
  canDiscount,
}: {
  patientsList: Array<{ id: number; label: string }>;
  treatments: Array<{ id: number; label: string; price: number }>;
  defaultPatientId?: number;
  visitId?: number;
  canDiscount: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createInvoiceAction, {} as FinanceState);
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: 1, unitPrice: "0" }]);

  useEffect(() => {
    if (state.id) router.push(`/invoices/${state.id}`);
  }, [state, router]);

  const subtotal = lines.reduce((acc, l) => acc + Number(l.unitPrice || 0) * (l.quantity || 1), 0);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="المريض" required>
            <Select name="patientId" defaultValue={defaultPatientId ? String(defaultPatientId) : ""} required>
              <option value="">— اختر —</option>
              {patientsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          {visitId ? <input type="hidden" name="visitId" value={visitId} /> : null}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-bold text-slate-800">بنود الفاتورة</h2>
        <div className="space-y-3">
          {lines.map((line, idx) => (
            <div key={idx} className="grid gap-3 md:grid-cols-[2fr_100px_140px_60px]">
              <Input
                name="description"
                placeholder="وصف البند"
                value={line.description}
                list="treatments-price-list"
                onChange={(e) => {
                  const v = e.target.value;
                  const match = treatments.find((t) => t.label === v);
                  setLines((ls) =>
                    ls.map((l, i) =>
                      i === idx ? { ...l, description: v, unitPrice: match ? String(match.price / 100) : l.unitPrice } : l,
                    ),
                  );
                }}
              />
              <Input
                name="quantity"
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, quantity: Number(e.target.value) } : l)))}
              />
              <Input
                name="unitPrice"
                type="number"
                step="0.01"
                min="0"
                value={line.unitPrice}
                onChange={(e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, unitPrice: e.target.value } : l)))}
              />
              <Button type="button" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}>
                ✕
              </Button>
            </div>
          ))}
        </div>
        <datalist id="treatments-price-list">
          {treatments.map((t) => (
            <option key={t.id} value={t.label} />
          ))}
        </datalist>
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={() => setLines((ls) => [...ls, { description: "", quantity: 1, unitPrice: "0" }])}
        >
          + بند جديد
        </Button>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="الخصم (ج.م)" hint={canDiscount ? "يُسجَّل باعتمادك" : "الخصم يحتاج صلاحية المالك/المحاسب"}>
            <Input name="discount" type="number" step="0.01" min="0" defaultValue="0" disabled={!canDiscount} />
          </Field>
          <div className="self-end text-lg font-bold text-slate-800">
            الإجمالي المبدئي: {subtotal.toLocaleString("ar-EG")} ج.م
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الإنشاء..." : "إنشاء الفاتورة (مسودة)"}
      </Button>
    </form>
  );
}

export function PaymentForm({
  patientId,
  invoiceId,
  maxAmount,
}: {
  patientId: number;
  invoiceId?: number;
  maxAmount?: number;
}) {
  const [state, action, pending] = useActionState(addPaymentAction, {} as FinanceState);
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.success ? <Alert kind="success">{state.success}</Alert> : null}
      <input type="hidden" name="patientId" value={patientId} />
      {invoiceId ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="المبلغ (ج.م)" hint={maxAmount ? `المتبقي: ${(maxAmount / 100).toLocaleString("ar-EG")}` : undefined} required>
          <Input name="amount" type="number" step="0.01" min="0.01" required />
        </Field>
        <Field label="وسيلة الدفع">
          <Select name="method" defaultValue="cash">
            <option value="cash">نقدًا</option>
            <option value="card">بطاقة</option>
            <option value="transfer">تحويل بنكي</option>
          </Select>
        </Field>
        <Field label="مرجع / رقم العملية">
          <Input name="reference" />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        تسجيل الدفعة
      </Button>
    </form>
  );
}

export function RefundForm({ paymentId }: { paymentId: number }) {
  const [state, action, pending] = useActionState(addRefundAction, {} as FinanceState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      <input type="hidden" name="paymentId" value={paymentId} />
      <Input name="amount" type="number" step="0.01" min="0.01" placeholder="مبلغ المرتجع" className="w-40" />
      <Input name="reason" placeholder="السبب" className="w-56" />
      <Button type="submit" variant="danger" disabled={pending}>
        تسجيل مرتجع
      </Button>
    </form>
  );
}

export function ExpenseForm() {
  const [state, action, pending] = useActionState(addExpenseAction, {} as FinanceState);
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.success ? <Alert kind="success">{state.success}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="البند" required>
          <Input name="category" placeholder="خامات / إيجار / رواتب" required />
        </Field>
        <Field label="المبلغ (ج.م)" required>
          <Input name="amount" type="number" step="0.01" min="0.01" required />
        </Field>
        <Field label="التاريخ">
          <Input name="spentAt" type="date" />
        </Field>
        <Field label="وصف">
          <Input name="description" />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        تسجيل المصروف
      </Button>
    </form>
  );
}

export function NotesBox({ value }: { value?: string }) {
  return <Textarea defaultValue={value} readOnly />;
}
