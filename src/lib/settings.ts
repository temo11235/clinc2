import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clinicSettings, clinics } from "@/db/schema";

export type WorkingDay = { open: string; close: string; closed: boolean; breakStart?: string; breakEnd?: string };

export type ClinicConfig = {
  workingHours: WorkingDay[]; // index 0 = Sunday
  holidays: string[]; // YYYY-MM-DD
  defaultDurationMinutes: number;
  bufferMinutes: number;
  slotStepMinutes: number;
  reminder24h: boolean;
  reminder2h: boolean;
  faq: Array<{ q: string; a: string }>;
  policies: string;
  emergencyInstructions: string;
  aiEnabled: boolean;
  aiGreeting: string;
  templates: Record<string, string>;
};

const day = (open = "10:00", close = "21:00", closed = false): WorkingDay => ({
  open,
  close,
  closed,
  breakStart: "14:00",
  breakEnd: "15:00",
});

export const DEFAULT_CONFIG: ClinicConfig = {
  workingHours: [day(), day(), day(), day(), day(), day("10:00", "21:00", true), day()],
  holidays: [],
  defaultDurationMinutes: 30,
  bufferMinutes: 10,
  slotStepMinutes: 15,
  reminder24h: true,
  reminder2h: true,
  faq: [
    { q: "ما هي مواعيد العمل؟", a: "من السبت إلى الخميس، من 10 صباحًا حتى 9 مساءً. الجمعة إجازة." },
    { q: "هل الكشف يحتاج حجز مسبق؟", a: "نعم، يُفضل الحجز المسبق لضمان توفر موعد مناسب." },
    { q: "ما هي طرق الدفع المتاحة؟", a: "نقدًا أو ببطاقة الدفع أو تحويل بنكي." },
    { q: "كيف أستعد لموعد الخلع؟", a: "يُفضل تناول وجبة خفيفة قبل الموعد وإحضار أي أشعة سابقة." },
  ],
  policies:
    "يُرجى الحضور قبل الموعد بـ 10 دقائق. الإلغاء أو التأجيل يتم قبل الموعد بـ 4 ساعات على الأقل.",
  emergencyInstructions:
    "في حالات النزيف الشديد أو التورم المصحوب بصعوبة في التنفس أو البلع، توجّه فورًا إلى أقرب مستشفى طوارئ أو اتصل بالإسعاف 123.",
  aiEnabled: true,
  aiGreeting:
    "أهلاً بك! أنا المساعد الافتراضي للعيادة (مساعد آلي وليس طبيبًا). أقدر أساعدك في معرفة المواعيد المتاحة والحجز والتأجيل والإلغاء.",
  templates: {
    confirmation:
      "مرحبًا {{patient}}، تم تأكيد موعدك في {{clinic}} يوم {{date}} الساعة {{time}}. للاستفسار: {{phone}}",
    reminder_24h:
      "تذكير: لديك موعد في {{clinic}} غدًا {{date}} الساعة {{time}}. للإلغاء أو التأجيل برجاء التواصل معنا.",
    reminder_2h: "تذكير: موعدك في {{clinic}} اليوم الساعة {{time}}. نرجو الحضور قبلها بـ 10 دقائق.",
    cancelled: "تم إلغاء موعدك في {{clinic}} بتاريخ {{date}} الساعة {{time}}. يسعدنا حجز موعد جديد.",
    rescheduled: "تم تأجيل موعدك في {{clinic}} إلى {{date}} الساعة {{time}}.",
    followup: "نتمنى لك تحسنًا سريعًا. لو لديك أي استفسار بعد زيارتك لـ{{clinic}} تواصل معنا.",
  },
};

export const CONFIG_KEY = "clinic_config";

export async function getClinic(clinicId: number) {
  const rows = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1);
  return rows[0] ?? null;
}

export async function getConfig(clinicId: number): Promise<ClinicConfig> {
  const rows = await db
    .select()
    .from(clinicSettings)
    .where(and(eq(clinicSettings.clinicId, clinicId), eq(clinicSettings.key, CONFIG_KEY)))
    .limit(1);
  const stored = (rows[0]?.value ?? {}) as Partial<ClinicConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    workingHours: stored.workingHours?.length === 7 ? stored.workingHours : DEFAULT_CONFIG.workingHours,
    templates: { ...DEFAULT_CONFIG.templates, ...(stored.templates ?? {}) },
    faq: stored.faq ?? DEFAULT_CONFIG.faq,
  };
}

export async function saveConfig(clinicId: number, config: ClinicConfig): Promise<void> {
  await db
    .insert(clinicSettings)
    .values({ clinicId, key: CONFIG_KEY, value: config })
    .onConflictDoUpdate({
      target: [clinicSettings.clinicId, clinicSettings.key],
      set: { value: config, updatedAt: new Date() },
    });
}

export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? "");
}
