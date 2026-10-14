import "server-only";
import { getClinicId } from "@/lib/clinic";

/**
 * ⚠️ OPEN-ACCESS BUILD — لا يوجد تسجيل دخول ولا حسابات مستخدمين.
 *
 * كل الصفحات والعمليات متاحة لمن يستطيع الوصول إلى التطبيق. هذه الطبقة
 * توفّر "سياق العيادة" (clinic context) الذي تعتمد عليه كل الاستعلامات
 * لضمان عزل البيانات على مستوى العيادة، مع تسجيل العمليات في سجل التدقيق
 * باسم عام (فريق العيادة).
 *
 * يجب نشر التطبيق خلف شبكة موثوقة أو حماية على مستوى الاستضافة
 * (Vercel Password Protection / IP allowlist) — راجع SECURITY.md.
 */
export type AccessContext = {
  clinicId: number;
  /** اسم عام يُستخدم في سجلات التدقيق بدل هوية المستخدم */
  actorLabel: string;
};

export async function requireClinic(): Promise<AccessContext> {
  const clinicId = await getClinicId();
  return { clinicId, actorLabel: "فريق العيادة" };
}

/** متوافق مع نداءات الصفحات: يعيد سياق العيادة فقط. */
export async function requireUser(): Promise<{ clinicId: number; fullName: string }> {
  const { clinicId, actorLabel } = await requireClinic();
  return { clinicId, fullName: actorLabel };
}

export async function requirePermission(_permission?: unknown): Promise<{ clinicId: number; fullName: string }> {
  return requireUser();
}

/** لا توجد أدوار في هذا الإصدار: كل العمليات مسموح بها. */
export function can(..._args: unknown[]): boolean {
  return true;
}

export async function authorize(_permission?: unknown): Promise<{
  ok: true;
  error?: string;
  user: { clinicId: number; fullName: string };
}> {
  return { ok: true, user: await requireUser() };
}
