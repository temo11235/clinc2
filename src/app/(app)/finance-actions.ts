"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { expenses, invoiceItems, invoices, patients, payments, refunds, treatmentCatalog } from "@/db/schema";
import { authorize } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { invoiceTotals, toMinor } from "@/lib/money";

export type FinanceState = { error?: string; success?: string; id?: number };

/* ------------------------------ catalog ------------------------------ */

export async function saveTreatmentAction(_prev: FinanceState, formData: FormData): Promise<FinanceState> {
  const auth = await authorize("settings.write");
  if (!auth.ok) return { error: auth.error };
  const schema = z.object({
    id: z.coerce.number().int().optional(),
    nameAr: z.string().trim().min(2, "اسم العلاج مطلوب"),
    nameEn: z.string().optional(),
    category: z.string().optional(),
    price: z.string().default("0"),
    durationMinutes: z.coerce.number().int().min(5).max(480).default(30),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const values = {
    clinicId: auth.user.clinicId,
    nameAr: d.nameAr,
    nameEn: d.nameEn || null,
    category: d.category || null,
    priceMinor: toMinor(d.price),
    durationMinutes: d.durationMinutes,
  };
  if (d.id) {
    await db
      .update(treatmentCatalog)
      .set(values)
      .where(and(eq(treatmentCatalog.id, d.id), eq(treatmentCatalog.clinicId, auth.user.clinicId)));
  } else {
    await db.insert(treatmentCatalog).values(values);
  }
  await logAudit({ clinicId: auth.user.clinicId,  action: d.id ? "update" : "create", entity: "treatment", entityId: d.id ?? null });
  revalidatePath("/catalog");
  return { success: "تم حفظ العلاج" };
}

export async function toggleTreatmentAction(formData: FormData): Promise<void> {
  const auth = await authorize("settings.write");
  if (!auth.ok) return;
  const id = Number(formData.get("id"));
  await db
    .update(treatmentCatalog)
    .set({ isActive: sql`not ${treatmentCatalog.isActive}` })
    .where(and(eq(treatmentCatalog.id, id), eq(treatmentCatalog.clinicId, auth.user.clinicId)));
  revalidatePath("/catalog");
}

/* ------------------------------ invoices ------------------------------ */

export async function createInvoiceAction(_prev: FinanceState, formData: FormData): Promise<FinanceState> {
  const auth = await authorize("finance.write");
  if (!auth.ok) return { error: auth.error };
  const patientId = Number(formData.get("patientId"));
  const visitId = Number(formData.get("visitId")) || null;
  if (!patientId) return { error: "اختر المريض" };

  const [patient] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, auth.user.clinicId)))
    .limit(1);
  if (!patient) return { error: "المريض غير موجود" };

  const descriptions = formData.getAll("description").map(String);
  const quantities = formData.getAll("quantity").map((v) => Number(v) || 1);
  const prices = formData.getAll("unitPrice").map((v) => toMinor(String(v)));
  const items = descriptions
    .map((description, i) => ({ description, quantity: quantities[i] ?? 1, unitPriceMinor: prices[i] ?? 0 }))
    .filter((i) => i.description.trim().length > 0);
  if (items.length === 0) return { error: "أضف بندًا واحدًا على الأقل" };

  const discountMinor = toMinor(String(formData.get("discount") ?? "0"));
  if (discountMinor > 0 && !true)
    return { error: "الخصم يحتاج اعتماد المالك أو المحاسب" };

  const totals = invoiceTotals(items, discountMinor);
  const number = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

  const invoiceId = await db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(invoices)
      .values({
        clinicId: auth.user.clinicId,
        patientId,
        visitId,
        number,
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountMinor,
        totalMinor: totals.totalMinor,
        status: "draft",
      })
      .returning({ id: invoices.id });
    await tx.insert(invoiceItems).values(
      items.map((i) => ({
        clinicId: auth.user.clinicId,
        invoiceId: inv.id,
        description: i.description,
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor,
        totalMinor: i.unitPriceMinor * i.quantity,
      })),
    );
    return inv.id;
  });

  await logAudit({ clinicId: auth.user.clinicId,  actorLabel: auth.user.fullName, action: "create", entity: "invoice", entityId: invoiceId, metadata: { totalMinor: totals.totalMinor } });
  revalidatePath("/invoices");
  return { success: "تم إنشاء الفاتورة", id: invoiceId };
}

export async function finalizeInvoiceAction(formData: FormData): Promise<void> {
  const auth = await authorize("finance.write");
  if (!auth.ok) return;
  const id = Number(formData.get("invoiceId"));
  await db
    .update(invoices)
    .set({ status: "finalized", updatedAt: new Date() })
    .where(and(eq(invoices.id, id), eq(invoices.clinicId, auth.user.clinicId), eq(invoices.status, "draft")));
  await logAudit({ clinicId: auth.user.clinicId,  actorLabel: auth.user.fullName, action: "finalize", entity: "invoice", entityId: id });
  revalidatePath(`/invoices/${id}`);
}

export async function cancelInvoiceAction(formData: FormData): Promise<void> {
  const auth = await authorize("finance.approve");
  if (!auth.ok) return;
  const id = Number(formData.get("invoiceId"));
  await db
    .update(invoices)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(invoices.id, id), eq(invoices.clinicId, auth.user.clinicId), eq(invoices.status, "draft")));
  await logAudit({ clinicId: auth.user.clinicId,  action: "cancel", entity: "invoice", entityId: id });
  revalidatePath(`/invoices/${id}`);
}

/* ------------------------------ payments ------------------------------ */

export async function addPaymentAction(_prev: FinanceState, formData: FormData): Promise<FinanceState> {
  const auth = await authorize("finance.write");
  if (!auth.ok) return { error: auth.error };
  const invoiceId = Number(formData.get("invoiceId")) || null;
  const patientId = Number(formData.get("patientId"));
  const amountMinor = toMinor(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  if (amountMinor <= 0) return { error: "أدخل مبلغًا صحيحًا" };
  if (!patientId) return { error: "المريض مطلوب" };

  if (invoiceId) {
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.clinicId, auth.user.clinicId)))
      .limit(1);
    if (!inv) return { error: "الفاتورة غير موجودة" };
    if (inv.status !== "finalized") return { error: "لا يمكن التحصيل على فاتورة غير نهائية" };
    const [{ paid }] = await db
      .select({ paid: sql<number>`coalesce(sum(${payments.amountMinor}),0)::bigint` })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    if (Number(paid) + amountMinor > inv.totalMinor)
      return { error: "المبلغ يتجاوز رصيد الفاتورة المتبقي" };
  }

  const [created] = await db
    .insert(payments)
    .values({
      clinicId: auth.user.clinicId,
      patientId,
      invoiceId,
      amountMinor,
      method,
      reference: String(formData.get("reference") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
    })
    .returning({ id: payments.id });

  await logAudit({ clinicId: auth.user.clinicId,  actorLabel: auth.user.fullName, action: "payment", entity: "payment", entityId: created.id, metadata: { amountMinor, method } });
  revalidatePath("/payments");
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  return { success: "تم تسجيل الدفعة", id: created.id };
}

export async function addRefundAction(_prev: FinanceState, formData: FormData): Promise<FinanceState> {
  const auth = await authorize("finance.approve");
  if (!auth.ok) return { error: auth.error };
  const paymentId = Number(formData.get("paymentId"));
  const amountMinor = toMinor(String(formData.get("amount") ?? "0"));
  if (!paymentId || amountMinor <= 0) return { error: "بيانات المرتجع غير صحيحة" };
  const [pay] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.clinicId, auth.user.clinicId)))
    .limit(1);
  if (!pay) return { error: "الدفعة غير موجودة" };
  const [{ refunded }] = await db
    .select({ refunded: sql<number>`coalesce(sum(${refunds.amountMinor}),0)::bigint` })
    .from(refunds)
    .where(eq(refunds.paymentId, paymentId));
  if (Number(refunded) + amountMinor > pay.amountMinor) return { error: "مبلغ المرتجع يتجاوز قيمة الدفعة" };

  await db.insert(refunds).values({
    clinicId: auth.user.clinicId,
    patientId: pay.patientId,
    paymentId,
    amountMinor,
    reason: String(formData.get("reason") ?? "") || null,
  });
  await logAudit({ clinicId: auth.user.clinicId,  actorLabel: auth.user.fullName, action: "refund", entity: "payment", entityId: paymentId, metadata: { amountMinor } });
  revalidatePath("/payments");
  return { success: "تم تسجيل المرتجع" };
}

/* ------------------------------ expenses ------------------------------ */

export async function addExpenseAction(_prev: FinanceState, formData: FormData): Promise<FinanceState> {
  const auth = await authorize("finance.write");
  if (!auth.ok) return { error: auth.error };
  const amountMinor = toMinor(String(formData.get("amount") ?? "0"));
  const category = String(formData.get("category") ?? "").trim();
  if (!category) return { error: "بند المصروف مطلوب" };
  if (amountMinor <= 0) return { error: "أدخل مبلغًا صحيحًا" };
  const spentAt = String(formData.get("spentAt") ?? "");
  await db.insert(expenses).values({
    clinicId: auth.user.clinicId,
    category,
    description: String(formData.get("description") ?? "") || null,
    amountMinor,
    spentAt: spentAt ? new Date(`${spentAt}T12:00:00Z`) : new Date(),
  });
  await logAudit({ clinicId: auth.user.clinicId,  action: "create", entity: "expense", metadata: { amountMinor, category } });
  revalidatePath("/expenses");
  return { success: "تم تسجيل المصروف" };
}
