import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { CLINIC_TZ, cairoDayString, cairoRangeBounds } from "@/lib/time";

type Row = Record<string, unknown>;

async function q<T extends Row>(statement: ReturnType<typeof sql>): Promise<T[]> {
  const res = await db.execute(statement);
  return res.rows as T[];
}

export async function dashboardStats(clinicId: number, fromStr?: string, toStr?: string) {
  const today = cairoDayString();
  const from = fromStr ?? today;
  const to = toStr ?? today;
  const { start, end } = cairoRangeBounds(from, to);

  const [appt] = await q<{
    total: number; completed: number; cancelled: number; no_show: number; upcoming: number;
  }>(sql`
    select
      count(*)::int as total,
      count(*) filter (where status = 'completed')::int as completed,
      count(*) filter (where status = 'cancelled')::int as cancelled,
      count(*) filter (where status = 'no_show')::int as no_show,
      count(*) filter (where status in ('scheduled','confirmed','checked_in'))::int as upcoming
    from appointments
    where clinic_id = ${clinicId} and starts_at >= ${start} and starts_at < ${end}
  `);

  const [patientsRow] = await q<{ new_patients: number; total_patients: number }>(sql`
    select
      count(*) filter (where created_at >= ${start} and created_at < ${end})::int as new_patients,
      count(*)::int as total_patients
    from patients where clinic_id = ${clinicId}
  `);

  const [money] = await q<{ collected: number; invoiced: number; expenses: number; refunds: number }>(sql`
    select
      coalesce((select sum(amount_minor) from payments where clinic_id = ${clinicId} and paid_at >= ${start} and paid_at < ${end}),0)::bigint as collected,
      coalesce((select sum(total_minor) from invoices where clinic_id = ${clinicId} and status = 'finalized' and issued_at >= ${start} and issued_at < ${end}),0)::bigint as invoiced,
      coalesce((select sum(amount_minor) from expenses where clinic_id = ${clinicId} and spent_at >= ${start} and spent_at < ${end}),0)::bigint as expenses,
      coalesce((select sum(amount_minor) from refunds where clinic_id = ${clinicId} and refunded_at >= ${start} and refunded_at < ${end}),0)::bigint as refunds
  `);

  const [outstanding] = await q<{ balance: number }>(sql`
    select (
      coalesce((select sum(total_minor) from invoices where clinic_id = ${clinicId} and status = 'finalized'),0)
      - coalesce((select sum(amount_minor) from payments where clinic_id = ${clinicId}),0)
      + coalesce((select sum(amount_minor) from refunds where clinic_id = ${clinicId}),0)
    )::bigint as balance
  `);

  return {
    range: { from, to },
    appointments: {
      total: Number(appt?.total ?? 0),
      completed: Number(appt?.completed ?? 0),
      cancelled: Number(appt?.cancelled ?? 0),
      noShow: Number(appt?.no_show ?? 0),
      upcoming: Number(appt?.upcoming ?? 0),
    },
    patients: {
      new: Number(patientsRow?.new_patients ?? 0),
      total: Number(patientsRow?.total_patients ?? 0),
    },
    money: {
      collectedMinor: Number(money?.collected ?? 0),
      invoicedMinor: Number(money?.invoiced ?? 0),
      expensesMinor: Number(money?.expenses ?? 0),
      refundsMinor: Number(money?.refunds ?? 0),
      outstandingMinor: Number(outstanding?.balance ?? 0),
    },
  };
}

export async function revenueTrend(clinicId: number, fromStr: string, toStr: string) {
  const { start, end } = cairoRangeBounds(fromStr, toStr);
  const rows = await q<{ day: string; collected: string; expenses: string }>(sql`
    with days as (
      select generate_series(date ${sql.raw(`'${fromStr}'`)}, date ${sql.raw(`'${toStr}'`)}, interval '1 day')::date as d
    )
    select to_char(d, 'YYYY-MM-DD') as day,
      coalesce((select sum(amount_minor) from payments p where p.clinic_id = ${clinicId}
        and (p.paid_at at time zone ${CLINIC_TZ})::date = d and p.paid_at >= ${start} and p.paid_at < ${end}),0)::bigint as collected,
      coalesce((select sum(amount_minor) from expenses e where e.clinic_id = ${clinicId}
        and (e.spent_at at time zone ${CLINIC_TZ})::date = d),0)::bigint as expenses
    from days order by d
  `);
  return rows.map((r) => ({
    day: r.day,
    collected: Number(r.collected) / 100,
    expenses: Number(r.expenses) / 100,
  }));
}

export async function statusDistribution(clinicId: number, fromStr: string, toStr: string) {
  const { start, end } = cairoRangeBounds(fromStr, toStr);
  const rows = await q<{ status: string; count: number }>(sql`
    select status, count(*)::int as count from appointments
    where clinic_id = ${clinicId} and starts_at >= ${start} and starts_at < ${end}
    group by status order by count desc
  `);
  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}

export async function topTreatments(clinicId: number, fromStr: string, toStr: string) {
  const { start, end } = cairoRangeBounds(fromStr, toStr);
  const rows = await q<{ title: string; count: number; revenue: string }>(sql`
    select vp.title, count(*)::int as count, coalesce(sum(vp.price_minor),0)::bigint as revenue
    from visit_procedures vp
    join visits v on v.id = vp.visit_id
    where vp.clinic_id = ${clinicId} and v.visit_date >= ${start} and v.visit_date < ${end}
    group by vp.title order by count desc limit 10
  `);
  return rows.map((r) => ({ title: r.title, count: Number(r.count), revenueMinor: Number(r.revenue) }));
}

export async function patientRetention(clinicId: number) {
  const [row] = await q<{ returning: number; total: number }>(sql`
    select
      count(*) filter (where visits_count > 1)::int as returning,
      count(*)::int as total
    from (
      select p.id, (select count(*) from appointments a where a.patient_id = p.id and a.status = 'completed') as visits_count
      from patients p where p.clinic_id = ${clinicId}
    ) t
  `);
  const total = Number(row?.total ?? 0);
  const ret = Number(row?.returning ?? 0);
  return { total, returning: ret, rate: total ? Math.round((ret / total) * 100) : 0 };
}

export async function dentistPerformance(clinicId: number, fromStr: string, toStr: string) {
  const { start, end } = cairoRangeBounds(fromStr, toStr);
  const rows = await q<{ name: string; completed: number; cancelled: number }>(sql`
    select coalesce(u.full_name, 'غير محدد') as name,
      count(*) filter (where a.status = 'completed')::int as completed,
      count(*) filter (where a.status in ('cancelled','no_show'))::int as cancelled
    from appointments a left join dentists u on u.id = a.dentist_id
    where a.clinic_id = ${clinicId} and a.starts_at >= ${start} and a.starts_at < ${end}
    group by 1 order by completed desc
  `);
  return rows.map((r) => ({ name: r.name, completed: Number(r.completed), cancelled: Number(r.cancelled) }));
}

export async function appointmentSources(clinicId: number, fromStr: string, toStr: string) {
  const { start, end } = cairoRangeBounds(fromStr, toStr);
  const rows = await q<{ source: string; count: number }>(sql`
    select source, count(*)::int as count from appointments
    where clinic_id = ${clinicId} and created_at >= ${start} and created_at < ${end}
    group by source order by count desc
  `);
  return rows.map((r) => ({ source: r.source, count: Number(r.count) }));
}

export async function patientBalance(clinicId: number, patientId: number) {
  const [row] = await q<{ invoiced: string; paid: string; refunded: string }>(sql`
    select
      coalesce((select sum(total_minor) from invoices where clinic_id = ${clinicId} and patient_id = ${patientId} and status = 'finalized'),0)::bigint as invoiced,
      coalesce((select sum(amount_minor) from payments where clinic_id = ${clinicId} and patient_id = ${patientId}),0)::bigint as paid,
      coalesce((select sum(amount_minor) from refunds where clinic_id = ${clinicId} and patient_id = ${patientId}),0)::bigint as refunded
  `);
  const invoiced = Number(row?.invoiced ?? 0);
  const paid = Number(row?.paid ?? 0);
  const refunded = Number(row?.refunded ?? 0);
  return { invoicedMinor: invoiced, paidMinor: paid, refundedMinor: refunded, balanceMinor: invoiced - paid + refunded };
}
