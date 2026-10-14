"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

type Item = { href: string; label: string; icon: string; group?: string };

const GROUP_ORDER = ["العمليات اليومية", "الملفات والعلاج", "الحسابات", "التحليلات والأتمتة", "الإدارة"];

export function Sidebar({ items, clinicName }: { items: Item[]; clinicName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const grouped = GROUP_ORDER.map((g) => ({ group: g, items: items.filter((i) => i.group === g) })).filter(
    (g) => g.items.length > 0,
  );

  const nav = (
    <nav className="space-y-5">
      {grouped.map(({ group, items: groupItems }) => (
        <div key={group}>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-teal-300/60">{group}</p>
          <div className="space-y-1">
            {groupItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && item.href !== "/appointments" && pathname.startsWith(item.href)) ||
                (item.href === "/appointments" && pathname === "/appointments");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cx(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                    active
                      ? "bg-gradient-to-l from-teal-500/90 to-emerald-500/80 text-white shadow-lg shadow-teal-900/40"
                      : "text-slate-300 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {active ? (
                    <span className="absolute inset-y-1.5 right-0 w-1 rounded-full bg-white/90" aria-hidden />
                  ) : null}
                  <span
                    className={cx(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-base transition",
                      active ? "bg-white/20" : "bg-white/5 group-hover:bg-white/15",
                    )}
                    aria-hidden
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <button
        className="no-print fixed bottom-5 left-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-xl text-white shadow-2xl shadow-teal-900/40 transition active:scale-95 lg:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-label="القائمة"
      >
        {open ? "✕" : "☰"}
      </button>
      {open ? (
        <div
          className="no-print fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        className={cx(
          "no-print fixed inset-y-0 right-0 z-30 flex w-72 shrink-0 flex-col overflow-y-auto bg-gradient-to-b from-slate-900 via-teal-950 to-slate-900 p-4 shadow-2xl transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="mb-6 flex items-center gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 text-2xl shadow-lg shadow-teal-900/50">
            🦷
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-white">{clinicName}</p>
            <p className="text-[11px] text-teal-300/80">نظام إدارة العيادة</p>
          </div>
        </div>

        {nav}

        <div className="mt-auto pt-6">
          <div className="rounded-2xl bg-gradient-to-br from-teal-500/20 to-emerald-500/10 p-4 ring-1 ring-teal-400/20">
            <p className="text-xs font-bold text-teal-200">🤖 المساعد الافتراضي</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
              يرد على المرضى ويحجز المواعيد تلقائيًا من قاعدة البيانات.
            </p>
            <Link
              href="/assistant"
              target="_blank"
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-white/15 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/25"
            >
              فتح واجهة المرضى ↗
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
