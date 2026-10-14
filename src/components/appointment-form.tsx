"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAppointmentAction, slotsAction, type ApptState } from "@/app/(app)/appointments/actions";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";

type Option = { id: number; label: string; duration?: number };

export function AppointmentForm({
  patientsList,
  dentists,
  treatments,
  defaultDate,
  defaultPatientId,
  defaultDuration,
}: {
  patientsList: Option[];
  dentists: Option[];
  treatments: Option[];
  defaultDate: string;
  defaultPatientId?: number;
  defaultDuration: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createAppointmentAction, {} as ApptState);
  const [date, setDate] = useState(defaultDate);
  const [duration, setDuration] = useState(defaultDuration);
  const [dentistId, setDentistId] = useState<number | undefined>(dentists[0]?.id);
  const [slots, setSlots] = useState<Array<{ start: string; label: string }>>([]);
  const [time, setTime] = useState("");
  const [newPatient, setNewPatient] = useState(!patientsList.length);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await slotsAction(date, duration, dentistId);
      setSlots(res.map((s) => ({ start: s.start, label: s.label })));
    });
  }, [date, duration, dentistId]);

  useEffect(() => {
    if (state.success && state.appointmentId) router.push(`/appointments/${state.appointmentId}`);
  }, [state, router]);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.success ? <Alert kind="success">{state.success}</Alert> : null}

      <Card>
        <h2 className="mb-4 font-bold text-slate-800">المريض</h2>
        <div className="mb-3 flex gap-2 text-sm">
          <button type="button" onClick={() => setNewPatient(false)} className={`rounded-lg px-3 py-1.5 ${!newPatient ? "bg-teal-600 text-white" : "bg-slate-100"}`}>
            مريض مسجل
          </button>
          <button type="button" onClick={() => setNewPatient(true)} className={`rounded-lg px-3 py-1.5 ${newPatient ? "bg-teal-600 text-white" : "bg-slate-100"}`}>
            مريض جديد
          </button>
        </div>
        {newPatient ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="اسم المريض" required>
              <Input name="newPatientName" required={newPatient} />
            </Field>
            <Field label="رقم الهاتف" hint="01012345678" required>
              <Input name="newPatientPhone" dir="ltr" required={newPatient} />
            </Field>
          </div>
        ) : (
          <Field label="اختر المريض" required>
            <Select name="patientId" defaultValue={defaultPatientId ? String(defaultPatientId) : ""} required={!newPatient}>
              <option value="">— اختر —</option>
              {patientsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 font-bold text-slate-800">تفاصيل الموعد</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="الطبيب">
            <Select name="dentistId" value={dentistId ?? ""} onChange={(e) => setDentistId(Number(e.target.value) || undefined)}>
              <option value="">غير محدد</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="نوع الموعد">
            <Input name="type" defaultValue="كشف" />
          </Field>
          <Field label="العلاج (اختياري)">
            <Select
              name="treatmentId"
              onChange={(e) => {
                const t = treatments.find((x) => String(x.id) === e.target.value);
                if (t?.duration) setDuration(t.duration);
              }}
            >
              <option value="">غير محدد</option>
              {treatments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المدة (دقيقة)" required>
            <Input name="duration" type="number" min={10} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </Field>
          <Field label="التاريخ" required>
            <Input name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="الوقت" required>
            <Input name="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-slate-700">المواعيد المتاحة في هذا اليوم</p>
          {loading ? (
            <p className="text-sm text-slate-400">جارٍ البحث عن أوقات متاحة...</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-amber-600">لا توجد أوقات متاحة في هذا اليوم (إجازة أو مواعيد مكتملة).</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => {
                const hhmm = new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Africa/Cairo",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(new Date(s.start));
                return (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => setTime(hhmm)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      time === hhmm ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    {hhmm}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4">
          <Field label="ملاحظات داخلية">
            <Textarea name="notes" />
          </Field>
        </div>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الحجز..." : "تأكيد الحجز"}
      </Button>
    </form>
  );
}
