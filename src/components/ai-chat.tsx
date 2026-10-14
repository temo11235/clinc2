"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input } from "@/components/ui";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[] };

const SUGGESTIONS = [
  "عايز أحجز موعد",
  "الكشف بكام؟",
  "مواعيد العمل إيه؟",
  "العيادة فين؟",
  "عايز ألغي موعدي",
];

const TOOL_LABELS: Record<string, string> = {
  get_clinic_information: "معلومات العيادة",
  search_available_slots: "بحث عن مواعيد متاحة",
  create_appointment: "إنشاء حجز",
  find_patient_appointments: "مواعيدي",
  reschedule_appointment: "تأجيل موعد",
  cancel_appointment: "إلغاء موعد",
  request_human_assistance: "تحويل لموظف",
};

export function AiChat({ greeting }: { greeting: string }) {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: greeting }]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convId = useRef<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendText(text: string) {
    if (!text || loading) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setValue("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: convId.current }),
      });
      const data = (await res.json()) as {
        reply?: string;
        error?: string;
        conversationId?: string;
        usedTools?: string[];
      };
      if (data.error) setError(data.error);
      if (data.conversationId) convId.current = data.conversationId;
      if (data.reply) setMessages((m) => [...m, { role: "assistant", content: data.reply as string, tools: data.usedTools }]);
    } catch {
      setError("تعذر الاتصال بالخادم. برجاء المحاولة مجددًا أو الاتصال بالعيادة.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[65vh] min-h-[460px] flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-xl shadow-slate-900/5 backdrop-blur">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-l from-slate-50 to-teal-50/70 px-5 py-3">
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-xl text-white shadow-md">
          🤖
          <span className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
        </span>
        <div>
          <p className="text-sm font-extrabold text-slate-800">المساعد الافتراضي</p>
          <p className="text-[11px] text-emerald-600">● متصل الآن</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                m.role === "user"
                  ? "rounded-bl-md bg-gradient-to-l from-teal-600 to-emerald-600 text-white"
                  : "rounded-br-md border border-slate-100 bg-slate-50 text-slate-800"
              }`}
            >
              {m.content}
              {m.tools && m.tools.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-200/60 pt-2">
                  {m.tools.map((t, k) => (
                    <span key={k} className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                      ⚙️ {TOOL_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {loading ? (
          <div className="flex justify-end">
            <div className="flex items-center gap-1.5 rounded-2xl bg-slate-100 px-4 py-3">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="h-2 w-2 animate-pulse-soft rounded-full bg-teal-500"
                  style={{ animationDelay: `${d * 0.18}s` }}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {messages.length <= 2 ? (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-2.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => sendText(s)}
              disabled={loading}
              className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-700 transition hover:bg-teal-100 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="px-4 pb-2">
          <Alert kind="error">{error}</Alert>
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendText(value.trim());
        }}
        className="flex gap-2 border-t border-slate-100 bg-white/80 p-3"
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="اكتب رسالتك... مثال: عايز أحجز موعد يوم الأحد"
          aria-label="رسالتك"
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !value.trim()}>
          {loading ? "..." : "إرسال ➤"}
        </Button>
      </form>
    </div>
  );
}
