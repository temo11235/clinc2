import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiConversations, aiToolAuditLogs, appointments, patients, treatmentCatalog } from "@/db/schema";
import { getClinic, getConfig } from "@/lib/settings";
import { bookAndNotify, changeStatus, rescheduleAppointment, searchUpcomingSlots } from "@/lib/scheduling";
import { cairoToUtc, cairoDayString, fmtDate, fmtTime, normalizeEgyptPhone } from "@/lib/time";
import { formatEGP } from "@/lib/money";

/** Context the tools run under — never taken from model output. */
export type ToolContext = {
  clinicId: number;
  conversationId: number;
  /** phone verified for this conversation (set after the patient provides it + name match) */
  verifiedPhone: string | null;
  isStaff: boolean;
};

export type ToolResult = { ok: boolean; data?: unknown; message: string };

const phoneSchema = z.string().min(6, "رقم الهاتف مطلوب");

export const toolSchemas = {
  get_clinic_information: z.object({
    topic: z.enum(["hours", "location", "services", "pricing", "policies", "faq", "emergency"]).default("faq"),
  }),
  search_available_slots: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    days: z.number().int().min(1).max(14).default(5),
    durationMinutes: z.number().int().min(10).max(180).default(30),
  }),
  create_appointment: z.object({
    patientName: z.string().min(3, "اسم المريض مطلوب"),
    phone: phoneSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    durationMinutes: z.number().int().min(10).max(180).default(30),
    reason: z.string().max(200).optional(),
    confirmed: z.literal(true, { message: "يجب تأكيد المريض للموعد قبل الحجز" }),
  }),
  find_patient_appointments: z.object({
    phone: phoneSchema,
    patientName: z.string().min(3, "الاسم مطلوب للتحقق من الهوية"),
  }),
  reschedule_appointment: z.object({
    appointmentId: z.number().int().positive(),
    phone: phoneSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    confirmed: z.literal(true, { message: "يجب تأكيد المريض قبل التأجيل" }),
  }),
  cancel_appointment: z.object({
    appointmentId: z.number().int().positive(),
    phone: phoneSchema,
    confirmed: z.literal(true, { message: "يجب تأكيد المريض قبل الإلغاء" }),
  }),
  request_human_assistance: z.object({
    reason: z.string().min(3).max(300),
    phone: phoneSchema.optional(),
  }),
} as const;

export type ToolName = keyof typeof toolSchemas;

async function verifyIdentity(clinicId: number, phoneRaw: string, name?: string) {
  const phone = normalizeEgyptPhone(phoneRaw);
  if (!phone) return { ok: false as const, error: "رقم الهاتف غير صالح (مثال: 01012345678)" };
  const [patient] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.phone, phone)))
    .limit(1);
  if (!patient) return { ok: false as const, error: "لا يوجد ملف مريض بهذا الرقم. يمكننا إنشاء حجز جديد." };
  if (name) {
    const a = patient.fullName.replace(/\s+/g, "");
    const b = name.replace(/\s+/g, "");
    if (!a.includes(b.slice(0, 4)) && !b.includes(a.slice(0, 4)))
      return { ok: false as const, error: "الاسم لا يطابق الرقم المسجل. برجاء التواصل مع الاستقبال." };
  }
  return { ok: true as const, patient, phone };
}

async function execute(name: ToolName, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = toolSchemas[name].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { ok: false, message: `بيانات غير مكتملة: ${parsed.error.issues[0].message}` };
  }

  switch (name) {
    case "get_clinic_information": {
      const args = parsed.data as z.infer<typeof toolSchemas.get_clinic_information>;
      const clinic = await getClinic(ctx.clinicId);
      const config = await getConfig(ctx.clinicId);
      const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
      if (args.topic === "hours") {
        const lines = config.workingHours.map((d, i) => `${days[i]}: ${d.closed ? "إجازة" : `${d.open} - ${d.close}`}`);
        return { ok: true, data: lines, message: lines.join("\n") };
      }
      if (args.topic === "location")
        return { ok: true, message: `${clinic?.address ?? "—"}${clinic?.mapsUrl ? ` — ${clinic.mapsUrl}` : ""}` };
      if (args.topic === "services" || args.topic === "pricing") {
        const list = await db
          .select()
          .from(treatmentCatalog)
          .where(and(eq(treatmentCatalog.clinicId, ctx.clinicId), eq(treatmentCatalog.isActive, true)))
          .limit(25);
        const lines = list.map((t) => `${t.nameAr}: تبدأ من ${formatEGP(t.priceMinor)}`);
        return { ok: true, data: lines, message: lines.length ? lines.join("\n") : "دليل الأسعار غير متاح حاليًا." };
      }
      if (args.topic === "policies") return { ok: true, message: config.policies };
      if (args.topic === "emergency") return { ok: true, message: config.emergencyInstructions };
      return {
        ok: true,
        data: config.faq,
        message: config.faq.map((f) => `س: ${f.q}\nج: ${f.a}`).join("\n\n"),
      };
    }

    case "search_available_slots": {
      const args = parsed.data as z.infer<typeof toolSchemas.search_available_slots>;
      const result = await searchUpcomingSlots({
        clinicId: ctx.clinicId,
        fromDate: args.date ?? cairoDayString(),
        days: args.date ? 1 : args.days,
        durationMinutes: args.durationMinutes,
        perDay: 5,
      });
      if (result.length === 0)
        return { ok: true, data: [], message: "لا توجد مواعيد متاحة في الفترة المطلوبة. جرّب تاريخًا آخر." };
      const message = result
        .map((d) => `${d.date}: ${d.slots.map((s) => fmtTime(new Date(s.start))).join("، ")}`)
        .join("\n");
      return { ok: true, data: result, message };
    }

    case "create_appointment": {
      const args = parsed.data as z.infer<typeof toolSchemas.create_appointment>;
      const phone = normalizeEgyptPhone(args.phone);
      if (!phone) return { ok: false, message: "رقم الهاتف غير صالح" };

      let [patient] = await db
        .select()
        .from(patients)
        .where(and(eq(patients.clinicId, ctx.clinicId), eq(patients.phone, phone)))
        .limit(1);
      if (!patient) {
        const [created] = await db
          .insert(patients)
          .values({
            clinicId: ctx.clinicId,
            code: `P-${Date.now().toString().slice(-6)}`,
            fullName: args.patientName,
            phone,
          })
          .returning();
        patient = created;
      }

      const start = cairoToUtc(args.date, args.time);
      const end = new Date(start.getTime() + args.durationMinutes * 60_000);
      const res = await bookAndNotify({
        clinicId: ctx.clinicId,
        patientId: patient.id,
        dentistId: null,
        start,
        end,
        type: args.reason?.slice(0, 60) || "كشف",
        source: "ai",
        actorLabel: "المساعد الذكي",
      });
      if (!res.ok) return { ok: false, message: res.error };

      await db
        .update(aiConversations)
        .set({ patientId: patient.id, verifiedPhone: phone, updatedAt: new Date() })
        .where(eq(aiConversations.id, ctx.conversationId));

      return {
        ok: true,
        data: { appointmentId: res.appointmentId },
        message: `تم تأكيد الحجز فعليًا في النظام يوم ${args.date} الساعة ${args.time} باسم ${patient.fullName}. رقم الموعد #${res.appointmentId}.`,
      };
    }

    case "find_patient_appointments": {
      const args = parsed.data as z.infer<typeof toolSchemas.find_patient_appointments>;
      const v = await verifyIdentity(ctx.clinicId, args.phone, args.patientName);
      if (!v.ok) return { ok: false, message: v.error };
      const rows = await db
        .select({ id: appointments.id, startsAt: appointments.startsAt, status: appointments.status, type: appointments.type })
        .from(appointments)
        .where(
          and(
            eq(appointments.clinicId, ctx.clinicId),
            eq(appointments.patientId, v.patient.id),
            gte(appointments.startsAt, new Date()),
            sql`${appointments.status} in ('scheduled','confirmed','checked_in')`,
          ),
        )
        .limit(5);
      await db
        .update(aiConversations)
        .set({ patientId: v.patient.id, verifiedPhone: v.phone, updatedAt: new Date() })
        .where(eq(aiConversations.id, ctx.conversationId));
      if (rows.length === 0) return { ok: true, data: [], message: "لا توجد مواعيد قادمة مسجلة على هذا الرقم." };
      return {
        ok: true,
        data: rows,
        message: rows.map((r) => `#${r.id} — ${fmtDate(r.startsAt)} الساعة ${fmtTime(r.startsAt)} (${r.type})`).join("\n"),
      };
    }

    case "reschedule_appointment": {
      const args = parsed.data as z.infer<typeof toolSchemas.reschedule_appointment>;
      const v = await verifyIdentity(ctx.clinicId, args.phone);
      if (!v.ok) return { ok: false, message: v.error };
      const [appt] = await db
        .select()
        .from(appointments)
        .where(and(eq(appointments.id, args.appointmentId), eq(appointments.clinicId, ctx.clinicId)))
        .limit(1);
      if (!appt || appt.patientId !== v.patient.id)
        return { ok: false, message: "هذا الموعد غير مرتبط بالرقم المسجل." };
      const start = cairoToUtc(args.date, args.time);
      const end = new Date(start.getTime() + (new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()));
      const res = await rescheduleAppointment({
        clinicId: ctx.clinicId,
        appointmentId: args.appointmentId,
        start,
        end,
        actorLabel: "المساعد الذكي",
      });
      if (!res.ok) return { ok: false, message: res.error ?? "تعذر التأجيل" };
      return { ok: true, message: `تم تأجيل الموعد #${args.appointmentId} إلى ${args.date} الساعة ${args.time}.` };
    }

    case "cancel_appointment": {
      const args = parsed.data as z.infer<typeof toolSchemas.cancel_appointment>;
      const v = await verifyIdentity(ctx.clinicId, args.phone);
      if (!v.ok) return { ok: false, message: v.error };
      const [appt] = await db
        .select()
        .from(appointments)
        .where(and(eq(appointments.id, args.appointmentId), eq(appointments.clinicId, ctx.clinicId)))
        .limit(1);
      if (!appt || appt.patientId !== v.patient.id)
        return { ok: false, message: "هذا الموعد غير مرتبط بالرقم المسجل." };
      const res = await changeStatus({
        clinicId: ctx.clinicId,
        appointmentId: args.appointmentId,
        status: "cancelled",
        actorLabel: "المساعد الذكي",
      });
      if (!res.ok) return { ok: false, message: res.error ?? "تعذر الإلغاء" };
      return { ok: true, message: `تم إلغاء الموعد #${args.appointmentId}.` };
    }

    case "request_human_assistance": {
      const args = parsed.data as z.infer<typeof toolSchemas.request_human_assistance>;
      await db
        .update(aiConversations)
        .set({ escalated: true, updatedAt: new Date() })
        .where(eq(aiConversations.id, ctx.conversationId));
      return {
        ok: true,
        data: { reason: args.reason },
        message: "تم تحويل طلبك لموظف الاستقبال وسيتم التواصل معك في أقرب وقت خلال ساعات العمل.",
      };
    }
  }
}

/** Public entry point: validates, authorizes, executes, and audits every tool call. */
export async function runTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  if (!(name in toolSchemas)) {
    return { ok: false, message: "أداة غير معروفة" };
  }
  let result: ToolResult;
  try {
    result = await execute(name as ToolName, args, ctx);
  } catch (e) {
    result = { ok: false, message: `حدث خطأ أثناء تنفيذ الطلب: ${(e as Error).message}` };
  }
  await db.insert(aiToolAuditLogs).values({
    clinicId: ctx.clinicId,
    conversationId: ctx.conversationId,
    toolName: name,
    args: sanitizeArgs(args),
    success: result.ok,
    result: { message: result.message.slice(0, 500) },
    error: result.ok ? null : result.message.slice(0, 300),
  });
  return result;
}

/** Keep audit logs free of unnecessary personal data. */
function sanitizeArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (k === "phone" && typeof v === "string") out[k] = `***${v.slice(-4)}`;
    else if (k === "patientName" && typeof v === "string") out[k] = `${v.slice(0, 2)}***`;
    else out[k] = v;
  }
  return out;
}
