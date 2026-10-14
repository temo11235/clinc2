"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PALETTE = ["#0d9488", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6", "#22c55e", "#0ea5e9", "#ec4899"];

const STATUS_COLORS: Record<string, string> = {
  مكتمل: "#10b981",
  محجوز: "#0ea5e9",
  مؤكد: "#14b8a6",
  "تم الوصول": "#f59e0b",
  ملغي: "#ef4444",
  "لم يحضر": "#8b5cf6",
};

const tooltipStyle = {
  contentStyle: {
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    boxShadow: "0 12px 30px -12px rgba(15,23,42,.3)",
    fontFamily: "Cairo, sans-serif",
    fontSize: 12,
    direction: "rtl" as const,
  },
};

function Nothing({ text }: { text: string }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-xl bg-slate-50/70 text-sm text-slate-400">
      <span className="text-3xl">📊</span>
      {text}
    </div>
  );
}

export function RevenueChart({ data }: { data: Array<{ day: string; collected: number; expenses: number }> }) {
  if (!data.length) return <Nothing text="لا توجد بيانات كافية" />;
  return (
    <ResponsiveContainer width="100%" height={290}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gCollected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id="gExpenses" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(v))}
        />
        <Tooltip {...tooltipStyle} formatter={(v) => `${Number(v ?? 0).toLocaleString("ar-EG")} ج.م`} />
        <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Cairo" }} />
        <Area
          type="monotone"
          dataKey="collected"
          name="المحصّل"
          stroke="#0d9488"
          strokeWidth={2.5}
          fill="url(#gCollected)"
        />
        <Area
          type="monotone"
          dataKey="expenses"
          name="المصروفات"
          stroke="#f43f5e"
          strokeWidth={2.5}
          fill="url(#gExpenses)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatusPie({ data }: { data: Array<{ status: string; count: number }> }) {
  const labels: Record<string, string> = {
    scheduled: "محجوز",
    confirmed: "مؤكد",
    checked_in: "تم الوصول",
    completed: "مكتمل",
    cancelled: "ملغي",
    no_show: "لم يحضر",
  };
  if (!data.length) return <Nothing text="لا توجد مواعيد في هذه الفترة" />;
  const shaped = data.map((d) => ({ name: labels[d.status] ?? d.status, value: d.count }));
  const total = shaped.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={290}>
      <PieChart>
        <Pie
          data={shaped}
          dataKey="value"
          nameKey="name"
          innerRadius={62}
          outerRadius={100}
          paddingAngle={3}
          cornerRadius={7}
          label={({ value }) => `${Math.round((Number(value) / total) * 100)}%`}
          labelLine={false}
        >
          {shaped.map((entry, i) => (
            <Cell key={i} fill={STATUS_COLORS[entry.name] ?? PALETTE[i % PALETTE.length]} stroke="#fff" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Cairo" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TreatmentsBar({ data }: { data: Array<{ title: string; count: number }> }) {
  if (!data.length) return <Nothing text="لا توجد إجراءات مسجلة بعد" />;
  return (
    <ResponsiveContainer width="100%" height={290}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="gBar" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0%" stopColor="#0d9488" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="title"
          width={120}
          tick={{ fontSize: 11, fill: "#475569" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(13,148,136,.06)" }} />
        <Bar dataKey="count" name="عدد المرات" fill="url(#gBar)" radius={[0, 8, 8, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DentistBar({ data }: { data: Array<{ name: string; completed: number; cancelled: number }> }) {
  if (!data.length) return <Nothing text="لا توجد بيانات أطباء" />;
  return (
    <ResponsiveContainer width="100%" height={290}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(99,102,241,.06)" }} />
        <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Cairo" }} />
        <Bar dataKey="completed" name="مكتملة" fill="#10b981" radius={[8, 8, 0, 0]} barSize={26} />
        <Bar dataKey="cancelled" name="ملغاة/لم يحضر" fill="#f43f5e" radius={[8, 8, 0, 0]} barSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SourcePie({ data }: { data: Array<{ source: string; count: number }> }) {
  if (!data.length) return <Nothing text="لا توجد بيانات" />;
  const labels: Record<string, string> = { ai: "المساعد الذكي", staff: "موظف العيادة" };
  const shaped = data.map((d) => ({ name: labels[d.source] ?? d.source, value: d.count }));
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie data={shaped} dataKey="value" nameKey="name" outerRadius={88} paddingAngle={3} cornerRadius={7}>
          {shaped.map((_, i) => (
            <Cell key={i} fill={i === 0 ? "#6366f1" : "#0d9488"} stroke="#fff" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Cairo" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
