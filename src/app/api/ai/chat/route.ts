import { z } from "zod";
import { handleChat } from "@/lib/ai/agent";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(1000),
  conversationId: z.string().uuid().optional(),
});

const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const MAX_PER_CONVERSATION = 60;
const conversationCounts = new Map<string, number>();

function limited(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  b.count += 1;
  return b.count > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (limited(ip)) {
    return Response.json({ error: "عدد كبير من الرسائل، برجاء الانتظار قليلاً." }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "رسالة غير صالحة" }, { status: 400 });

  if (parsed.data.conversationId) {
    const used = (conversationCounts.get(parsed.data.conversationId) ?? 0) + 1;
    conversationCounts.set(parsed.data.conversationId, used);
    if (used > MAX_PER_CONVERSATION)
      return Response.json({ error: "انتهى الحد الأقصى للمحادثة. برجاء التواصل مع الاستقبال." }, { status: 429 });
  }

  const clinicId = Number(process.env.PUBLIC_CLINIC_ID ?? 1);

  try {
    const result = await handleChat({
      clinicId,
      publicId: parsed.data.conversationId,
      message: parsed.data.message,
    });
    return Response.json(result);
  } catch {
    return Response.json(
      {
        reply:
          "عذرًا، حدث خطأ تقني. يمكنك الحجز مباشرة بالاتصال بالعيادة وسيقوم موظف الاستقبال بمساعدتك.",
        degraded: true,
        usedTools: [],
      },
      { status: 200 },
    );
  }
}
