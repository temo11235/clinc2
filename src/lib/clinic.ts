import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clinics, dentists } from "@/db/schema";

/**
 * This build runs WITHOUT authentication or user accounts:
 * it is a single-clinic internal system. The active clinic is resolved
 * from CLINIC_ID (default 1) and auto-created on first run.
 *
 * ⚠️ Because there is no login layer, the app must only be exposed on a
 * trusted network / protected deployment (see SECURITY.md).
 */
export const CLINIC_ID = Number(process.env.CLINIC_ID ?? process.env.PUBLIC_CLINIC_ID ?? 1);

let ensured = false;

export async function getClinicId(): Promise<number> {
  if (ensured) return CLINIC_ID;
  const rows = await db.select({ id: clinics.id }).from(clinics).where(eq(clinics.id, CLINIC_ID)).limit(1);
  if (rows.length === 0) {
    await db.execute(
      // keep the serial sequence consistent when inserting an explicit id
      (await import("drizzle-orm")).sql`
        insert into clinics (id, name, phone, address)
        values (${CLINIC_ID}, 'عيادة الأسنان', NULL, NULL)
        on conflict (id) do nothing;
        select setval(pg_get_serial_sequence('clinics','id'), greatest((select max(id) from clinics), 1));
      `,
    );
  }
  ensured = true;
  return CLINIC_ID;
}

export async function listDentists(clinicId: number) {
  return db
    .select()
    .from(dentists)
    .where(eq(dentists.clinicId, clinicId))
    .orderBy(asc(dentists.fullName));
}

export async function activeDentists(clinicId: number) {
  const rows = await listDentists(clinicId);
  return rows.filter((d) => d.isActive);
}
