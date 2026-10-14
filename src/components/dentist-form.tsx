"use client";

import { useActionState } from "react";
import { createDentistAction, type SettingsState } from "@/app/(app)/settings/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export function DentistForm() {
  const [state, action, pending] = useActionState(createDentistAction, {} as SettingsState);
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.success ? <Alert kind="success">{state.success}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="اسم الطبيب" required>
          <Input name="fullName" required placeholder="د. أحمد مصطفى" />
        </Field>
        <Field label="التخصص">
          <Input name="specialty" placeholder="تركيبات / جراحة / أطفال" />
        </Field>
        <Field label="رقم الهاتف">
          <Input name="phone" dir="ltr" placeholder="01012345678" />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الحفظ..." : "إضافة طبيب"}
      </Button>
    </form>
  );
}
