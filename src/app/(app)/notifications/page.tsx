import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationJobs, notificationLogs } from "@/db/schema";
import { requirePermission } from "@/lib/access";
import { fmtDateTime } from "@/lib/time";
import { Alert, Badge, Card, EmptyState, PageHeader, SectionTitle, Stat, Table, Td, statusTone } from "@/components/ui";

export const dynamic = "force-dynamic";

const KIND_AR: Record<string, string> = {
  confirmation: "تأكيد الحجز",
  reminder_24h: "تذكير قبل 24 ساعة",
  reminder_2h: "تذكير قبل ساعتين",
  cancelled: "إشعار إلغاء",
  rescheduled: "إشعار تأجيل",
  followup: "متابعة بعد الزيارة",
};

export default async function NotificationsPage() {
  const user = await requirePermission("notifications.read");
  const [jobs, logs] = await Promise.all([
    db.select().from(notificationJobs).where(eq(notificationJobs.clinicId, user.clinicId)).orderBy(desc(notificationJobs.scheduledFor)).limit(50),
    db.select().from(notificationLogs).where(eq(notificationLogs.clinicId, user.clinicId)).orderBy(desc(notificationLogs.createdAt)).limit(50),
  ]);

  const providerReady = Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

  return (
    <div className="space-y-1">
      <PageHeader
        icon="🔔"
        title="التذكيرات والرسائل"
        subtitle="تُجدول تلقائيًا عند الحجز وتُعالج عبر مهمة مجدولة (Cron) على الخادم"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي المهام" value={jobs.length} icon="📬" tone="teal" />
        <Stat label="في الانتظار" value={jobs.filter((j) => j.status === "pending").length} icon="⏳" tone="warn" />
        <Stat label="تم إرسالها" value={jobs.filter((j) => j.status === "sent").length} icon="✅" tone="good" />
        <Stat label="فشلت" value={jobs.filter((j) => j.status === "failed").length} icon="⛔" tone="bad" />
      </div>
      {providerReady ? (
        <Alert kind="success">تكامل واتساب مُفعّل ببيانات اعتماد حقيقية.</Alert>
      ) : (
        <Alert kind="info">
          لم يتم ضبط بيانات اعتماد واتساب/البريد. النظام يستخدم محوّل التطوير (تسجيل الرسائل في سجلات الخادم فقط) —
          لم يتم إرسال أي رسالة فعلية للمرضى.
        </Alert>
      )}

      <Card className="mt-4" tone="indigo">
        <SectionTitle icon="📅">المهام المجدولة</SectionTitle>
        {jobs.length === 0 ? (
          <EmptyState icon="🔕" title="لا توجد مهام تذكير" hint="تُنشأ تلقائيًا عند حجز موعد جديد." />
        ) : (
          <Table head={["النوع", "القناة", "موعد الإرسال", "الحالة", "المحاولات", "آخر خطأ"]}>
            {jobs.map((j) => (
              <tr key={j.id}>
                <Td className="font-bold text-slate-700">{KIND_AR[j.kind] ?? j.kind}</Td>
                <Td><Badge tone={j.channel === "whatsapp" ? "green" : j.channel === "sms" ? "blue" : "indigo"}>{j.channel === "whatsapp" ? "💬 واتساب" : j.channel === "sms" ? "📱 SMS" : j.channel === "email" ? "✉️ بريد" : j.channel}</Badge></Td>
                <Td>{fmtDateTime(j.scheduledFor)}</Td>
                <Td>
                  <Badge tone={statusTone[j.status] ?? "slate"}>{j.status}</Badge>
                </Td>
                <Td>{j.attempts}</Td>
                <Td className="max-w-40 truncate text-xs text-rose-600">{j.lastError ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card className="mt-4" tone="teal">
        <SectionTitle icon="📨">سجل الإرسال الفعلي</SectionTitle>
        {logs.length === 0 ? (
          <EmptyState icon="📭" title="لا توجد رسائل مرسلة" />
        ) : (
          <Table head={["الوقت", "القناة", "المزود", "الحالة", "الوجهة"]}>
            {logs.map((l) => (
              <tr key={l.id}>
                <Td>{fmtDateTime(l.createdAt)}</Td>
                <Td>{l.channel}</Td>
                <Td>{l.providerName}</Td>
                <Td>
                  <Badge tone={l.status === "delivered" ? "green" : l.status === "failed" ? "red" : "amber"}>
                    {l.status === "provider_accepted" ? "قبلها المزود" : l.status === "delivered" ? "تم التسليم" : l.status}
                  </Badge>
                </Td>
                <Td className="font-mono text-xs">{`***${l.destination.slice(-4)}`}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
