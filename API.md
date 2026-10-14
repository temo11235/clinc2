# مرجع واجهات الـ API

جميع المسارات تعمل على الخادم. لا توجد مصادقة في هذا الإصدار (راجع SECURITY.md).

## GET /api/health
فحص الجاهزية. يرجع `{ "ok": true }` عند نجاح الاتصال بقاعدة البيانات.

## POST /api/ai/chat
محادثة المساعد الافتراضي للمرضى.

```json
// Request
{ "message": "عايز أحجز موعد يوم الأحد", "conversationId": "uuid (اختياري)" }

// Response
{ "reply": "...", "conversationId": "uuid", "usedTools": ["search_available_slots"], "degraded": false }
```
- حد المعدل: 12 رسالة/دقيقة لكل IP، و60 رسالة لكل محادثة (429 عند التجاوز).
- `degraded: true` تعني أن مزود الذكاء الاصطناعي غير متاح وتم استخدام الوضع الاحتياطي.

## GET|POST /api/cron/reminders
معالجة مهام التذكير المستحقة. يتطلب:
```
Authorization: Bearer $CRON_SECRET
```
أو `?secret=$CRON_SECRET`. الاستجابة: `{ ok, processed, sent, failed, ranAt }`.
المهمة **idempotent**: تُقفل المهمة قبل الإرسال ولا تُرسل مرتين لنفس `dedupe_key`.

## GET /api/webhooks/whatsapp
تحقق Meta من الـ Webhook عبر `hub.verify_token`.

## POST /api/webhooks/whatsapp
استقبال حالات التسليم وتحديث `notification_logs.status` إلى `delivered` أو `failed`.

## GET /api/exports/{kind}
تصدير CSV (UTF-8 BOM). القيم المتاحة لـ `kind`:
- `invoices` — كل الفواتير
- `payments?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `expenses?from=&to=`
- `report?from=&to=` — ملخص تحليلي

## أدوات المساعد الذكي (تُستدعى داخليًا فقط)
| الأداة | الغرض | تحقق إلزامي |
|---|---|---|
| `get_clinic_information` | مواعيد/عنوان/خدمات/أسعار/سياسات/طوارئ | — |
| `search_available_slots` | مواعيد متاحة حقيقية | صيغة التاريخ |
| `create_appointment` | إنشاء حجز | `confirmed: true` + هاتف صالح |
| `find_patient_appointments` | مواعيد المريض القادمة | هاتف + مطابقة الاسم |
| `reschedule_appointment` | تأجيل | هاتف + ملكية الموعد + تأكيد |
| `cancel_appointment` | إلغاء | هاتف + ملكية الموعد + تأكيد |
| `request_human_assistance` | تحويل لموظف | — |
