-- Database-level safeguards applied after `drizzle-kit push`.
-- Run: psql "$DATABASE_URL" -f scripts/constraints.sql

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping active appointments for the same dentist at the DB level.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    clinic_id WITH =,
    dentist_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('scheduled', 'confirmed', 'checked_in') AND dentist_id IS NOT NULL);

-- Money must never be negative.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_positive;
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount_minor > 0);

ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_amount_positive;
ALTER TABLE refunds ADD CONSTRAINT refunds_amount_positive CHECK (amount_minor > 0);

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_amount_positive;
ALTER TABLE expenses ADD CONSTRAINT expenses_amount_positive CHECK (amount_minor > 0);

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_totals_valid;
ALTER TABLE invoices ADD CONSTRAINT invoices_totals_valid
  CHECK (subtotal_minor >= 0 AND discount_minor >= 0 AND total_minor >= 0 AND total_minor = subtotal_minor - discount_minor);

-- Appointment time sanity.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_time_valid;
ALTER TABLE appointments ADD CONSTRAINT appointments_time_valid CHECK (ends_at > starts_at);

-- Allowed status values.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_valid;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_valid
  CHECK (status IN ('scheduled','confirmed','checked_in','completed','cancelled','no_show'));

-- فهارس تسريع حسابات الأرصدة والتقارير
CREATE INDEX IF NOT EXISTS invoices_patient_status_idx ON invoices (patient_id, status) INCLUDE (total_minor);
CREATE INDEX IF NOT EXISTS payments_patient_idx ON payments (patient_id) INCLUDE (amount_minor);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments (invoice_id) INCLUDE (amount_minor);
CREATE INDEX IF NOT EXISTS refunds_payment_idx ON refunds (payment_id);
CREATE INDEX IF NOT EXISTS visits_clinic_date_idx ON visits (clinic_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS visit_procedures_patient_idx ON visit_procedures (patient_id);
CREATE INDEX IF NOT EXISTS appointments_patient_status_idx ON appointments (patient_id, status);
CREATE INDEX IF NOT EXISTS notification_logs_clinic_idx ON notification_logs (clinic_id, created_at DESC);
