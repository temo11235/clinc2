"use client";

import { useActionState } from "react";
import { rescheduleAction, type ApptState } from "@/app/(app)/appointments/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export function RescheduleForm({
  appointmentId,
  defaultDate,
  defaultTime,
  defaultDuration,
}: {
  appointmentId: number;
  defaultDate: string;
  defaultTime: string;
  defaultDuration: number;
}) {
  const [state, action, pending] = useActionState(rescheduleAction, {} as ApptState);
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.success ? <Alert kind="success">{state.success}</Alert> : null}
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="التاريخ">
          <Input type="date" name="date" defaultValue={defaultDate} required />
        </Field>
        <Field label="الوقت">
          <Input type="time" name="time" defaultValue={defaultTime} required />
        </Field>
        <Field label="المدة">
          <Input type="number" name="duration" min={10} step={5} defaultValue={defaultDuration} required />
        </Field>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "جارٍ التأجيل..." : "تأجيل الموعد"}
      </Button>
    </form>
  );
}
