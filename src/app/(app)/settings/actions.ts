"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { clinics, dentists } from "@/db/schema";
import { authorize } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { getConfig, saveConfig, type ClinicConfig } from "@/lib/settings";
import { normalizeEgyptPhone } from "@/lib/time";

export type SettingsState = { error?: string; success?: string };

export async function saveClinicAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const auth = await authorize("settings.write");
  if (!auth.ok) return { error: auth.error };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "اسم العيادة مطلوب" };
  await db
    .update(clinics)
    .set({
      name,
      phone: String(formData.get("phone") ?? "") || null,
      address: String(formData.get("address") ?? "") || null,
      mapsUrl: String(formData.get("mapsUrl") ?? "") || null,
      logoUrl: String(formData.get("logoUrl") ?? "") || null,
      updatedAt: new Date(),
    })
    .where(eq(clinics.id, auth.user.clinicId));

  const config = await getConfig(auth.user.clinicId);
  const next: ClinicConfig = {
    ...config,
    defaultDurationMinutes: Number(formData.get("defaultDuration") ?? config.defaultDurationMinutes),
    bufferMinutes: Number(formData.get("buffer") ?? config.bufferMinutes),
    slotStepMinutes: Number(formData.get("slotStep") ?? config.slotStepMinutes),
    reminder24h: formData.get("reminder24h") === "on",
    reminder2h: formData.get("reminder2h") === "on",
    aiEnabled: formData.get("aiEnabled") === "on",
    aiGreeting: String(formData.get("aiGreeting") ?? config.aiGreeting),
    policies: String(formData.get("policies") ?? config.policies),
    emergencyInstructions: String(formData.get("emergency") ?? config.emergencyInstructions),
    holidays: String(formData.get("holidays") ?? "")
      .split(/[,\n\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
    workingHours: config.workingHours.map((d, i) => ({
      open: String(formData.get(`open_${i}`) ?? d.open),
      close: String(formData.get(`close_${i}`) ?? d.close),
      closed: formData.get(`closed_${i}`) === "on",
      breakStart: String(formData.get(`breakStart_${i}`) ?? d.breakStart ?? ""),
      breakEnd: String(formData.get(`breakEnd_${i}`) ?? d.breakEnd ?? ""),
    })),
    faq: (() => {
      const qs = formData.getAll("faq_q").map(String);
      const as = formData.getAll("faq_a").map(String);
      const list = qs.map((q, i) => ({ q: q.trim(), a: (as[i] ?? "").trim() })).filter((f) => f.q && f.a);
      return list.length ? list : config.faq;
    })(),
    templates: Object.fromEntries(
      Object.keys(config.templates).map((k) => [k, String(formData.get(`tpl_${k}`) ?? config.templates[k])]),
    ),
  };
  await saveConfig(auth.user.clinicId, next);
  await logAudit({ clinicId: auth.user.clinicId,  actorLabel: auth.user.fullName, action: "update", entity: "clinic_settings" });
  revalidatePath("/settings");
  return { success: "تم حفظ الإعدادات" };
}

export async function createDentistAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { user } = await authorize();
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (fullName.length < 3) return { error: "اسم الطبيب مطلوب" };
  const phoneRaw = String(formData.get("phone") ?? "");
  await db.insert(dentists).values({
    clinicId: user.clinicId,
    fullName,
    specialty: String(formData.get("specialty") ?? "") || null,
    phone: phoneRaw ? normalizeEgyptPhone(phoneRaw) : null,
  });
  await logAudit({
    clinicId: user.clinicId,
    actorLabel: user.fullName,
    action: "create",
    entity: "dentist",
  });
  revalidatePath("/dentists");
  return { success: "تمت إضافة الطبيب" };
}

export async function toggleDentistAction(formData: FormData): Promise<void> {
  const { user } = await authorize();
  const id = Number(formData.get("id"));
  const [target] = await db.select().from(dentists).where(eq(dentists.id, id)).limit(1);
  if (!target || target.clinicId !== user.clinicId) return;
  await db.update(dentists).set({ isActive: !target.isActive }).where(eq(dentists.id, id));
  await logAudit({
    clinicId: user.clinicId,
    actorLabel: user.fullName,
    action: target.isActive ? "deactivate" : "activate",
    entity: "dentist",
    entityId: id,
  });
  revalidatePath("/dentists");
}
