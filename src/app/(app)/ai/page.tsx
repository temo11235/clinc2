import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiToolAuditLogs } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { providerConfigured, recentConversations } from "@/lib/ai/agent";
import { getConfig } from "@/lib/settings";
import { fmtDateTime } from "@/lib/time";
import { Alert, Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { AiChat } from "@/components/ai-chat";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const user = await requireUser();
  const config = await getConfig(user.clinicId);
  const [conversations, toolLogs] = await Promise.all([
    recentConversations(user.clinicId, 15),
    db
      .select()
      .from(aiToolAuditLogs)
      .where(eq(aiToolAuditLogs.clinicId, user.clinicId))
      .orderBy(desc(aiToolAuditLogs.createdAt))
      .limit(30),
  ]);

  return (
    <div>
      <PageHeader
        title="المساعد الذكي (الاستقبال الافتراضي)"
        subtitle="يعمل على الخادم فقط، ويستدعي أدوات حقيقية مرتبطة بقاعدة البيانات"
      />

      {providerConfigured() ? (
        <Alert kind="success">مزود الذكاء الاصطناعي مُفعّل ({process.env.ANTHROPIC_API_KEY ? "Anthropic" : "OpenAI"}).</Alert>
      ) : (
        <Alert kind="info">
          لم يتم ضبط مفتاح مزود الذكاء الاصطناعي. المساعد يعمل حاليًا بالوضع الاحتياطي (ردود مبنية على قواعد +
          بيانات حقيقية للمواعيد والأسعار). أضف ANTHROPIC_API_KEY أو OPENAI_API_KEY لتفعيل الحجز الآلي الكامل.
        </Alert>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-bold text-slate-800">تجربة المساعد</h2>
          <AiChat greeting={config.aiGreeting} />
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-bold text-slate-800">أحدث المحادثات</h2>
            {conversations.length === 0 ? (
              <EmptyState title="لا توجد محادثات بعد" />
            ) : (
              <Table head={["المعرف", "القناة", "تحويل لموظف", "آخر تحديث"]}>
                {conversations.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-mono text-xs">{c.publicId.slice(0, 8)}</Td>
                    <Td>{c.channel}</Td>
                    <Td>{c.escalated ? <Badge tone="amber">نعم</Badge> : "—"}</Td>
                    <Td>{fmtDateTime(c.updatedAt)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 font-bold text-slate-800">سجل تنفيذ الأدوات</h2>
            {toolLogs.length === 0 ? (
              <EmptyState title="لم تُنفَّذ أدوات بعد" />
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <Table head={["الأداة", "النتيجة", "الوقت"]}>
                  {toolLogs.map((l) => (
                    <tr key={l.id}>
                      <Td className="font-mono text-xs">{l.toolName}</Td>
                      <Td>{l.success ? <Badge tone="green">نجح</Badge> : <Badge tone="red">فشل</Badge>}</Td>
                      <Td>{fmtDateTime(l.createdAt)}</Td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
