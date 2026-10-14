import "server-only";
import { and, eq, gte, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointmentEvents, appointments, patients } from "@/db/schema";
import { getConfig, type ClinicConfig } from "@/lib/settings";
import { cairoDayBounds, cairoDayString, cairoToUtc, cairoWeekday, fmtTime } from "@/lib/time";
import { scheduleAppointmentJobs, cancelAppointmentJobs } from "@/lib/notifications";

export const ACTIVE_STATUSES = ["scheduled", "confirmed", "checked_in"] as const;

export type SlotCheck = { ok: true } | { ok: false; reason: string };

function minutesOf(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Validate that [start,end) fits inside clinic working hours (Cairo) and is not a holiday/break. */
export function validateWorkingHours(config: ClinicConfig, start: Date, end: Date): SlotCheck {
  const dayStr = cairoDayString(start);
  if (config.holidays.includes(dayStr)) return { ok: false, reason: "هذا اليوم إجازة رسمية للعيادة" };
  const weekday = cairoWeekday(start);
  const rules = config.workingHours[weekday];
  if (!rules || rules.closed) return { ok: false, reason: "العيادة مغلقة في هذا اليوم" };

  const dayStart = cairoDayBounds(dayStr).start.getTime();
  const startMin = Math.round((start.getTime() - dayStart) / 60000);
  const endMin = Math.round((end.getTime() - dayStart) / 60000);
  if (endMin <= startMin) return { ok: false, reason: "وقت النهاية يجب أن يكون بعد وقت البداية" };
  if (startMin < minutesOf(rules.open) || endMin > minutesOf(rules.close))
    return { ok: false, reason: `مواعيد العمل من ${rules.open} إلى ${rules.close}` };
  if (rules.breakStart && rules.breakEnd) {
    const bs = minutesOf(rules.breakStart);
    const be = minutesOf(rules.breakEnd);
    if (startMin < be && endMin > bs)
      return { ok: false, reason: `يتعارض مع فترة الراحة (${rules.breakStart} - ${rules.breakEnd})` };
  }
  return { ok: true };
}

type BookInput = {
  clinicId: number;
  patientId: number;
  dentistId: number | null;
  treatmentId?: number | null;
  start: Date;
  end: Date;
  type?: string;
  notes?: string | null;
  source?: string;
  actorLabel?: string | null;
};

export type BookResult =
  | { ok: true; appointmentId: number }
  | { ok: false; error: string };

/**
 * Creates an appointment atomically. Uses a transaction + a per-dentist advisory
 * lock so concurrent requests cannot both pass the overlap check.
 */
export async function bookAppointment(input: BookInput): Promise<BookResult> {
  const config = await getConfig(input.clinicId);
  const check = validateWorkingHours(config, input.start, input.end);
  if (!check.ok) return { ok: false, error: check.reason };
  if (input.start.getTime() < Date.now() - 60_000)
    return { ok: false, error: "لا يمكن الحجز في وقت مضى" };

  const bufferMs = config.bufferMinutes * 60_000;
  const lockKey = input.clinicId * 100000 + (input.dentistId ?? 0);

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${lockKey})`);

      const windowStart = new Date(input.start.getTime() - bufferMs);
      const windowEnd = new Date(input.end.getTime() + bufferMs);

      const conflicts = await tx
        .select({ id: appointments.id, startsAt: appointments.startsAt })
        .from(appointments)
        .where(
          and(
            eq(appointments.clinicId, input.clinicId),
            input.dentistId
              ? eq(appointments.dentistId, input.dentistId)
              : sql`${appointments.dentistId} is not distinct from ${input.dentistId}`,
            sql`${appointments.status} in ('scheduled','confirmed','checked_in')`,
            lt(appointments.startsAt, windowEnd),
            gte(appointments.endsAt, windowStart),
          ),
        )
        .limit(1);

      if (conflicts.length > 0) {
        return { ok: false as const, error: "يوجد موعد آخر متعارض مع هذا الوقت" };
      }

      const inserted = await tx
        .insert(appointments)
        .values({
          clinicId: input.clinicId,
          patientId: input.patientId,
          dentistId: input.dentistId,
          treatmentId: input.treatmentId ?? null,
          startsAt: input.start,
          endsAt: input.end,
          type: input.type ?? "كشف",
          notes: input.notes ?? null,
          source: input.source ?? "staff",
          status: "scheduled",
            })
        .returning({ id: appointments.id });

      const id = inserted[0].id;
      await tx.insert(appointmentEvents).values({
        clinicId: input.clinicId,
        appointmentId: id,
        event: "created",
        details: { start: input.start.toISOString(), end: input.end.toISOString(), source: input.source ?? "staff" },
        actorLabel: input.actorLabel ?? null,
      });
      return { ok: true as const, appointmentId: id };
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message || "تعذر إنشاء الموعد" };
  }
}

export async function bookAndNotify(input: BookInput): Promise<BookResult> {
  const res = await bookAppointment(input);
  if (res.ok) await scheduleAppointmentJobs(res.appointmentId);
  return res;
}

export async function rescheduleAppointment(params: {
  clinicId: number;
  appointmentId: number;
  start: Date;
  end: Date;
  actorLabel?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const [appt] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, params.appointmentId), eq(appointments.clinicId, params.clinicId)))
    .limit(1);
  if (!appt) return { ok: false, error: "الموعد غير موجود" };
  if (["completed", "cancelled"].includes(appt.status))
    return { ok: false, error: "لا يمكن تعديل موعد مكتمل أو ملغي" };

  const config = await getConfig(params.clinicId);
  const check = validateWorkingHours(config, params.start, params.end);
  if (!check.ok) return { ok: false, error: check.reason };

  const bufferMs = config.bufferMinutes * 60_000;
  const lockKey = params.clinicId * 100000 + (appt.dentistId ?? 0);

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${lockKey})`);
    const conflicts = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.clinicId, params.clinicId),
          ne(appointments.id, params.appointmentId),
          appt.dentistId
            ? eq(appointments.dentistId, appt.dentistId)
            : sql`${appointments.dentistId} is null`,
          sql`${appointments.status} in ('scheduled','confirmed','checked_in')`,
          lt(appointments.startsAt, new Date(params.end.getTime() + bufferMs)),
          gte(appointments.endsAt, new Date(params.start.getTime() - bufferMs)),
        ),
      )
      .limit(1);
    if (conflicts.length > 0) return { ok: false, error: "يوجد موعد آخر متعارض مع هذا الوقت" };

    await tx
      .update(appointments)
      .set({ startsAt: params.start, endsAt: params.end, status: "scheduled", updatedAt: new Date() })
      .where(eq(appointments.id, params.appointmentId));
    await tx.insert(appointmentEvents).values({
      clinicId: params.clinicId,
      appointmentId: params.appointmentId,
      event: "rescheduled",
      details: { from: appt.startsAt, to: params.start.toISOString() },
      actorLabel: params.actorLabel ?? null,
    });
    return { ok: true };
  });

  if (result.ok) {
    await cancelAppointmentJobs(params.appointmentId, "rescheduled");
    await scheduleAppointmentJobs(params.appointmentId);
  }
  return result;
}

export async function changeStatus(params: {
  clinicId: number;
  appointmentId: number;
  status: string;
  actorLabel?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const allowed = ["scheduled", "confirmed", "checked_in", "completed", "cancelled", "no_show"];
  if (!allowed.includes(params.status)) return { ok: false, error: "حالة غير صالحة" };
  const updated = await db
    .update(appointments)
    .set({ status: params.status, updatedAt: new Date() })
    .where(and(eq(appointments.id, params.appointmentId), eq(appointments.clinicId, params.clinicId)))
    .returning({ id: appointments.id, patientId: appointments.patientId });
  if (updated.length === 0) return { ok: false, error: "الموعد غير موجود" };

  await db.insert(appointmentEvents).values({
    clinicId: params.clinicId,
    appointmentId: params.appointmentId,
    event: `status:${params.status}`,
    actorLabel: params.actorLabel ?? null,
  });

  if (params.status === "cancelled") await cancelAppointmentJobs(params.appointmentId, "cancelled");
  if (params.status === "completed") {
    await db
      .update(patients)
      .set({ lastVisitAt: new Date() })
      .where(eq(patients.id, updated[0].patientId));
  }
  return { ok: true };
}

export type Slot = { start: string; end: string; label: string };

/** Find free slots for a Cairo day, honoring working hours, breaks, buffers, existing bookings. */
export async function searchAvailableSlots(params: {
  clinicId: number;
  dateStr: string;
  durationMinutes: number;
  dentistId?: number | null;
  limit?: number;
}): Promise<Slot[]> {
  const config = await getConfig(params.clinicId);
  const { start: dayStart, end: dayEnd } = cairoDayBounds(params.dateStr);
  const weekday = cairoWeekday(dayStart);
  const rules = config.workingHours[weekday];
  if (!rules || rules.closed || config.holidays.includes(params.dateStr)) return [];

  const existing = await db
    .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt, dentistId: appointments.dentistId })
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, params.clinicId),
        gte(appointments.startsAt, dayStart),
        lte(appointments.startsAt, dayEnd),
        sql`${appointments.status} in ('scheduled','confirmed','checked_in')`,
      ),
    );

  const relevant = params.dentistId
    ? existing.filter((e) => e.dentistId === params.dentistId)
    : existing;

  const slots: Slot[] = [];
  const step = config.slotStepMinutes;
  const bufferMs = config.bufferMinutes * 60_000;
  const openMin = minutesOf(rules.open);
  const closeMin = minutesOf(rules.close);
  const now = Date.now();

  for (let m = openMin; m + params.durationMinutes <= closeMin; m += step) {
    const start = new Date(dayStart.getTime() + m * 60_000);
    const end = new Date(start.getTime() + params.durationMinutes * 60_000);
    if (start.getTime() < now) continue;
    const check = validateWorkingHours(config, start, end);
    if (!check.ok) continue;
    const clash = relevant.some(
      (a) =>
        new Date(a.startsAt).getTime() < end.getTime() + bufferMs &&
        new Date(a.endsAt).getTime() > start.getTime() - bufferMs,
    );
    if (clash) continue;
    slots.push({ start: start.toISOString(), end: end.toISOString(), label: `${fmtTime(start)} - ${fmtTime(end)}` });
    if (params.limit && slots.length >= params.limit) break;
  }
  return slots;
}

/** Search the next N days for the first available slots. */
export async function searchUpcomingSlots(params: {
  clinicId: number;
  fromDate?: string;
  days?: number;
  durationMinutes?: number;
  dentistId?: number | null;
  perDay?: number;
}): Promise<Array<{ date: string; slots: Slot[] }>> {
  const from = params.fromDate ?? cairoDayString();
  const days = params.days ?? 7;
  const out: Array<{ date: string; slots: Slot[] }> = [];
  for (let i = 0; i < days; i++) {
    const dateStr = cairoDayString(new Date(cairoToUtc(from, "12:00").getTime() + i * 86400000));
    const slots = await searchAvailableSlots({
      clinicId: params.clinicId,
      dateStr,
      durationMinutes: params.durationMinutes ?? 30,
      dentistId: params.dentistId ?? null,
      limit: params.perDay ?? 6,
    });
    if (slots.length) out.push({ date: dateStr, slots });
  }
  return out;
}

export const statusLabels: Record<string, string> = {
  scheduled: "محجوز",
  confirmed: "مؤكد",
  checked_in: "تم الوصول",
  completed: "مكتمل",
  cancelled: "ملغي",
  no_show: "لم يحضر",
};

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export const _internal = { minutesOf, or };
