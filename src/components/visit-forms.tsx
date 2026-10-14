"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addProcedureAction, createVisitAction, type VisitState } from "@/app/(app)/visits/actions";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";

export function NewVisitForm({
  patientsList,
  defaultPatientId,
}: {
  patientsList: Array<{ id: number; label: string }>;
  defaultPatientId?: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createVisitAction, {} as VisitState);
  useEffect(() => {
    if (state.visitId) router.push(`/visits/${state.visitId}`);
  }, [state, router]);

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
          <Field label="الشكوى الرئيسية" required>
            <Input name="chiefComplaint" required />
          </Field>
          <Field label="الفحص الإكلينيكي">
            <Textarea name="examination" />
          </Field>
          <Field label="التشخيص">
            <Textarea name="diagnosis" />
          </Field>
          <Field label="خطة العلاج">
            <Textarea name="treatmentPlan" />
          </Field>
          <Field label="توصيات المتابعة">
            <Textarea name="followUp" />
          </Field>
          <Field label="الروشتة / الأدوية الموصوفة" hint="يُوثّق بمعرفة الطبيب المعالج فقط">
            <Textarea name="prescription" />
          </Field>
        </div>
      </Card>
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الحفظ..." : "حفظ الزيارة"}
      </Button>
    </form>
  );
}

export function AddProcedureForm({
  visitId,
  treatments,
}: {
  visitId: number;
  treatments: Array<{ id: number; label: string; priceMinor: number }>;
}) {
  const [state, action, pending] = useActionState(addProcedureAction, {} as VisitState);
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.success ? <Alert kind="success">{state.success}</Alert> : null}
      <input type="hidden" name="visitId" value={visitId} />
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="الإجراء" required>
          <Input name="title" required list="treatments-list" />
        </Field>
        <datalist id="treatments-list">
          {treatments.map((t) => (
            <option key={t.id} value={t.label} />
          ))}
        </datalist>
        <Field label="رقم السن (FDI)">
          <Input name="toothNumber" type="number" min={11} max={48} />
        </Field>
        <Field label="الأسطح">
          <Input name="surfaces" placeholder="M, O, D" />
        </Field>
        <Field label="الحالة">
          <Select name="status" defaultValue="completed">
            <option value="planned">مخطط</option>
            <option value="in_progress">جارٍ</option>
            <option value="completed">مكتمل</option>
          </Select>
        </Field>
        <Field label="الخامات المستخدمة">
          <Input name="materials" />
        </Field>
        <Field label="السعر (ج.م)">
          <Input name="price" type="number" step="0.01" min="0" defaultValue="0" />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Textarea name="notes" />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        إضافة الإجراء
      </Button>
    </form>
  );
}
