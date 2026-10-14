import { getConfig, getClinic } from "@/lib/settings";
import { AiChat } from "@/components/ai-chat";

export const dynamic = "force-dynamic";

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export default async function AssistantPage() {
  const clinicId = Number(process.env.PUBLIC_CLINIC_ID ?? process.env.CLINIC_ID ?? 1);
  const [clinic, config] = await Promise.all([getClinic(clinicId), getConfig(clinicId)]);

  return (
    <main className="mx-auto min-h-screen max-w-4xl p-4 lg:p-8">
      <header className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-700 p-7 text-white shadow-2xl shadow-teal-900/25">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-3xl backdrop-blur">
              🦷
            </span>
            <div>
              <h1 className="text-2xl font-extrabold">{clinic?.name ?? "عيادة الأسنان"}</h1>
              <p className="mt-1 text-sm text-teal-50/90">المساعد الافتراضي للحجز والاستفسارات · متاح 24 ساعة</p>
            </div>
          </div>
          {clinic?.phone ? (
            <a
              href={`tel:${clinic.phone}`}
              className="rounded-xl bg-white/20 px-4 py-2.5 text-sm font-bold backdrop-blur transition hover:bg-white/30"
            >
              📞 {clinic.phone}
            </a>
          ) : null}
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {[
            { icon: "🕐", label: "مواعيد العمل", value: config.workingHours.filter((d) => !d.closed).length + " أيام أسبوعيًا" },
            { icon: "📍", label: "العنوان", value: clinic?.address ?? "القاهرة" },
            { icon: "🗓️", label: "الحجز", value: "فوري عبر المحادثة" },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl bg-white/10 p-3 backdrop-blur">
              <p className="text-xs text-teal-50/80">
                {c.icon} {c.label}
              </p>
              <p className="mt-0.5 truncate text-sm font-bold">{c.value}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="mb-4 rounded-2xl border-r-4 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
        <p className="font-extrabold">⚠️ تنبيه هام</p>
        <p className="mt-1 leading-relaxed">
          هذا مساعد آلي (AI) وليس طبيبًا، ولا يقدّم تشخيصًا أو وصفات طبية. في الحالات الطارئة:{" "}
          <span className="font-bold">{config.emergencyInstructions}</span>
        </p>
      </div>

      <AiChat greeting={config.aiGreeting} />

      <section className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur">
          <h2 className="mb-3 text-base font-extrabold text-slate-800">🕐 مواعيد العمل</h2>
          <ul className="space-y-1.5 text-sm">
            {config.workingHours.map((d, i) => (
              <li key={i} className="flex items-center justify-between border-b border-slate-50 pb-1.5">
                <span className="font-semibold text-slate-600">{DAYS[i]}</span>
                {d.closed ? (
                  <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">إجازة</span>
                ) : (
                  <span className="font-mono text-xs font-bold text-teal-700" dir="ltr">
                    {d.open} – {d.close}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur">
          <h2 className="mb-3 text-base font-extrabold text-slate-800">❓ الأسئلة الشائعة</h2>
          <div className="space-y-2">
            {config.faq.slice(0, 5).map((f, i) => (
              <details key={i} className="rounded-xl bg-slate-50 p-3 text-sm">
                <summary className="cursor-pointer font-bold text-slate-700">{f.q}</summary>
                <p className="mt-2 leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-4 rounded-2xl border border-white/70 bg-white/85 p-5 text-sm shadow-sm backdrop-blur">
        <h2 className="mb-2 text-base font-extrabold text-slate-800">📋 سياسات الحجز</h2>
        <p className="leading-relaxed text-slate-600">{config.policies}</p>
      </div>

      <footer className="mt-6 pb-6 text-center text-xs text-slate-400">
        {clinic?.address ? `📍 ${clinic.address}` : ""} {clinic?.mapsUrl ? (
          <a className="font-bold text-teal-600 hover:underline" href={clinic.mapsUrl} target="_blank" rel="noreferrer">
            · عرض على الخريطة ↗
          </a>
        ) : null}
      </footer>
    </main>
  );
}
