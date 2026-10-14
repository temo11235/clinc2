"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { patients, visitProcedures, visits } from "@/db/schema";
import { authorize } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { toMinor } from "@/lib/money";

export type VisitState = { error?: string; success?: string; visitId?: number };

const visitSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  appointmentId: z.coerce.number().int().optional(),
  chiefComplaint: z.string().trim().min(2, "الشكوى الرئيسية مطلوبة"),
  examination: z.string().optional(),
  diagnosis: z.string().optional(),
  treatmentPlan: z.string().optional(),
  followUp: z.string().optional(),
  prescription: z.string().optional(),
});

export async function createVisitAction(_prev: VisitState, formData: FormData): Promise<VisitState> {
  const auth = await authorize("clinical.write");
  if (!auth.ok) return { error: auth.error };
  const parsed = visitSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const [patient] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, d.patientId), eq(patients.clinicId, auth.user.clinicId)))
    .limit(1);
  if (!patient) return { error: "المريض غير موجود" };

  const [created] = await db
    .insert(visits)
    .values({
      clinicId: auth.user.clinicId,
      patientId: d.patientId,
      appointmentId: d.appointmentId || null,
      dentistId: 0,
      chiefComplaint: d.chiefComplaint,
      examination: d.examination || null,
      diagnosis: d.diagnosis || null,
      treatmentPlan: d.treatmentPlan || null,
      followUp: d.followUp || null,
      prescription: d.prescription || null,
    })
    .returning({ id: visits.id });

  await db.update(patients).set({ lastVisitAt: new Date() }).where(eq(patients.id, d.patientId));
  await logAudit({
    clinicId: auth.user.clinicId,
    actorLabel: auth.user.fullName,
    action: "create",
    entity: "visit",
    entityId: created.id,
  });
  revalidatePath("/visits");
  return { success: "تم حفظ الزيارة", visitId: created.id };
}

export async function addProcedureAction(_prev: VisitState, formData: FormData): Promise<VisitState> {
  const auth = await authorize("clinical.write");
  if (!auth.ok) return { error: auth.error };
  const visitId = Number(formData.get("visitId"));
  const title = String(formData.get("title") ?? "").trim();
  if (!visitId || title.length < 2) return { error: "اسم الإجراء مطلوب" };

  const [visit] = await db
    .select()
    .from(visits)
    .where(and(eq(visits.id, visitId), eq(visits.clinicId, auth.user.clinicId)))
    .limit(1);
  if (!visit) return { error: "الزيارة غير موجودة" };
  if (visit.locked) return { error: "الزيارة مقفلة ولا يمكن التعديل عليها" };

  await db.insert(visitProcedures).values({
    clinicId: auth.user.clinicId,
    visitId,
    patientId: visit.patientId,
    treatmentId: Number(formData.get("treatmentId")) || null,
    title,
    toothNumber: Number(formData.get("toothNumber")) || null,
    surfaces: String(formData.get("surfaces") ?? "") || null,
    status: String(formData.get("status") ?? "completed"),
    materials: String(formData.get("materials") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
    priceMinor: toMinor(String(formData.get("price") ?? "0")),
  });

  await logAudit({
    clinicId: auth.user.clinicId,
    actorLabel: auth.user.fullName,
    action: "add_procedure",
    entity: "visit",
    entityId: visitId,
  });
  revalidatePath(`/visits/${visitId}`);
  return { success: "تم تسجيل الإجراء" };
}

export async function lockVisitAction(formData: FormData): Promise<void> {
  const auth = await authorize("clinical.write");
  if (!auth.ok) return;
  const visitId = Number(formData.get("visitId"));
  await db
    .update(visits)
    .set({ locked: true, updatedAt: new Date() })
    .where(and(eq(visits.id, visitId), eq(visits.clinicId, auth.user.clinicId)));
  await logAudit({
    clinicId: auth.user.clinicId,
    actorLabel: auth.user.fullName,
    action: "lock",
    entity: "visit",
    entityId: visitId,
  });
  revalidatePath(`/visits/${visitId}`);
}
