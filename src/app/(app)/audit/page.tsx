import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/access";
import { fmtDateTime } from "@/lib/time";
import { Badge, EmptyState, PageHeader, Stat, Table, Td } from "@/components/ui";

export const dynamic = "force-dynamic";

const ENTITY_AR: Record<string, string> = {
  patient: "مريض",
  appointment: "موعد",
  visit: "زيارة",
  invoice: "فاتورة",
  payment: "دفعة",
  expense: "مصروف",
  dentist: "طبيب",
  treatment: "علاج",
  clinic_settings: "إعدادات",
};

export default async function AuditPage() {
  const user = await requirePermission("audit.read");
  const rows = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.clinicId, user.clinicId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);

  return (
    <div className="space-y-1">
      <PageHeader
        icon="🛡️"
        title="سجل العمليات"
        subtitle={`آخر ${rows.length} عملية — بدون أي بيانات طبية حساسة`}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي العمليات" value={rows.length} icon="🛡️" tone="teal" />
        <Stat label="عمليات إنشاء" value={rows.filter((r) => r.action.startsWith("create")).length} icon="➕" tone="good" />
        <Stat label="تعديلات" value={rows.filter((r) => r.action.includes("update") || r.action.includes("status")).length} icon="✏️" tone="warn" />
        <Stat label="عمليات مالية" value={rows.filter((r) => ["payment", "invoice", "expense"].includes(r.entity)).length} icon="💰" tone="indigo" />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="🛡️" title="لا توجد عمليات مسجلة" />
      ) : (
        <Table head={["الوقت", "المستخدم", "العملية", "الكيان", "المعرف", "تفاصيل"]}>
          {rows.map((l) => (
            <tr key={l.id}>
              <Td>{fmtDateTime(l.createdAt)}</Td>
              <Td>{l.actorLabel ?? "النظام"}</Td>
              <Td><Badge tone={l.action.startsWith("create") ? "green" : l.action.includes("cancel") || l.action.includes("refund") ? "red" : l.action.includes("update") || l.action.includes("status") ? "amber" : "blue"}>{l.action}</Badge></Td>
              <Td className="font-bold text-slate-700">{ENTITY_AR[l.entity] ?? l.entity}</Td>
              <Td>{l.entityId ?? "—"}</Td>
              <Td className="max-w-60 truncate text-xs text-slate-500">
                {l.metadata ? JSON.stringify(l.metadata) : "—"}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
