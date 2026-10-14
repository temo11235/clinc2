import type { ReactNode, ComponentProps } from "react";
import Link from "next/link";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------- Card --------------------------------- */

export function Card({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone?: "teal" | "indigo" | "amber" | "rose" | "sky";
}) {
  const topBar: Record<string, string> = {
    teal: "before:bg-gradient-to-l before:from-teal-400 before:to-emerald-500",
    indigo: "before:bg-gradient-to-l before:from-indigo-400 before:to-violet-500",
    amber: "before:bg-gradient-to-l before:from-amber-400 before:to-orange-500",
    rose: "before:bg-gradient-to-l before:from-rose-400 before:to-pink-500",
    sky: "before:bg-gradient-to-l before:from-sky-400 before:to-cyan-500",
  };
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-2xl border border-white/70 bg-white/85 p-5 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18)] backdrop-blur",
        tone &&
          cx(
            "before:absolute before:inset-x-0 before:top-0 before:h-1 before:content-['']",
            topBar[tone],
          ),
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------ PageHeader ------------------------------ */

export function PageHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="animate-rise mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/70 bg-gradient-to-l from-white via-white to-teal-50/70 p-5 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.25)]">
      <div className="flex items-center gap-4">
        {icon ? (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-2xl shadow-lg shadow-teal-500/30">
            {icon}
          </span>
        ) : null}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/* --------------------------------- Stat --------------------------------- */

const STAT_TONES = {
  default: {
    ring: "from-slate-400 to-slate-600",
    chip: "bg-slate-100 text-slate-600",
    value: "text-slate-900",
  },
  teal: { ring: "from-teal-400 to-emerald-600", chip: "bg-teal-50 text-teal-700", value: "text-teal-700" },
  good: { ring: "from-emerald-400 to-green-600", chip: "bg-emerald-50 text-emerald-700", value: "text-emerald-700" },
  warn: { ring: "from-amber-400 to-orange-500", chip: "bg-amber-50 text-amber-700", value: "text-amber-600" },
  bad: { ring: "from-rose-400 to-red-600", chip: "bg-rose-50 text-rose-700", value: "text-rose-600" },
  indigo: { ring: "from-indigo-400 to-violet-600", chip: "bg-indigo-50 text-indigo-700", value: "text-indigo-700" },
  sky: { ring: "from-sky-400 to-cyan-600", chip: "bg-sky-50 text-sky-700", value: "text-sky-700" },
  amber: { ring: "from-amber-400 to-yellow-500", chip: "bg-amber-50 text-amber-700", value: "text-amber-600" },
  rose: { ring: "from-rose-400 to-pink-600", chip: "bg-rose-50 text-rose-700", value: "text-rose-600" },
} as const;

export type StatTone = keyof typeof STAT_TONES;

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatTone;
  icon?: string;
  trend?: { value: string; up: boolean };
}) {
  const t = STAT_TONES[tone];
  return (
    <div className="group animate-rise relative min-w-0 overflow-hidden rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.25)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.4)]">
      <div className={cx("absolute inset-x-0 top-0 h-1 bg-gradient-to-l", t.ring)} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon ? (
          <span
            className={cx(
              "flex h-9 w-9 items-center justify-center rounded-xl text-lg transition group-hover:scale-110",
              t.chip,
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className={cx("mt-2 truncate text-2xl font-extrabold tabular-nums", t.value)} title={String(value)}>
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {trend ? (
          <span
            className={cx(
              "rounded-full px-2 py-0.5 text-[11px] font-bold",
              trend.up ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
            )}
          >
            {trend.up ? "▲" : "▼"} {trend.value}
          </span>
        ) : null}
        {hint ? <span className="truncate text-xs text-slate-400">{hint}</span> : null}
      </div>
    </div>
  );
}

/* -------------------------------- Buttons -------------------------------- */

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const variants = {
  primary:
    "bg-gradient-to-l from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-600/25 hover:shadow-xl hover:shadow-teal-600/35 hover:-translate-y-0.5 focus-visible:ring-teal-500",
  secondary:
    "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus-visible:ring-teal-400",
  danger:
    "bg-gradient-to-l from-rose-600 to-red-600 text-white shadow-lg shadow-rose-600/25 hover:-translate-y-0.5 focus-visible:ring-rose-500",
  indigo:
    "bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/25 hover:-translate-y-0.5 focus-visible:ring-indigo-500",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-300",
} as const;

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof variants }) {
  return <button {...props} className={cx(btnBase, variants[variant], className)} />;
}

export function LinkButton({
  href,
  variant = "primary",
  className,
  children,
  target,
}: {
  href: string;
  variant?: keyof typeof variants;
  className?: string;
  children: ReactNode;
  target?: string;
}) {
  return (
    <Link href={href} target={target} className={cx(btnBase, variants[variant], className)}>
      {children}
    </Link>
  );
}

/* --------------------------------- Form --------------------------------- */

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">
          {label} {required ? <span className="text-rose-500">*</span> : null}
        </span>
      ) : null}
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 disabled:bg-slate-50 disabled:text-slate-400";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(inputCls, "min-h-24 leading-relaxed", props.className)} />;
}
export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(inputCls, "cursor-pointer", props.className)} />;
}

/* --------------------------------- Badge --------------------------------- */

const BADGE_TONES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  teal: "bg-teal-100 text-teal-800 ring-teal-200",
  green: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  red: "bg-rose-100 text-rose-800 ring-rose-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  blue: "bg-sky-100 text-sky-800 ring-sky-200",
  indigo: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  purple: "bg-violet-100 text-violet-800 ring-violet-200",
};

export function Badge({ children, tone = "slate", dot }: { children: ReactNode; tone?: string; dot?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset",
        BADGE_TONES[tone] ?? BADGE_TONES.slate,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export const statusTone: Record<string, string> = {
  scheduled: "blue",
  confirmed: "teal",
  checked_in: "amber",
  completed: "green",
  cancelled: "red",
  no_show: "purple",
  draft: "slate",
  finalized: "green",
  pending: "amber",
  processing: "blue",
  sent: "green",
  delivered: "green",
  failed: "red",
  skipped: "slate",
  provider_accepted: "blue",
};

export const statusIcon: Record<string, string> = {
  scheduled: "🗓️",
  confirmed: "✅",
  checked_in: "🚪",
  completed: "🎉",
  cancelled: "✖️",
  no_show: "👻",
};

/* ------------------------------ EmptyState ------------------------------ */

export function EmptyState({
  title,
  hint,
  action,
  icon = "📭",
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-b from-white to-slate-50/60 p-10 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
        {icon}
      </div>
      <p className="text-base font-bold text-slate-700">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* --------------------------------- Table --------------------------------- */

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/70 bg-white/90 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.3)] backdrop-blur">
      <table className="w-full min-w-[640px] text-right text-sm">
        <thead className="bg-gradient-to-l from-slate-50 to-teal-50/60 text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={`${h}-${i}`} className="border-b border-slate-200/80 px-4 py-3.5 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors [&>tr:hover]:bg-teal-50/40">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cx("px-4 py-3 align-middle text-slate-700", className)}>{children}</td>;
}

/* --------------------------------- Alert --------------------------------- */

export function Alert({
  kind = "error",
  children,
}: {
  kind?: "error" | "success" | "info" | "warn";
  children: ReactNode;
}) {
  const tones = {
    error: "border-rose-200 bg-rose-50 text-rose-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
  } as const;
  const icons = { error: "⛔", success: "✅", info: "ℹ️", warn: "⚠️" } as const;
  return (
    <div className={cx("flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium", tones[kind])}>
      <span className="shrink-0">{icons[kind]}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ------------------------------ ProgressBar ------------------------------ */

export function ProgressBar({ value, tone = "teal" }: { value: number; tone?: "teal" | "amber" | "rose" }) {
  const tones = {
    teal: "from-teal-500 to-emerald-500",
    amber: "from-amber-400 to-orange-500",
    rose: "from-rose-500 to-red-500",
  } as const;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={cx("h-full rounded-full bg-gradient-to-l transition-all", tones[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ------------------------------ SectionTitle ------------------------------ */

export function SectionTitle({ children, icon }: { children: ReactNode; icon?: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-extrabold text-slate-800">
      {icon ? <span className="text-lg">{icon}</span> : null}
      {children}
    </h2>
  );
}
