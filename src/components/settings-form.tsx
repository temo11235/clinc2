"use client";

import { useActionState } from "react";
import { saveClinicAction, type SettingsState } from "@/app/(app)/settings/actions";
import { Alert, Button, Card, Field, Input, Textarea } from "@/components/ui";
import type { ClinicConfig } from "@/lib/settings";

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const TPL_LABELS: Record<string, string> = {
  confirmation: "تأكيد الحجز",
  reminder_24h: "تذكير قبل 24 ساعة",
  reminder_2h: "تذكير قبل ساعتين",
  cancelled: "إشعار الإلغاء",
  rescheduled: "إشعار التأجيل",
  followup: "متابعة بعد الزيارة",
};

export function SettingsForm({
  clinic,
  config,
}: {
  clinic: { name: string; phone: string; address: string; mapsUrl: string; logoUrl: string };
  config: ClinicConfig;
}) {
  const [state, action, pending] = useActionState(saveClinicAction, {} as SettingsState);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.success ? <Alert kind="success">{state.success}</Alert> : null}

      <Card>
        <h2 className="mb-4 font-bold text-slate-800">بيانات العيادة</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="اسم العيادة" required>
            <Input name="name" defaultValue={clinic.name} required />
          </Field>
          <Field label="رقم الهاتف">
            <Input name="phone" defaultValue={clinic.phone} dir="ltr" />
          </Field>
          <Field label="العنوان">
            <Input name="address" defaultValue={clinic.address} />
          </Field>
          <Field label="رابط خرائط جوجل">
            <Input name="mapsUrl" defaultValue={clinic.mapsUrl} dir="ltr" />
          </Field>
          <Field label="رابط الشعار">
            <Input name="logoUrl" defaultValue={clinic.logoUrl} dir="ltr" />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold text-slate-800">مواعيد العمل والإجازات</h2>
        <div className="space-y-3">
          {DAYS.map((d, i) => (
            <div key={d} className="grid items-end gap-3 md:grid-cols-6">
              <span className="font-semibold text-slate-700">{d}</span>
              <Field label="من">
                <Input type="time" name={`open_${i}`} defaultValue={config.workingHours[i].open} />
              </Field>
              <Field label="إلى">
                <Input type="time" name={`close_${i}`} defaultValue={config.workingHours[i].close} />
              </Field>
              <Field label="بداية الراحة">
                <Input type="time" name={`breakStart_${i}`} defaultValue={config.workingHours[i].breakStart ?? ""} />
              </Field>
              <Field label="نهاية الراحة">
                <Input type="time" name={`breakEnd_${i}`} defaultValue={config.workingHours[i].breakEnd ?? ""} />
              </Field>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" name={`closed_${i}`} defaultChecked={config.workingHours[i].closed} />
                إجازة
              </label>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Field label="أيام الإجازات الرسمية" hint="تواريخ بصيغة YYYY-MM-DD مفصولة بمسافة أو سطر">
            <Textarea name="holidays" defaultValue={config.holidays.join("\n")} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold text-slate-800">الحجز والتذكيرات</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="مدة الموعد الافتراضية (دقيقة)">
            <Input type="number" name="defaultDuration" min={10} step={5} defaultValue={config.defaultDurationMinutes} />
          </Field>
          <Field label="فاصل بين المواعيد (دقيقة)">
            <Input type="number" name="buffer" min={0} step={5} defaultValue={config.bufferMinutes} />
          </Field>
          <Field label="خطوة البحث عن المواعيد (دقيقة)">
            <Input type="number" name="slotStep" min={5} step={5} defaultValue={config.slotStepMinutes} />
          </Field>
        </div>
        <div className="mt-3 flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="reminder24h" defaultChecked={config.reminder24h} /> تذكير قبل 24 ساعة
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="reminder2h" defaultChecked={config.reminder2h} /> تذكير قبل ساعتين
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold text-slate-800">قوالب الرسائل</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(config.templates).map(([key, value]) => (
            <Field key={key} label={TPL_LABELS[key] ?? key} hint="المتغيرات: {{patient}} {{clinic}} {{date}} {{time}} {{phone}}">
              <Textarea name={`tpl_${key}`} defaultValue={value} />
            </Field>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold text-slate-800">المساعد الذكي والسياسات</h2>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" name="aiEnabled" defaultChecked={config.aiEnabled} /> تفعيل المساعد الافتراضي
        </label>
        <div className="grid gap-4">
          <Field label="رسالة الترحيب">
            <Textarea name="aiGreeting" defaultValue={config.aiGreeting} />
          </Field>
          <Field label="سياسات الحجز والإلغاء">
            <Textarea name="policies" defaultValue={config.policies} />
          </Field>
          <Field label="تعليمات الطوارئ المعتمدة">
            <Textarea name="emergency" defaultValue={config.emergencyInstructions} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold text-slate-800">الأسئلة الشائعة</h2>
        <div className="space-y-3">
          {[...config.faq, { q: "", a: "" }].map((f, i) => (
            <div key={i} className="grid gap-3 md:grid-cols-2">
              <Input name="faq_q" defaultValue={f.q} placeholder="السؤال" />
              <Input name="faq_a" defaultValue={f.a} placeholder="الإجابة" />
            </div>
          ))}
        </div>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الحفظ..." : "حفظ جميع الإعدادات"}
      </Button>
    </form>
  );
}
