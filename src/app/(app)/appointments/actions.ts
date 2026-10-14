"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { appointments, patients, treatmentCatalog } from "@/db/schema";
import { authorize } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { bookAndNotify, changeStatus, rescheduleAppointment, searchAvailableSlots } from "@/lib/scheduling";
import { cairoToUtc, normalizeEgyptPhone } from "@/lib/time";

export type ApptState = { error?: string; success?: string; appointmentId?: number };

const bookSchema = z.object({
  patientId: z.coerce.number().int().positive().optional(),
  newPatientName: z.string().trim().optional(),
  newPatientPhone: z.string().trim().optional(),
  dentistId: z.coerce.number().int().optional(),
  treatmentId: z.coerce.number().int().optional(),
  date: z.string().min(10, "التاريخ مطلوب"),
  time: z.string().min(4, "الوقت مطلوب"),
  duration: z.coerce.number().int().min(10).max(480).default(30),
  type: z.string().trim().default("كشف"),
  notes: z.string().optional(),
});

export async function createAppointmentAction(_prev: ApptState, formData: FormData): Promise<ApptState> {
  const auth = await authorize("appointments.write");
  if (!auth.ok) return { error: auth.error };
  const parsed = bookSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  let patientId = d.patientId ?? 0;
  if (!patientId) {
    if (!d.newPatientName || !d.newPatientPhone) return { error: "اختر مريضًا أو أدخل اسم ورقم مريض جديد" };
    const phone = normalizeEgyptPhone(d.newPatientPhone);
    if (!phone) return { error: "رقم هاتف غير صالح" };
    const existing = await db
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.clinicId, auth.user.clinicId), eq(patients.phone, phone)))
      .limit(1);
    if (existing.length) patientId = existing[0].id;
    else {
      const [created] = await db
        .insert(patients)
        .values({
          clinicId: auth.user.clinicId,
          code: `P-${Date.now().toString().slice(-6)}`,
          fullName: d.newPatientName,
          phone,
        })
        .returning({ id: patients.id });
      patientId = created.id;
    }
  } else {
    const owned = await db
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, patientId), eq(patients.clinicId, auth.user.clinicId)))
      .limit(1);
    if (!owned.length) return { error: "المريض غير موجود" };
  }

  let duration = d.duration;
  if (d.treatmentId) {
    const [t] = await db
      .select()
      .from(treatmentCatalog)
      .where(and(eq(treatmentCatalog.id, d.treatmentId), eq(treatmentCatalog.clinicId, auth.user.clinicId)))
      .limit(1);
    if (t) duration = d.duration || t.durationMinutes;
  }

  const start = cairoToUtc(d.date, d.time);
  const end = new Date(start.getTime() + duration * 60_000);

  const res = await bookAndNotify({
    clinicId: auth.user.clinicId,
    patientId,
    dentistId: d.dentistId ?? null,
    treatmentId: d.treatmentId ?? null,
    start,
    end,
    type: d.type || "كشف",
    notes: d.notes ?? null,
    source: "staff",
    actorLabel: auth.user.fullName,
  });
  if (!res.ok) return { error: res.error };

  await logAudit({
    clinicId: auth.user.clinicId,
    actorLabel: auth.user.fullName,
    action: "create",
    entity: "appointment",
    entityId: res.appointmentId,
    metadata: { start: start.toISOString() },
  });
  revalidatePath("/appointments");
  return { success: "تم حجز الموعد بنجاح", appointmentId: res.appointmentId };
}

export async function updateStatusAction(formData: FormData): Promise<void> {
  const auth = await authorize("appointments.write");
  if (!auth.ok) return;
  const appointmentId = Number(formData.get("appointmentId"));
  const status = String(formData.get("status"));
  await changeStatus({
    clinicId: auth.user.clinicId,
    appointmentId,
    status,
    actorLabel: auth.user.fullName,
  });
  await logAudit({
    clinicId: auth.user.clinicId,
    actorLabel: auth.user.fullName,
    action: `status:${status}`,
    entity: "appointment",
    entityId: appointmentId,
  });
  revalidatePath("/appointments");
  revalidatePath("/appointments/today");
  revalidatePath("/dashboard");
}

export async function rescheduleAction(_prev: ApptState, formData: FormData): Promise<ApptState> {
  const auth = await authorize("appointments.write");
  if (!auth.ok) return { error: auth.error };
  const appointmentId = Number(formData.get("appointmentId"));
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const duration = Number(formData.get("duration") ?? 30);
  if (!appointmentId || !date || !time) return { error: "بيانات ناقصة" };
  const start = cairoToUtc(date, time);
  const end = new Date(start.getTime() + duration * 60_000);
  const res = await rescheduleAppointment({
    clinicId: auth.user.clinicId,
    appointmentId,
    start,
    end,
    actorLabel: auth.user.fullName,
  });
  if (!res.ok) return { error: res.error };
  await logAudit({
    clinicId: auth.user.clinicId,
    action: "reschedule",
    entity: "appointment",
    entityId: appointmentId,
  });
  revalidatePath("/appointments");
  return { success: "تم تأجيل الموعد" };
}

export async function updateNotesAction(formData: FormData): Promise<void> {
  const auth = await authorize("appointments.write");
  if (!auth.ok) return;
  const appointmentId = Number(formData.get("appointmentId"));
  const notes = String(formData.get("notes") ?? "");
  await db
    .update(appointments)
    .set({ notes, updatedAt: new Date() })
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, auth.user.clinicId)));
  revalidatePath(`/appointments/${appointmentId}`);
}

export async function slotsAction(dateStr: string, duration: number, dentistId?: number) {
  const auth = await authorize("appointments.read");
  if (!auth.ok) return [];
  return searchAvailableSlots({
    clinicId: auth.user.clinicId,
    dateStr,
    durationMinutes: duration,
    dentistId: dentistId ?? null,
    limit: 40,
  });
}
