"use client";

import { useState } from "react";

export type ToothRecord = { toothNumber: number; title: string; status: string; date: string; surfaces?: string | null };

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

export function DentalChart({ records }: { records: ToothRecord[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const byTooth = new Map<number, ToothRecord[]>();
  for (const r of records) {
    if (!r.toothNumber) continue;
    byTooth.set(r.toothNumber, [...(byTooth.get(r.toothNumber) ?? []), r]);
  }

  const Tooth = ({ n }: { n: number }) => {
    const items = byTooth.get(n) ?? [];
    const treated = items.length > 0;
    return (
      <button
        type="button"
        onClick={() => setSelected(selected === n ? null : n)}
        className={`flex h-11 w-9 flex-col items-center justify-center rounded-md border text-[10px] font-semibold transition ${
          treated
            ? "border-teal-600 bg-teal-100 text-teal-900"
            : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
        } ${selected === n ? "ring-2 ring-teal-500" : ""}`}
        title={`سن ${n}`}
      >
        <span>🦷</span>
        <span>{n}</span>
      </button>
    );
  };

  const details = selected ? (byTooth.get(selected) ?? []) : [];

  return (
    <div>
      <div className="space-y-3 overflow-x-auto">
        <div className="flex justify-center gap-4">
          <div className="flex gap-1">{UPPER_RIGHT.map((n) => <Tooth key={n} n={n} />)}</div>
          <div className="flex gap-1">{UPPER_LEFT.map((n) => <Tooth key={n} n={n} />)}</div>
        </div>
        <div className="flex justify-center gap-4">
          <div className="flex gap-1">{LOWER_RIGHT.map((n) => <Tooth key={n} n={n} />)}</div>
          <div className="flex gap-1">{LOWER_LEFT.map((n) => <Tooth key={n} n={n} />)}</div>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
        {!selected ? (
          <p className="text-slate-500">اضغط على أي سن لعرض الإجراءات المسجلة عليه (ترقيم FDI).</p>
        ) : details.length === 0 ? (
          <p className="text-slate-500">لا توجد إجراءات مسجلة على السن {selected}.</p>
        ) : (
          <ul className="space-y-2">
            {details.map((d, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold text-slate-700">{d.title}</span>
                <span className="text-slate-500">
                  {d.surfaces ? `الأسطح: ${d.surfaces} · ` : ""}
                  {d.date}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
