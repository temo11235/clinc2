/**
 * اختبارات تكامل تعمل على قاعدة بيانات حقيقية (DATABASE_URL).
 * تُنشئ عيادة اختبار مستقلة وتحذف بياناتها في النهاية.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
const client = new Client({ connectionString: url });

let clinicId = 0;
let otherClinicId = 0;
let dentistId = 0;
let patientId = 0;

beforeAll(async () => {
  await client.connect();
  const c1 = await client.query(`insert into clinics (name) values ('عيادة اختبار أ') returning id`);
  clinicId = c1.rows[0].id;
  const c2 = await client.query(`insert into clinics (name) values ('عيادة اختبار ب') returning id`);
  otherClinicId = c2.rows[0].id;
  const d = await client.query(`insert into dentists (clinic_id, full_name) values ($1,'د. اختبار') returning id`, [clinicId]);
  dentistId = d.rows[0].id;
  const p = await client.query(
    `insert into patients (clinic_id, code, full_name, phone) values ($1,'T-1','مريض اختبار','+201099999999') returning id`,
    [clinicId],
  );
  patientId = p.rows[0].id;
});

afterAll(async () => {
  const ids = [clinicId, otherClinicId];
  for (const table of [
    "notification_logs",
    "notification_jobs",
    "refunds",
    "payments",
    "invoice_items",
    "invoices",
    "clinical_attachments",
    "patient_consents",
    "visit_procedures",
    "visits",
    "appointment_events",
    "appointments",
    "patients",
    "dentists",
    "expenses",
    "audit_logs",
  ]) {
    await client.query(`delete from ${table} where clinic_id = any($1)`, [ids]);
  }
  await client.query(`delete from clinics where id = any($1)`, [ids]);
  await client.end();
});

const base = new Date(Date.now() + 86400000);
base.setUTCHours(9, 0, 0, 0);
const plus = (min: number) => new Date(base.getTime() + min * 60000);

describe("قاعدة البيانات تمنع تعارض المواعيد", () => {
  it("تسمح بالموعد الأول", async () => {
    const r = await client.query(
      `insert into appointments (clinic_id, patient_id, dentist_id, starts_at, ends_at, status)
       values ($1,$2,$3,$4,$5,'scheduled') returning id`,
      [clinicId, patientId, dentistId, base, plus(30)],
    );
    expect(r.rows[0].id).toBeGreaterThan(0);
  });

  it("ترفض موعدًا متداخلًا لنفس الطبيب", async () => {
    await expect(
      client.query(
        `insert into appointments (clinic_id, patient_id, dentist_id, starts_at, ends_at, status)
         values ($1,$2,$3,$4,$5,'scheduled')`,
        [clinicId, patientId, dentistId, plus(15), plus(45)],
      ),
    ).rejects.toThrow();
  });

  it("تسمح بموعد متتالٍ غير متداخل", async () => {
    const r = await client.query(
      `insert into appointments (clinic_id, patient_id, dentist_id, starts_at, ends_at, status)
       values ($1,$2,$3,$4,$5,'scheduled') returning id`,
      [clinicId, patientId, dentistId, plus(30), plus(60)],
    );
    expect(r.rows[0].id).toBeGreaterThan(0);
  });

  it("ترفض موعدًا نهايته قبل بدايته", async () => {
    await expect(
      client.query(
        `insert into appointments (clinic_id, patient_id, dentist_id, starts_at, ends_at, status)
         values ($1,$2,$3,$4,$5,'scheduled')`,
        [clinicId, patientId, dentistId, plus(120), plus(90)],
      ),
    ).rejects.toThrow();
  });

  it("ترفض حالة غير معروفة", async () => {
    await expect(
      client.query(
        `insert into appointments (clinic_id, patient_id, dentist_id, starts_at, ends_at, status)
         values ($1,$2,$3,$4,$5,'unknown_status')`,
        [clinicId, patientId, dentistId, plus(200), plus(230)],
      ),
    ).rejects.toThrow();
  });
});

describe("قيود البيانات المالية", () => {
  it("ترفض دفعة بمبلغ صفر أو سالب", async () => {
    await expect(
      client.query(`insert into payments (clinic_id, patient_id, amount_minor) values ($1,$2,0)`, [clinicId, patientId]),
    ).rejects.toThrow();
  });

  it("ترفض فاتورة بإجمالي غير متسق", async () => {
    await expect(
      client.query(
        `insert into invoices (clinic_id, patient_id, number, subtotal_minor, discount_minor, total_minor)
         values ($1,$2,'BAD-1',10000,0,9999)`,
        [clinicId, patientId],
      ),
    ).rejects.toThrow();
  });

  it("تقبل فاتورة متسقة وتحسب الرصيد بدقة", async () => {
    const inv = await client.query(
      `insert into invoices (clinic_id, patient_id, number, subtotal_minor, discount_minor, total_minor, status)
       values ($1,$2,'OK-1',100000,10000,90000,'finalized') returning id`,
      [clinicId, patientId],
    );
    await client.query(
      `insert into payments (clinic_id, patient_id, invoice_id, amount_minor, method) values ($1,$2,$3,40000,'cash')`,
      [clinicId, patientId, inv.rows[0].id],
    );
    const r = await client.query(
      `select (select total_minor from invoices where id = $1)
              - coalesce((select sum(amount_minor) from payments where invoice_id = $1),0) as remaining`,
      [inv.rows[0].id],
    );
    expect(Number(r.rows[0].remaining)).toBe(50000);
  });
});

describe("عزل بيانات العيادات", () => {
  it("لا تظهر بيانات عيادة داخل استعلام عيادة أخرى", async () => {
    const r = await client.query(`select count(*)::int as c from patients where clinic_id = $1`, [otherClinicId]);
    expect(r.rows[0].c).toBe(0);
  });

  it("يمنع تكرار رقم الهاتف داخل نفس العيادة", async () => {
    await expect(
      client.query(
        `insert into patients (clinic_id, code, full_name, phone) values ($1,'T-2','مكرر','+201099999999')`,
        [clinicId],
      ),
    ).rejects.toThrow();
  });

  it("يسمح بنفس الرقم في عيادة مختلفة", async () => {
    const r = await client.query(
      `insert into patients (clinic_id, code, full_name, phone) values ($1,'T-3','مريض آخر','+201099999999') returning id`,
      [otherClinicId],
    );
    expect(r.rows[0].id).toBeGreaterThan(0);
  });
});

describe("منع تكرار رسائل التذكير", () => {
  it("لا يُنشئ مهمتين بنفس مفتاح التكرار", async () => {
    const key = `test-dedupe-${Date.now()}`;
    await client.query(
      `insert into notification_jobs (clinic_id, patient_id, kind, channel, scheduled_for, dedupe_key)
       values ($1,$2,'reminder_24h','whatsapp', now(), $3)`,
      [clinicId, patientId, key],
    );
    const second = await client.query(
      `insert into notification_jobs (clinic_id, patient_id, kind, channel, scheduled_for, dedupe_key)
       values ($1,$2,'reminder_24h','whatsapp', now(), $3)
       on conflict (dedupe_key) do nothing returning id`,
      [clinicId, patientId, key],
    );
    expect(second.rowCount).toBe(0);
  });
});
