import { describe, expect, it } from "vitest";
import { fromMinor, invoiceTotals, lineTotalMinor, sumMinor, toMinor, formatEGP } from "../src/lib/money";
import {
  cairoDayBounds,
  cairoDayString,
  cairoToUtc,
  displayPhone,
  fmtTime,
  normalizeEgyptPhone,
} from "../src/lib/time";
import { validateWorkingHours, overlaps } from "../src/lib/scheduling";
import { DEFAULT_CONFIG, renderTemplate, type ClinicConfig } from "../src/lib/settings";
import { toolSchemas } from "../src/lib/ai/tools";

describe("الحسابات المالية (وحدات صغرى)", () => {
  it("يحوّل الجنيه إلى قروش بدون أخطاء عشرية", () => {
    expect(toMinor("150.75")).toBe(15075);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(fromMinor(15075)).toBe(150.75);
  });

  it("يحسب إجمالي البند والفاتورة والخصم", () => {
    expect(lineTotalMinor(9000, 3)).toBe(27000);
    const totals = invoiceTotals(
      [
        { unitPriceMinor: 9000, quantity: 2 },
        { unitPriceMinor: 25000, quantity: 1 },
      ],
      5000,
    );
    expect(totals.subtotalMinor).toBe(43000);
    expect(totals.discountMinor).toBe(5000);
    expect(totals.totalMinor).toBe(38000);
  });

  it("لا يسمح بخصم أكبر من الإجمالي", () => {
    const totals = invoiceTotals([{ unitPriceMinor: 10000, quantity: 1 }], 99999);
    expect(totals.totalMinor).toBe(0);
    expect(totals.discountMinor).toBe(10000);
  });

  it("يجمع المبالغ بأمان", () => {
    expect(sumMinor([100, null, 250, undefined])).toBe(350);
  });

  it("ينسق العملة بالجنيه المصري", () => {
    expect(formatEGP(150000, "en-EG")).toContain("1,500");
  });
});

describe("أرقام الهاتف المصرية والتوقيت", () => {
  it("يطبّع صيغ الأرقام المختلفة", () => {
    expect(normalizeEgyptPhone("01012345678")).toBe("+201012345678");
    expect(normalizeEgyptPhone("+20 101 234 5678")).toBe("+201012345678");
    expect(normalizeEgyptPhone("00201012345678")).toBe("+201012345678");
    expect(normalizeEgyptPhone("12345")).toBeNull();
  });

  it("يعرض الرقم بصيغة محلية", () => {
    expect(displayPhone("+201012345678")).toBe("01012345678");
  });

  it("يحوّل توقيت القاهرة إلى UTC بشكل صحيح", () => {
    const utc = cairoToUtc("2026-01-15", "10:00");
    expect(utc.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(fmtTime(utc)).toBe("10:00");
  });

  it("يحسب حدود اليوم بتوقيت القاهرة", () => {
    const { start, end } = cairoDayBounds("2026-01-15");
    expect(cairoDayString(start)).toBe("2026-01-15");
    expect(end.getTime() - start.getTime()).toBe(86400000);
  });
});

describe("قواعد المواعيد", () => {
  const config: ClinicConfig = {
    ...DEFAULT_CONFIG,
    holidays: ["2026-01-20"],
  };

  it("يرفض الحجز خارج ساعات العمل", () => {
    const start = cairoToUtc("2026-01-15", "08:00");
    const end = cairoToUtc("2026-01-15", "08:30");
    const res = validateWorkingHours(config, start, end);
    expect(res.ok).toBe(false);
  });

  it("يقبل الحجز داخل ساعات العمل", () => {
    const start = cairoToUtc("2026-01-15", "11:00");
    const end = cairoToUtc("2026-01-15", "11:30");
    expect(validateWorkingHours(config, start, end).ok).toBe(true);
  });

  it("يرفض الحجز أثناء فترة الراحة", () => {
    const start = cairoToUtc("2026-01-15", "14:15");
    const end = cairoToUtc("2026-01-15", "14:45");
    expect(validateWorkingHours(config, start, end).ok).toBe(false);
  });

  it("يرفض الحجز في الإجازات الرسمية", () => {
    const start = cairoToUtc("2026-01-20", "11:00");
    const end = cairoToUtc("2026-01-20", "11:30");
    expect(validateWorkingHours(config, start, end).ok).toBe(false);
  });

  it("يرفض الحجز يوم الإغلاق الأسبوعي (الجمعة)", () => {
    const start = cairoToUtc("2026-01-16", "11:00"); // Friday
    const end = cairoToUtc("2026-01-16", "11:30");
    expect(validateWorkingHours(config, start, end).ok).toBe(false);
  });

  it("يكتشف التداخل بين موعدين", () => {
    const a1 = cairoToUtc("2026-01-15", "11:00");
    const a2 = cairoToUtc("2026-01-15", "11:30");
    const b1 = cairoToUtc("2026-01-15", "11:15");
    const b2 = cairoToUtc("2026-01-15", "11:45");
    expect(overlaps(a1, a2, b1, b2)).toBe(true);
    expect(overlaps(a1, a2, a2, cairoToUtc("2026-01-15", "12:00"))).toBe(false);
  });
});

describe("قوالب الرسائل", () => {
  it("يستبدل المتغيرات", () => {
    const out = renderTemplate("مرحبًا {{patient}} موعدك {{date}} الساعة {{time}}", {
      patient: "منى",
      date: "2026-01-15",
      time: "11:00",
    });
    expect(out).toBe("مرحبًا منى موعدك 2026-01-15 الساعة 11:00");
  });
});

describe("التحقق من مدخلات أدوات الذكاء الاصطناعي", () => {
  it("يرفض الحجز بدون تأكيد صريح من المريض", () => {
    const res = toolSchemas.create_appointment.safeParse({
      patientName: "منى إبراهيم",
      phone: "01012345678",
      date: "2026-01-15",
      time: "11:00",
    });
    expect(res.success).toBe(false);
  });

  it("يقبل الحجز المكتمل والمؤكد", () => {
    const res = toolSchemas.create_appointment.safeParse({
      patientName: "منى إبراهيم",
      phone: "01012345678",
      date: "2026-01-15",
      time: "11:00",
      confirmed: true,
    });
    expect(res.success).toBe(true);
  });

  it("يرفض صيغ التاريخ الخاطئة", () => {
    const res = toolSchemas.search_available_slots.safeParse({ date: "15/01/2026" });
    expect(res.success).toBe(false);
  });

  it("يشترط الاسم والهاتف للاستعلام عن مواعيد المريض", () => {
    expect(toolSchemas.find_patient_appointments.safeParse({ phone: "01012345678" }).success).toBe(false);
    expect(
      toolSchemas.find_patient_appointments.safeParse({ phone: "01012345678", patientName: "منى إبراهيم" }).success,
    ).toBe(true);
  });

  it("يشترط التأكيد قبل الإلغاء", () => {
    expect(toolSchemas.cancel_appointment.safeParse({ appointmentId: 1, phone: "01012345678" }).success).toBe(false);
  });
});
