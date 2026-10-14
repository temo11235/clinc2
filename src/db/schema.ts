import {
  pgTable,
  serial,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Clinics & users                                                     */
/* ------------------------------------------------------------------ */

export const clinics = pgTable("clinics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  mapsUrl: text("maps_url"),
  logoUrl: text("logo_url"),
  currency: text("currency").notNull().default("EGP"),
  timezone: text("timezone").notNull().default("Africa/Cairo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Dentists / practitioners directory (no login accounts in this build). */
export const dentists = pgTable(
  "dentists",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    specialty: text("specialty"),
    phone: text("phone"),
    color: text("color"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dentists_clinic_idx").on(t.clinicId)],
);

export const clinicSettings = pgTable(
  "clinic_settings",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("clinic_settings_unique").on(t.clinicId, t.key)],
);

/* ------------------------------------------------------------------ */
/* Patients                                                            */
/* ------------------------------------------------------------------ */

export const patients = pgTable(
  "patients",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    birthDate: date("birth_date"),
    gender: text("gender"),
    address: text("address"),
    emergencyContact: text("emergency_contact"),
    medicalHistory: text("medical_history"),
    allergies: text("allergies"),
    medications: text("medications"),
    conditions: text("conditions"),
    notes: text("notes"),
    preferredChannel: text("preferred_channel").notNull().default("whatsapp"),
    marketingOptOut: boolean("marketing_opt_out").notNull().default(false),
    lastVisitAt: timestamp("last_visit_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("patients_clinic_code_unique").on(t.clinicId, t.code),
    uniqueIndex("patients_clinic_phone_unique").on(t.clinicId, t.phone),
    index("patients_name_idx").on(t.clinicId, t.fullName),
  ],
);

export const patientConsents = pgTable("patient_consents", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull(),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  granted: boolean("granted").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Treatments & appointments                                           */
/* ------------------------------------------------------------------ */

export const treatmentCatalog = pgTable(
  "treatment_catalog",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    category: text("category"),
    /** price in piasters (EGP minor units) */
    priceMinor: bigint("price_minor", { mode: "number" }).notNull().default(0),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("treatment_clinic_idx").on(t.clinicId)],
);

/** status: scheduled | confirmed | checked_in | completed | cancelled | no_show */
export const appointments = pgTable(
  "appointments",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    dentistId: integer("dentist_id").references(() => dentists.id),
    treatmentId: integer("treatment_id").references(() => treatmentCatalog.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("scheduled"),
    type: text("type").notNull().default("كشف"),
    notes: text("notes"),
    source: text("source").notNull().default("staff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appointments_clinic_start_idx").on(t.clinicId, t.startsAt),
    index("appointments_patient_idx").on(t.patientId),
  ],
);

export const appointmentEvents = pgTable("appointment_events", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull(),
  appointmentId: integer("appointment_id")
    .notNull()
    .references(() => appointments.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  details: jsonb("details"),
  actorLabel: text("actor_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Clinical records                                                    */
/* ------------------------------------------------------------------ */

export const visits = pgTable(
  "visits",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id").notNull(),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    appointmentId: integer("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    dentistId: integer("dentist_id").references(() => dentists.id),
    visitDate: timestamp("visit_date", { withTimezone: true }).notNull().defaultNow(),
    chiefComplaint: text("chief_complaint"),
    examination: text("examination"),
    diagnosis: text("diagnosis"),
    treatmentPlan: text("treatment_plan"),
    followUp: text("follow_up"),
    prescription: text("prescription"),
    locked: boolean("locked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("visits_patient_idx").on(t.patientId)],
);

/** procedures performed inside a visit, optionally tooth-specific */
export const visitProcedures = pgTable("visit_procedures", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull(),
  visitId: integer("visit_id")
    .notNull()
    .references(() => visits.id, { onDelete: "cascade" }),
  patientId: integer("patient_id").notNull(),
  treatmentId: integer("treatment_id").references(() => treatmentCatalog.id),
  title: text("title").notNull(),
  toothNumber: integer("tooth_number"),
  surfaces: text("surfaces"),
  status: text("status").notNull().default("completed"),
  materials: text("materials"),
  notes: text("notes"),
  priceMinor: bigint("price_minor", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clinicalAttachments = pgTable("clinical_attachments", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull(),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id, { onDelete: "cascade" }),
  visitId: integer("visit_id").references(() => visits.id, { onDelete: "set null" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  storageKey: text("storage_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Finance (all amounts in piasters / minor units)                     */
/* ------------------------------------------------------------------ */

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id").notNull(),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "restrict" }),
    visitId: integer("visit_id").references(() => visits.id, { onDelete: "set null" }),
    number: text("number").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull().default(0),
    discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull().default(0),
    /** draft | finalized | cancelled */
    status: text("status").notNull().default("draft"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_clinic_number_unique").on(t.clinicId, t.number),
    index("invoices_patient_idx").on(t.patientId),
  ],
);

export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  treatmentId: integer("treatment_id").references(() => treatmentCatalog.id),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull().default(0),
  totalMinor: bigint("total_minor", { mode: "number" }).notNull().default(0),
  toothNumber: integer("tooth_number"),
});

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id").notNull(),
    patientId: integer("patient_id").notNull(),
    invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    method: text("method").notNull().default("cash"),
    reference: text("reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_clinic_date_idx").on(t.clinicId, t.paidAt)],
);

export const refunds = pgTable("refunds", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull(),
  patientId: integer("patient_id").notNull(),
  paymentId: integer("payment_id").references(() => payments.id, { onDelete: "set null" }),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  reason: text("reason"),
  refundedAt: timestamp("refunded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    spentAt: timestamp("spent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("expenses_clinic_date_idx").on(t.clinicId, t.spentAt)],
);

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export const notificationJobs = pgTable(
  "notification_jobs",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id").notNull(),
    appointmentId: integer("appointment_id").references(() => appointments.id, {
      onDelete: "cascade",
    }),
    patientId: integer("patient_id").notNull(),
    /** confirmation | reminder_24h | reminder_2h | cancelled | rescheduled | followup */
    kind: text("kind").notNull(),
    channel: text("channel").notNull().default("whatsapp"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    /** pending | sent | failed | skipped */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_jobs_dedupe_unique").on(t.dedupeKey),
    index("notification_jobs_due_idx").on(t.status, t.scheduledFor),
  ],
);

export const notificationLogs = pgTable("notification_logs", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull(),
  jobId: integer("job_id").references(() => notificationJobs.id, { onDelete: "set null" }),
  patientId: integer("patient_id"),
  channel: text("channel").notNull(),
  destination: text("destination").notNull(),
  body: text("body").notNull(),
  /** queued | provider_accepted | delivered | failed */
  status: text("status").notNull(),
  providerName: text("provider_name").notNull(),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull(),
  publicId: text("public_id").notNull(),
  channel: text("channel").notNull().default("web"),
  patientId: integer("patient_id").references(() => patients.id, { onDelete: "set null" }),
  verifiedPhone: text("verified_phone"),
  escalated: boolean("escalated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => aiConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiToolAuditLogs = pgTable("ai_tool_audit_logs", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull(),
  conversationId: integer("conversation_id").references(() => aiConversations.id, {
    onDelete: "cascade",
  }),
  toolName: text("tool_name").notNull(),
  args: jsonb("args"),
  success: boolean("success").notNull(),
  result: jsonb("result"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id").notNull(),
    actorLabel: text("actor_label"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_clinic_idx").on(t.clinicId, t.createdAt)],
);
