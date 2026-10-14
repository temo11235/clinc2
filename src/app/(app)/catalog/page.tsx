import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { treatmentCatalog } from "@/db/schema";
import { requirePermission, can } from "@/lib/access";
import { formatEGP } from "@/lib/money";
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle, Stat, Table, Td } from "@/components/ui";
import { TreatmentForm } from "@/components/finance-forms";
import { toggleTreatmentAction } from "../finance-actions";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const user = await requirePermission("finance.read");
  const rows = await db
    .select()
    .from(treatmentCatalog)
    .where(eq(treatmentCatalog.clinicId, user.clinicId))
    .orderBy(asc(treatmentCatalog.nameAr));
  const editable = true;

  return (
    <div>
      <PageHeader
        icon="🧾"
        title="دليل العلاجات والأسعار"
        subtitle="الأسعار بالجنيه المصري وتُستخدم تلقائيًا في الحجز والفواتير"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="عدد العلاجات" value={rows.length} icon="🧾" tone="teal" />
        <Stat label="المفعّلة" value={rows.filter((r) => r.isActive).length} icon="✅" tone="good" />
        <Stat
          label="متوسط السعر"
          value={formatEGP(rows.length ? Math.round(rows.reduce((s2, r) => s2 + r.priceMinor, 0) / rows.length) : 0)}
          icon="💰"
          tone="indigo"
        />
        <Stat
          label="أعلى سعر"
          value={formatEGP(rows.length ? Math.max(...rows.map((r) => r.priceMinor)) : 0)}
          icon="💎"
          tone="amber"
        />
      </div>
      {editable ? (
        <Card className="mb-5" tone="teal">
          <SectionTitle icon="➕">إضافة علاج جديد</SectionTitle>
          <TreatmentForm />
        </Card>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState icon="🧾" title="لا توجد علاجات مسجلة" hint="أضف العلاجات لتسهيل الحجز وإصدار الفواتير." />
      ) : (
        <Table head={["العلاج", "التصنيف", "السعر", "المدة", "الحالة", ""]}>
          {rows.map((t) => (
            <tr key={t.id}>
              <Td>
                <span className="font-extrabold text-slate-800">{t.nameAr}</span>
                {t.nameEn ? <span className="mr-2 text-xs text-slate-400">{t.nameEn}</span> : null}
              </Td>
              <Td>{t.category ? <Badge tone="indigo">{t.category}</Badge> : "—"}</Td>
              <Td className="font-extrabold text-emerald-700">{formatEGP(t.priceMinor)}</Td>
              <Td><Badge tone="blue">⏱ {t.durationMinutes} دقيقة</Badge></Td>
              <Td>{t.isActive ? <Badge tone="green">مفعّل</Badge> : <Badge tone="slate">موقوف</Badge>}</Td>
              <Td>
                {editable ? (
                  <form action={toggleTreatmentAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <Button type="submit" variant="ghost" className="text-xs">
                      {t.isActive ? "إيقاف" : "تفعيل"}
                    </Button>
                  </form>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
