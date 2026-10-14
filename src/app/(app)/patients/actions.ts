"use server";

import { and, eq, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { patientConsents, patients } from "@/db/schema";
import { authorize } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { normalizeEgyptPhone } from "@/lib/time";

export type PatientState = { error?: string; success?: string; patientId?: number };

const schema = z.object({
  fullName: z.string().trim().min(3, "الاسم مطلوب (3 أحرف على الأقل)"),
  phone: z.string().trim().min(5, "رقم الهاتف مطلوب"),
  email: z.string().trim().email("بريد غير صالح").optional().or(z.literal("")),
  birthDate: z.string().optional().or(z.literal("")),
  gender: z.string().optional(),
  address: z.string().optional(),
  emergencyContact: z.string().optional(),
  medicalHistory: z.string().optional(),
  allergies: z.string().optional(),
  medications: z.string().optional(),
  conditions: z.string().optional(),
  notes: z.string().optional(),
  preferredChannel: z.enum(["whatsapp", "sms", "email", "inapp"]).default("whatsapp"),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return schema.safeParse(raw);
}

export async function createPatientAction(_prev: PatientState, formData: FormData): Promise<PatientState> {
  const auth = await authorize("patients.write");
  if (!auth.ok) return { error: auth.error };
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  const phone = normalizeEgyptPhone(data.phone);
  if (!phone) return { error: "رقم الهاتف المصري غير صالح (مثال: 01012345678)" };

  const dup = await db
    .select({ id: patients.id, name: patients.fullName })
    .from(patients)
    .where(and(eq(patients.clinicId, auth.user.clinicId), eq(patients.phone, phone)))
    .limit(1);
  if (dup.length) return { error: `يوجد مريض مسجل بنفس الرقم: ${dup[0].name} (#${dup[0].id})` };

  const code = `P-${Date.now().toString().slice(-6)}`;
  const [created] = await db
    .insert(patients)
    .values({
      clinicId: auth.user.clinicId,
      code,
      fullName: data.fullName,
      phone,
      email: data.email || null,
      birthDate: data.birthDate || null,
      gender: data.gender || null,
      address: data.address || null,
      emergencyContact: data.emergencyContact || null,
      medicalHistory: data.medicalHistory || null,
      allergies: data.allergies || null,
      medications: data.medications || null,
      conditions: data.conditions || null,
      notes: data.notes || null,
      preferredChannel: data.preferredChannel,
    })
    .returning({ id: patients.id });

  if (formData.get("consent") === "on") {
    await db.insert(patientConsents).values({
      clinicId: auth.user.clinicId,
      patientId: created.id,
      type: "treatment_and_communication",
      granted: true,
    });
  }

  await logAudit({
    clinicId: auth.user.clinicId,
    actorLabel: auth.user.fullName,
    action: "create",
    entity: "patient",
    entityId: created.id,
  });
  revalidatePath("/patients");
  return { success: "تم حفظ بيانات المريض", patientId: created.id };
}

export async function updatePatientAction(_prev: PatientState, formData: FormData): Promise<PatientState> {
  const auth = await authorize("patients.write");
  if (!auth.ok) return { error: auth.error };
  const id = Number(formData.get("id"));
  if (!id) return { error: "مريض غير معروف" };
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;
  const phone = normalizeEgyptPhone(data.phone);
  if (!phone) return { error: "رقم الهاتف المصري غير صالح" };

  const dup = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.clinicId, auth.user.clinicId), eq(patients.phone, phone), ne(patients.id, id)))
    .limit(1);
  if (dup.length) return { error: "رقم الهاتف مستخدم لمريض آخر" };

  const updated = await db
    .update(patients)
    .set({
      fullName: data.fullName,
      phone,
      email: data.email || null,
      birthDate: data.birthDate || null,
      gender: data.gender || null,
      address: data.address || null,
      emergencyContact: data.emergencyContact || null,
      medicalHistory: data.medicalHistory || null,
      allergies: data.allergies || null,
      medications: data.medications || null,
      conditions: data.conditions || null,
      notes: data.notes || null,
      preferredChannel: data.preferredChannel,
      updatedAt: new Date(),
    })
    .where(and(eq(patients.id, id), eq(patients.clinicId, auth.user.clinicId)))
    .returning({ id: patients.id });
  if (!updated.length) return { error: "المريض غير موجود" };

  await logAudit({
    clinicId: auth.user.clinicId,
    actorLabel: auth.user.fullName,
    action: "update",
    entity: "patient",
    entityId: id,
  });
  revalidatePath(`/patients/${id}`);
  return { success: "تم تحديث بيانات المريض" };
}

export async function findDuplicatesAction(nameOrPhone: string) {
  const auth = await authorize("patients.read");
  if (!auth.ok) return [];
  const term = `%${nameOrPhone}%`;
  return db
    .select({ id: patients.id, fullName: patients.fullName, phone: patients.phone })
    .from(patients)
    .where(and(eq(patients.clinicId, auth.user.clinicId), or(eq(patients.phone, nameOrPhone), eq(patients.fullName, term))))
    .limit(5);
}
