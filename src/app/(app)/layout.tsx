import type { ReactNode } from "react";
import Link from "next/link";
import { requireClinic } from "@/lib/access";
import { getClinic } from "@/lib/settings";
import { Sidebar } from "@/components/sidebar";
import { cairoDayString, WEEKDAY_NAMES_AR } from "@/lib/time";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard", label: "لوحة التحكم", icon: "📊", group: "العمليات اليومية" },
  { href: "/appointments/today", label: "مواعيد اليوم", icon: "⏱️", group: "العمليات اليومية" },
  { href: "/appointments", label: "تقويم المواعيد", icon: "🗓️", group: "العمليات اليومية" },
  { href: "/patients", label: "المرضى", icon: "👥", group: "الملفات والعلاج" },
  { href: "/visits", label: "السجلات العلاجية", icon: "🩺", group: "الملفات والعلاج" },
  { href: "/catalog", label: "دليل العلاجات", icon: "🧾", group: "الملفات والعلاج" },
  { href: "/invoices", label: "الفواتير", icon: "💳", group: "الحسابات" },
  { href: "/payments", label: "المدفوعات والخزينة", icon: "💵", group: "الحسابات" },
  { href: "/expenses", label: "المصروفات", icon: "📉", group: "الحسابات" },
  { href: "/reports", label: "التقارير والتحليلات", icon: "📈", group: "التحليلات والأتمتة" },
  { href: "/ai", label: "المساعد الذكي", icon: "🤖", group: "التحليلات والأتمتة" },
  { href: "/notifications", label: "التذكيرات والرسائل", icon: "🔔", group: "التحليلات والأتمتة" },
  { href: "/dentists", label: "الأطباء", icon: "🧑‍⚕️", group: "الإدارة" },
  { href: "/settings", label: "إعدادات العيادة", icon: "⚙️", group: "الإدارة" },
  { href: "/audit", label: "سجل العمليات", icon: "🛡️", group: "الإدارة" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { clinicId } = await requireClinic();
  const clinic = await getClinic(clinicId);
  const today = cairoDayString();
  const weekday = WEEKDAY_NAMES_AR[new Date(`${today}T12:00:00Z`).getUTCDay()];

  return (
    <div className="flex min-h-screen">
      <Sidebar items={NAV} clinicName={clinic?.name ?? "العيادة"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print glass sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/60 px-4 py-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-xl shadow-md shadow-teal-600/25 sm:flex">
              🦷
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-slate-800">{clinic?.name}</p>
              <p className="truncate text-xs text-slate-500">📍 {clinic?.address ?? "القاهرة، مصر"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden rounded-xl bg-gradient-to-l from-teal-50 to-emerald-50 px-3 py-1.5 text-left ring-1 ring-teal-100 md:block">
              <p className="text-xs font-bold text-teal-800">
                {weekday} · {today}
              </p>
              <p className="text-[10px] text-teal-600">توقيت القاهرة · الجنيه المصري</p>
            </div>
            <span className="hidden rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200 lg:inline">
              🔓 وضع مفتوح بدون تسجيل دخول
            </span>
            <Link
              href="/assistant"
              target="_blank"
              className="rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/25 transition hover:-translate-y-0.5"
            >
              🤖 واجهة المرضى
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>

        <footer className="no-print border-t border-white/60 bg-white/70 px-4 py-4 text-center text-xs text-slate-500 backdrop-blur">
          نظام إدارة عيادات الأسنان — التوقيت <span className="font-bold text-teal-700">Africa/Cairo</span> — العملة{" "}
          <span className="font-bold text-teal-700">جنيه مصري</span> · بيانات العرض خيالية بالكامل
        </footer>
      </div>
    </div>
  );
}
