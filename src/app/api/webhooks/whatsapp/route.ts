import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationLogs } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Meta webhook verification handshake. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

/** Delivery status callbacks — only these confirm real delivery. */
export async function POST(request: Request) {
  if (!process.env.WHATSAPP_VERIFY_TOKEN) return Response.json({ ok: true, skipped: true });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const entries =
    (payload as { entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<{ id: string; status: string }> } }> }> })
      .entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        const mapped = status.status === "delivered" || status.status === "read" ? "delivered" : status.status === "failed" ? "failed" : "provider_accepted";
        await db
          .update(notificationLogs)
          .set({ status: mapped })
          .where(eq(notificationLogs.providerMessageId, status.id));
      }
    }
  }
  return Response.json({ ok: true });
}
