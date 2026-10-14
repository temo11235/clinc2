"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPatientAction, updatePatientAction, type PatientState } from "@/app/(app)/patients/actions";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";

export type PatientDefaults = {
  id?: number;
  fullName?: string;
  phone?: string;
  email?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  medicalHistory?: string | null;
  allergies?: string | null;
  medications?: string | null;
  conditions?: string | null;
  notes?: string | null;
  preferredChannel?: string;
};

export function PatientForm({ defaults, mode }: { defaults?: PatientDefaults; mode: "create" | "edit" }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    mode === "create" ? createPatientAction : updatePatientAction,
    {} as PatientState,
  );

  useEffect(() => {
    if (state.success && state.patientId) router.push(`/patients/${state.patientId}`);
    else if (state.success) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.success ? <Alert kind="success">{state.success}</Alert> : null}
      {defaults?.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <Card>
        <h2 className="mb-4 font-bold text-slate-800">البيانات الأساسية</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="الاسم الكامل" required>
            <Input name="fullName" required defaultValue={defaults?.fullName ?? ""} />
          </Field>
          <Field label="رقم الهاتف" hint="مثال: 01012345678" required>
            <Input name="phone" required defaultValue={defaults?.phone ?? ""} dir="ltr" />
          </Field>
          <Field label="البريد الإلكتروني">
            <Input name="email" type="email" defaultValue={defaults?.email ?? ""} dir="ltr" />
          </Field>
          <Field label="تاريخ الميلاد">
            <Input name="birthDate" type="date" defaultValue={defaults?.birthDate ?? ""} />
          </Field>
          <Field label="النوع">
            <Select name="gender" defaultValue={defaults?.gender ?? ""}>
              <option value="">غير محدد</option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </Select>
          </Field>
          <Field label="وسيلة التواصل المفضلة">
            <Select name="preferredChannel" defaultValue={defaults?.preferredChannel ?? "whatsapp"}>
              <option value="whatsapp">واتساب</option>
              <option value="sms">رسالة نصية</option>
              <option value="email">بريد إلكتروني</option>
              <option value="inapp">داخل النظام فقط</option>
            </Select>
          </Field>
          <Field label="العنوان">
            <Input name="address" defaultValue={defaults?.address ?? ""} />
          </Field>
          <Field label="جهة اتصال للطوارئ">
            <Input name="emergencyContact" defaultValue={defaults?.emergencyContact ?? ""} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold text-slate-800">البيانات الطبية</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="التاريخ المرضي">
            <Textarea name="medicalHistory" defaultValue={defaults?.medicalHistory ?? ""} />
          </Field>
          <Field label="الحساسية">
            <Textarea name="allergies" defaultValue={defaults?.allergies ?? ""} />
          </Field>
          <Field label="الأدوية الحالية">
            <Textarea name="medications" defaultValue={defaults?.medications ?? ""} />
          </Field>
          <Field label="أمراض مزمنة / حالات">
            <Textarea name="conditions" defaultValue={defaults?.conditions ?? ""} />
          </Field>
          <Field label="ملاحظات">
            <Textarea name="notes" defaultValue={defaults?.notes ?? ""} />
          </Field>
        </div>
        {mode === "create" ? (
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="consent" defaultChecked className="h-4 w-4" />
            المريض وافق على العلاج وتلقي رسائل التذكير
          </label>
        ) : null}
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الحفظ..." : mode === "create" ? "حفظ المريض" : "تحديث البيانات"}
      </Button>
    </form>
  );
}
