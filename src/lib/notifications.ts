import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, clinics, notificationJobs, notificationLogs, patients } from "@/db/schema";
import { getConfig, renderTemplate } from "@/lib/settings";
import { fmtDate, fmtTime } from "@/lib/time";

export type Channel = "whatsapp" | "sms" | "email" | "inapp";

export type SendResult = {
  status: "provider_accepted" | "delivered" | "failed";
  providerName: string;
  providerMessageId?: string;
  error?: string;
};

/* --------------------------- provider adapters --------------------------- */

async function sendWhatsApp(to: string, body: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    // No real credentials configured: log-only development adapter.
    console.info(`[whatsapp:dev] -> ${to}: ${body.slice(0, 60)}...`);
    return { status: "provider_accepted", providerName: "dev-log", providerMessageId: undefined };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "text",
        text: { body },
      }),
    });
    const json = (await res.json()) as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!res.ok) return { status: "failed", providerName: "whatsapp-cloud", error: json.error?.message ?? `HTTP ${res.status}` };
    // Provider accepted the message; actual delivery is confirmed later via webhook.
    return { status: "provider_accepted", providerName: "whatsapp-cloud", providerMessageId: json.messages?.[0]?.id };
  } catch (e) {
    return { status: "failed", providerName: "whatsapp-cloud", error: (e as Error).message };
  }
}

async function sendEmail(to: string, body: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.info(`[email:dev] -> ${to}: ${body.slice(0, 60)}...`);
    return { status: "provider_accepted", providerName: "dev-log" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: "تذكير بموعدك", text: body }),
    });
    const json = (await res.json()) as { id?: string; message?: string };
    if (!res.ok) return { status: "failed", providerName: "resend", error: json.message ?? `HTTP ${res.status}` };
    return { status: "provider_accepted", providerName: "resend", providerMessageId: json.id };
  } catch (e) {
    return { status: "failed", providerName: "resend", error: (e as Error).message };
  }
}

async function sendSms(to: string, body: string): Promise<SendResult> {
  if (!process.env.SMS_API_KEY) {
    console.info(`[sms:dev] -> ${to}: ${body.slice(0, 60)}...`);
    return { status: "provider_accepted", providerName: "dev-log" };
  }
  return { status: "failed", providerName: "sms", error: "SMS provider not implemented" };
}

export async function dispatch(channel: Channel, destination: string, body: string): Promise<SendResult> {
  switch (channel) {
    case "whatsapp":
      return sendWhatsApp(destination, body);
    case "email":
      return sendEmail(destination, body);
    case "sms":
      return sendSms(destination, body);
    default:
      return { status: "provider_accepted", providerName: "inapp" };
  }
}

/* ------------------------------ job planning ----------------------------- */

export async function scheduleAppointmentJobs(appointmentId: number): Promise<void> {
  const rows = await db
    .select({ appt: appointments, patient: patients })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  const row = rows[0];
  if (!row) return;
  const config = await getConfig(row.appt.clinicId);
  const channel = row.patient.marketingOptOut ? "inapp" : (row.patient.preferredChannel as Channel);
  const start = new Date(row.appt.startsAt);
  const plans: Array<{ kind: string; at: Date }> = [{ kind: "confirmation", at: new Date() }];
  if (config.reminder24h) plans.push({ kind: "reminder_24h", at: new Date(start.getTime() - 24 * 3600_000) });
  if (config.reminder2h) plans.push({ kind: "reminder_2h", at: new Date(start.getTime() - 2 * 3600_000) });

  for (const plan of plans) {
    await db
      .insert(notificationJobs)
      .values({
        clinicId: row.appt.clinicId,
        appointmentId: row.appt.id,
        patientId: row.appt.patientId,
        kind: plan.kind,
        channel,
        scheduledFor: plan.at,
        dedupeKey: `appt:${row.appt.id}:${plan.kind}:${start.toISOString()}`,
        payload: { startsAt: start.toISOString() },
      })
      .onConflictDoNothing({ target: notificationJobs.dedupeKey });
  }
}

export async function cancelAppointmentJobs(appointmentId: number, kind: "cancelled" | "rescheduled") {
  await db
    .update(notificationJobs)
    .set({ status: "skipped", updatedAt: new Date() })
    .where(and(eq(notificationJobs.appointmentId, appointmentId), eq(notificationJobs.status, "pending")));

  const rows = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
  const appt = rows[0];
  if (!appt) return;
  const patientRows = await db.select().from(patients).where(eq(patients.id, appt.patientId)).limit(1);
  const patient = patientRows[0];
  if (!patient) return;
  await db
    .insert(notificationJobs)
    .values({
      clinicId: appt.clinicId,
      appointmentId: appt.id,
      patientId: appt.patientId,
      kind,
      channel: patient.preferredChannel as Channel,
      scheduledFor: new Date(),
      dedupeKey: `appt:${appt.id}:${kind}:${Date.now()}`,
      payload: { startsAt: new Date(appt.startsAt).toISOString() },
    })
    .onConflictDoNothing({ target: notificationJobs.dedupeKey });
}

/* ------------------------------- processing ------------------------------ */

const MAX_ATTEMPTS = 3;

export async function processDueJobs(limit = 50): Promise<{ processed: number; sent: number; failed: number }> {
  const due = await db
    .select()
    .from(notificationJobs)
    .where(and(eq(notificationJobs.status, "pending"), lte(notificationJobs.scheduledFor, new Date())))
    .limit(limit);

  let sent = 0;
  let failed = 0;

  for (const job of due) {
    // idempotent claim: only one worker can flip pending -> processing
    const claimed = await db
      .update(notificationJobs)
      .set({ status: "processing", attempts: sql`${notificationJobs.attempts} + 1`, updatedAt: new Date() })
      .where(and(eq(notificationJobs.id, job.id), eq(notificationJobs.status, "pending")))
      .returning({ id: notificationJobs.id });
    if (claimed.length === 0) continue;

    try {
      const [patient] = await db.select().from(patients).where(eq(patients.id, job.patientId)).limit(1);
      const [clinic] = await db.select().from(clinics).where(eq(clinics.id, job.clinicId)).limit(1);
      if (!patient || !clinic) throw new Error("بيانات غير مكتملة");

      const config = await getConfig(job.clinicId);
      const startsAt = (job.payload as { startsAt?: string } | null)?.startsAt ?? new Date().toISOString();
      const body = renderTemplate(config.templates[job.kind] ?? "تذكير بموعدك في {{clinic}} يوم {{date}} الساعة {{time}}", {
        patient: patient.fullName,
        clinic: clinic.name,
        date: fmtDate(startsAt),
        time: fmtTime(startsAt),
        phone: clinic.phone ?? "",
      });

      const channel = (job.channel as Channel) ?? "whatsapp";
      const destination = channel === "email" ? (patient.email ?? "") : patient.phone;
      if (!destination) throw new Error("لا توجد وسيلة تواصل متاحة");

      const result = await dispatch(channel, destination, body);
      await db.insert(notificationLogs).values({
        clinicId: job.clinicId,
        jobId: job.id,
        patientId: job.patientId,
        channel,
        destination,
        body,
        status: result.status,
        providerName: result.providerName,
        providerMessageId: result.providerMessageId ?? null,
        error: result.error ?? null,
      });

      if (result.status === "failed") throw new Error(result.error ?? "فشل الإرسال");
      await db
        .update(notificationJobs)
        .set({ status: "sent", updatedAt: new Date(), lastError: null })
        .where(eq(notificationJobs.id, job.id));
      sent += 1;
    } catch (e) {
      const attempts = job.attempts + 1;
      await db
        .update(notificationJobs)
        .set({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          lastError: (e as Error).message,
          updatedAt: new Date(),
        })
        .where(eq(notificationJobs.id, job.id));
      failed += 1;
    }
  }

  return { processed: due.length, sent, failed };
}
