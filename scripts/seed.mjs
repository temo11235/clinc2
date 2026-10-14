/**
 * مولّد بيانات العرض — بيانات خيالية بالكامل (Demo data generator).
 *
 *   node scripts/seed.mjs                 -> العيادة + الأطباء + دليل العلاجات + الإعدادات
 *   node scripts/seed.mjs --full          -> سنة تشغيل كاملة (مرضى/مواعيد/زيارات/فواتير/مدفوعات/مصروفات/تذكيرات/AI/تدقيق)
 *   node scripts/seed.mjs --full --reset  -> يمسح بيانات العيادة أولاً ثم يعيد التوليد
 *
 * ⚠️ لا تشغّله على قاعدة بيانات فيها بيانات مرضى حقيقية.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

const envFile = (() => {
  try {
    return readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return "";
  }
})();
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const CLINIC_ID = Number(process.env.CLINIC_ID ?? 1);
const full = process.argv.includes("--full");
const reset = process.argv.includes("--reset");

/* --------------------------- مولد عشوائي ثابت --------------------------- */
let seedState = 20260101;
const rnd = () => {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p) => rnd() < p;
const DAY = 86400000;

/* --------------------------------- قوائم -------------------------------- */
const FIRST_M = ["أحمد","محمد","محمود","كريم","يوسف","عمر","مصطفى","خالد","طارق","إسلام","زياد","حسن","عبد الرحمن","شريف","باسم","هشام","وليد","عمرو","سامح","مينا","بيشوي","رامي","أيمن","فادي","نادر"];
const FIRST_F = ["منى","هدى","نورهان","سارة","مريم","ياسمين","دعاء","رنا","هبة","إيمان","أسماء","فاطمة","ندى","شيماء","آية","سلمى","جميلة","أميرة","دينا","رحمة","مارينا","كاترين","نسمة","علياء","بسنت"];
const LAST = ["إبراهيم","عبد الله","السيد","حسني","فؤاد","رمضان","شعبان","عادل","سمير","فتحي","زكي","الشناوي","المصري","عبد العزيز","صلاح","منصور","الجندي","قنديل","عطية","بدوي","الحلو","شلبي","نصار","مرسي","غانم"];
const AREAS = ["الدقي، الجيزة","المهندسين، الجيزة","مدينة نصر، القاهرة","المعادي، القاهرة","الهرم، الجيزة","مصر الجديدة، القاهرة","حدائق الأهرام، الجيزة","فيصل، الجيزة","العجوزة، الجيزة","شبرا، القاهرة","التجمع الخامس، القاهرة","6 أكتوبر، الجيزة","وسط البلد، القاهرة","الزمالك، القاهرة"];
const ALLERGIES = [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"حساسية البنسلين","حساسية اللاتكس","حساسية مخدر الليدوكايين","حساسية الأسبرين","حساسية اليود"];
const CONDITIONS = [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"ضغط مرتفع","سكري من النوع الثاني","أنيميا","قصور الغدة الدرقية","الربو","أمراض قلب — يحتاج مضاد حيوي وقائي"];
const MEDS = [null,null,null,null,null,null,null,null,null,null,null,null,"أسبرين 75 مجم يوميًا","ميتفورمين 500 مجم","كونكور 5 مجم","ثيروكسين 50 ميكروجرام","فنتولين بخاخ"];
const HISTORY = [null,"لا يوجد تاريخ مرضي مؤثر","سبق إجراء جراحة لوز","سبق تركيب جسر خزفي منذ 4 سنوات","تاريخ عائلي لأمراض اللثة","مدخن منذ 10 سنوات"];
const NOTES = [null,null,"يفضل المواعيد المسائية","يعاني من رهاب طبيب الأسنان — يحتاج تهدئة","يحضر مع مرافق دائمًا","يفضل التواصل عبر واتساب فقط","مريض محوّل من د. خارجي"];
const COMPLAINTS = ["ألم عند المضغ","حساسية من البارد والساخن","تورم في اللثة","كسر في حشو قديم","نزيف لثة متكرر","ألم شديد ليلاً","رغبة في تنظيف الأسنان","تغير لون الأسنان الأمامية","رائحة فم كريهة","ضرس عقل مطمور مؤلم","خلخلة في سن أمامي","كسر في جزء من الضرس"];
const EXAMS = ["فحص إكلينيكي كامل، اختبار الحيوية سلبي، وفحص اللثة المحيطة.","فحص بصري وأشعة محيطية؛ لا يوجد ارتشاح عظمي.","تسوس واضح بالسطح الإطباقي مع حساسية عند الطرق.","جيوب لثوية 4 مم مع نزيف عند السبر.","كسر بالحافة القاطعة دون تعرض للب.","تورم موضعي مع ارتفاع طفيف في الحرارة."];
const DIAGNOSES = ["تسوس عميق بالضرس","التهاب لثة مزمن","التهاب عصب حاد غير قابل للعلاج التحفظي","جير وتصبغات سطحية","كسر بالحشو القديم","خراج بجذر السن","التهاب دواعم السن","ضرس عقل مطمور جزئيًا","حساسية عاج مكشوف"];
const PLANS = ["حشو تجميلي وجلسة متابعة","علاج عصب على جلستين ثم تاج","تنظيف وتلميع كل 6 شهور","خلع وتركيب زرعة لاحقًا","حشو عصب ثم تاج زيركون","تنظيف عميق تحت اللثة على ربعين","مراقبة دورية كل 3 شهور"];
const FOLLOWUPS = [null,"متابعة بعد أسبوعين وتقييم الاستجابة","متابعة بعد شهر لتقييم اللثة","مراجعة خلال 6 شهور للتنظيف الدوري","متابعة بعد 3 أيام لإزالة الغرز"];
const PRESCRIPTIONS = [null,null,"مسكن 500 مجم عند اللزوم + غسول فم مطهر","مضاد حيوي 1 جم مرتين يوميًا لمدة 5 أيام","غسول كلورهيكسيدين مرتين يوميًا لمدة أسبوعين","مسكن مضاد للالتهاب بعد الأكل"];
const MATERIALS = ["كومبوزيت نانو","جوتا بيركا","زيركون","أملجم","أسمنت زجاجي","إيثيلين خزفي","حشو مؤقت"];
const PROC_NOTES = [null,null,"تم بدون مضاعفات","المريض تحمّل الإجراء جيدًا","استُخدم عازل مطاطي","احتاج تخديرًا إضافيًا"];
const REFUND_REASONS = ["إلغاء جزء من خطة العلاج","تحصيل زائد عن قيمة الفاتورة","إلغاء جلسة تجميل بناءً على طلب المريض","تعديل الفاتورة بعد المراجعة المحاسبية"];

// [البند, أقل مبلغ (قرش), أكبر مبلغ, عدد المرات شهريًا, احتمال الحدوث]
const EXPENSE_CATS = [
  ["رواتب الفريق", 18000000, 24000000, 1, 1],
  ["إيجار العيادة", 4500000, 4500000, 1, 1],
  ["خامات وتركيبات", 1200000, 3500000, 4, 1],
  ["معمل أسنان خارجي", 800000, 2800000, 3, 1],
  ["تعقيم ومستهلكات", 350000, 900000, 3, 1],
  ["كهرباء ومياه وإنترنت", 450000, 950000, 1, 1],
  ["صيانة أجهزة", 300000, 1800000, 1, 0.55],
  ["تسويق وإعلانات", 500000, 2500000, 1, 0.8],
  ["ضرائب ورسوم", 600000, 1500000, 1, 0.9],
  ["تدريب ومؤتمرات", 400000, 1200000, 1, 0.35],
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = (text, params) => client.query(text, params);

/** إدراج مجمّع سريع مع مراعاة حد المعاملات في PostgreSQL. */
async function bulk(table, columns, rows, returning = "id") {
  if (!rows.length) return [];
  const out = [];
  const chunkSize = Math.max(1, Math.floor(60000 / columns.length));
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const params = [];
    const tuples = chunk.map((row) => `(${row.map((v) => { params.push(v); return `$${params.length}`; }).join(",")})`);
    const sql = `insert into ${table} (${columns.join(",")}) values ${tuples.join(",")}${returning ? ` returning ${returning}` : ""}`;
    const r = await q(sql, params);
    if (returning) out.push(...r.rows);
  }
  return out;
}

await q("begin");
try {
  /* ------------------------------- العيادة ------------------------------- */
  await q(
    `insert into clinics (id, name, phone, address, maps_url)
     values ($1,$2,$3,$4,$5)
     on conflict (id) do update set name=excluded.name, phone=excluded.phone,
       address=excluded.address, maps_url=excluded.maps_url`,
    [CLINIC_ID, "عيادة النيل لطب وتجميل الأسنان", "+20225551234", "٢٥ شارع التحرير، الدقي، الجيزة", "https://maps.google.com/?q=30.0385,31.2122"],
  );
  await q(`select setval(pg_get_serial_sequence('clinics','id'), greatest((select max(id) from clinics), 1))`);

  if (reset) {
    await q(`delete from ai_messages where conversation_id in (select id from ai_conversations where clinic_id = $1)`, [CLINIC_ID]);
    for (const t of [
      "ai_tool_audit_logs","ai_conversations","notification_logs","notification_jobs","refunds","payments",
      "invoice_items","invoices","clinical_attachments","visit_procedures","visits","appointment_events",
      "appointments","patient_consents","patients","expenses","audit_logs","treatment_catalog","dentists","clinic_settings",
    ]) {
      await q(`delete from ${t} where clinic_id = $1`, [CLINIC_ID]);
    }
    // تنظيف عيادات الاختبار المتبقية (بالترتيب الصحيح للمفاتيح الأجنبية)
    const stale = await q(`select id from clinics where id <> $1 and name like 'عيادة اختبار%'`, [CLINIC_ID]);
    const staleIds = stale.rows.map((r) => r.id);
    if (staleIds.length) {
      await q(`delete from ai_messages where conversation_id in (select id from ai_conversations where clinic_id = any($1))`, [staleIds]);
      for (const t of [
        "ai_tool_audit_logs","ai_conversations","notification_logs","notification_jobs","refunds","payments",
        "invoice_items","invoices","clinical_attachments","visit_procedures","visits","appointment_events",
        "appointments","patient_consents","patients","expenses","audit_logs","treatment_catalog","dentists","clinic_settings",
      ]) {
        await q(`delete from ${t} where clinic_id = any($1)`, [staleIds]);
      }
      await q(`delete from clinics where id = any($1)`, [staleIds]);
    }
  }

  /* -------------------------------- الإعدادات ------------------------------- */
  const workDay = (open, close, closed = false) => ({ open, close, closed, breakStart: "14:00", breakEnd: "15:00" });
  const year = new Date().getFullYear();
  const config = {
    workingHours: [
      workDay("10:00", "21:00"), workDay("10:00", "21:00"), workDay("10:00", "21:00"),
      workDay("10:00", "21:00"), workDay("10:00", "21:00"), workDay("10:00", "21:00", true),
      workDay("11:00", "20:00"),
    ],
    holidays: [`${year}-01-07`, `${year}-01-25`, `${year}-04-25`, `${year}-05-01`, `${year}-07-23`, `${year}-10-06`],
    defaultDurationMinutes: 30,
    bufferMinutes: 10,
    slotStepMinutes: 15,
    reminder24h: true,
    reminder2h: true,
    faq: [
      { q: "ما هي مواعيد العمل؟", a: "من السبت إلى الخميس من 10 صباحًا حتى 9 مساءً (السبت حتى 8 مساءً). الجمعة إجازة." },
      { q: "هل الكشف يحتاج حجز مسبق؟", a: "نعم يُفضَّل الحجز المسبق لضمان موعد مناسب، ونستقبل الحالات الطارئة فورًا حسب التوافر." },
      { q: "ما هي طرق الدفع المتاحة؟", a: "نقدًا أو ببطاقة الدفع أو تحويل بنكي، ويمكن تقسيم العلاجات الكبيرة على دفعات." },
      { q: "كم تستغرق جلسة علاج العصب؟", a: "من 60 إلى 90 دقيقة للجلسة الواحدة، وغالبًا تحتاج جلستين." },
      { q: "كيف أستعد لموعد الخلع؟", a: "تناول وجبة خفيفة قبل الموعد، أحضر أي أشعة سابقة، وأبلغنا بأي أدوية سيولة دم تتناولها." },
      { q: "هل تتعاملون مع الأطفال؟", a: "نعم، لدينا متابعة لأسنان الأطفال من عمر 3 سنوات مع جلسات تعريفية مهدئة." },
      { q: "هل يوجد ضمان على التركيبات؟", a: "نعم، ضمان سنتين على تركيبات الزيركون بشرط الالتزام بالمتابعة الدورية." },
    ],
    policies: "يُرجى الحضور قبل الموعد بـ10 دقائق. الإلغاء أو التأجيل يتم قبل الموعد بـ4 ساعات على الأقل، وفي حالة التأخر أكثر من 15 دقيقة قد يُعاد جدولة الموعد حسب التوافر.",
    emergencyInstructions: "في حالات النزيف الشديد أو التورم المصحوب بصعوبة في التنفس أو البلع أو ارتفاع الحرارة الشديد، توجّه فورًا إلى أقرب مستشفى طوارئ أو اتصل بالإسعاف 123.",
    aiEnabled: true,
    aiGreeting: "أهلاً بك في عيادة النيل! أنا المساعد الافتراضي (مساعد آلي وليس طبيبًا). أقدر أساعدك في معرفة المواعيد المتاحة والحجز والتأجيل والإلغاء والاستفسار عن الأسعار.",
    templates: {
      confirmation: "مرحبًا {{patient}}، تم تأكيد موعدك في {{clinic}} يوم {{date}} الساعة {{time}}. للاستفسار: {{phone}}",
      reminder_24h: "تذكير: لديك موعد في {{clinic}} غدًا {{date}} الساعة {{time}}. للإلغاء أو التأجيل برجاء التواصل معنا.",
      reminder_2h: "تذكير: موعدك في {{clinic}} اليوم الساعة {{time}}. نرجو الحضور قبلها بـ10 دقائق.",
      cancelled: "تم إلغاء موعدك في {{clinic}} بتاريخ {{date}} الساعة {{time}}. يسعدنا حجز موعد جديد في أي وقت.",
      rescheduled: "تم تأجيل موعدك في {{clinic}} إلى {{date}} الساعة {{time}}.",
      followup: "نتمنى لك تحسنًا سريعًا {{patient}}. لو لديك أي استفسار بعد زيارتك لـ{{clinic}} تواصل معنا على {{phone}}.",
    },
  };
  await q(
    `insert into clinic_settings (clinic_id, key, value) values ($1,'clinic_config',$2)
     on conflict (clinic_id, key) do update set value = excluded.value, updated_at = now()`,
    [CLINIC_ID, JSON.stringify(config)],
  );

  /* ------------------------------- الأطباء ------------------------------- */
  const dentistSeed = [
    ["د. أحمد مصطفى", "تركيبات وزراعة الأسنان", "+201001112233", "#0d9488"],
    ["د. منة الله سمير", "علاج الجذور والحشو التجميلي", "+201002223344", "#6366f1"],
    ["د. كريم الشناوي", "جراحة الفم والأسنان", "+201003334455", "#f59e0b"],
    ["د. سلمى عبد العزيز", "تقويم وأسنان أطفال", "+201004445566", "#ec4899"],
  ];
  const dentistIds = [];
  for (const [name, specialty, phone, color] of dentistSeed) {
    const ex = await q(`select id from dentists where clinic_id=$1 and full_name=$2`, [CLINIC_ID, name]);
    if (ex.rows[0]) {
      await q(`update dentists set specialty=$2, phone=$3, color=$4, is_active=true where id=$1`, [ex.rows[0].id, specialty, phone, color]);
      dentistIds.push(ex.rows[0].id);
    } else {
      const r = await q(`insert into dentists (clinic_id, full_name, specialty, phone, color) values ($1,$2,$3,$4,$5) returning id`,
        [CLINIC_ID, name, specialty, phone, color]);
      dentistIds.push(r.rows[0].id);
    }
  }

  /* --------------------------- دليل العلاجات --------------------------- */
  const treatments = [
    ["كشف وتشخيص","Consultation","كشف",20000,20],
    ["كشف طوارئ","Emergency visit","كشف",35000,20],
    ["أشعة بانوراما","Panoramic X-ray","أشعة",35000,15],
    ["أشعة محيطية","Periapical X-ray","أشعة",12000,10],
    ["تنظيف وتلميع","Scaling & polishing","وقاية",60000,40],
    ["تنظيف عميق تحت اللثة","Deep scaling","وقاية",150000,60],
    ["فلورايد للأطفال","Fluoride application","وقاية",45000,20],
    ["حشو تجميلي","Composite filling","حشو",90000,45],
    ["حشو جذور (أمامي)","Anterior root canal","علاج جذور",180000,60],
    ["حشو عصب (ضرس)","Molar root canal","علاج جذور",250000,90],
    ["إعادة علاج جذور","Root canal retreatment","علاج جذور",350000,90],
    ["خلع بسيط","Simple extraction","جراحة",70000,30],
    ["خلع جراحي","Surgical extraction","جراحة",150000,45],
    ["خلع ضرس عقل مطمور","Impacted wisdom tooth","جراحة",180000,60],
    ["تركيب تاج زيركون","Zirconia crown","تركيبات",450000,60],
    ["تركيب جسر (3 وحدات)","3-unit bridge","تركيبات",1200000,75],
    ["طقم متحرك كامل","Complete denture","تركيبات",800000,60],
    ["زراعة سن","Dental implant","زراعة",1200000,90],
    ["رفع جيب أنفي","Sinus lift","زراعة",900000,90],
    ["تبييض بالليزر","Laser whitening","تجميل",300000,60],
    ["ابتسامة هوليوود (للسن)","Veneer per tooth","تجميل",550000,60],
    ["تقويم معدني (الدفعة الأولى)","Metal braces — first stage","تقويم",600000,60],
  ];
  // أوزان واقعية: الكشف والحشو والتنظيف هي الأكثر تكرارًا، والزراعة والفينير نادرة
  const WEIGHTS = {
    "كشف وتشخيص": 14, "كشف طوارئ": 3, "أشعة بانوراما": 4, "أشعة محيطية": 4,
    "تنظيف وتلميع": 9, "تنظيف عميق تحت اللثة": 3, "فلورايد للأطفال": 3,
    "حشو تجميلي": 14, "حشو جذور (أمامي)": 4, "حشو عصب (ضرس)": 6, "إعادة علاج جذور": 1,
    "خلع بسيط": 6, "خلع جراحي": 2, "خلع ضرس عقل مطمور": 2,
    "تركيب تاج زيركون": 3, "تركيب جسر (3 وحدات)": 1, "طقم متحرك كامل": 1,
    "زراعة سن": 1, "رفع جيب أنفي": 1, "تبييض بالليزر": 2,
    "ابتسامة هوليوود (للسن)": 1, "تقويم معدني (الدفعة الأولى)": 1,
  };
  const treatmentIds = [];
  for (const [ar, en, cat, price, dur] of treatments) {
    const ex = await q(`select id from treatment_catalog where clinic_id=$1 and name_ar=$2`, [CLINIC_ID, ar]);
    if (ex.rows[0]) {
      await q(`update treatment_catalog set name_en=$2, category=$3, price_minor=$4, duration_minutes=$5, is_active=true where id=$1`,
        [ex.rows[0].id, en, cat, price, dur]);
      treatmentIds.push({ id: ex.rows[0].id, name: ar, price, dur, w: WEIGHTS[ar] ?? 2 });
    } else {
      const r = await q(
        `insert into treatment_catalog (clinic_id, name_ar, name_en, category, price_minor, duration_minutes)
         values ($1,$2,$3,$4,$5,$6) returning id`, [CLINIC_ID, ar, en, cat, price, dur]);
      treatmentIds.push({ id: r.rows[0].id, name: ar, price, dur, w: WEIGHTS[ar] ?? 2 });
    }
  }
  const weightTotal = treatmentIds.reduce((acc, t) => acc + t.w, 0);
  const pickTreatment = () => {
    let r = rnd() * weightTotal;
    for (const t of treatmentIds) {
      r -= t.w;
      if (r <= 0) return t;
    }
    return treatmentIds[0];
  };

  // علاجان موقوفان لإظهار الحالتين
  await q(`update treatment_catalog set is_active=false where clinic_id=$1 and name_ar in ('أشعة محيطية','فلورايد للأطفال')`, [CLINIC_ID]);

  if (!full) {
    await q("commit");
    console.log(`✅ تم تجهيز العيادة (clinic_id=${CLINIC_ID}): ${dentistIds.length} أطباء، ${treatmentIds.length} علاجًا، وإعدادات كاملة.`);
    console.log("ℹ️  استخدم --full لتوليد سنة تشغيل كاملة.");
    await client.end();
    process.exit(0);
  }

  /* -------------------------------- المرضى -------------------------------- */
  const PATIENT_COUNT = 1200;
  const DAYS_PAST = 365;
  const DAYS_FUTURE = 21;
  const now = Date.now();

  const patientRows = [];
  const usedPhones = new Set();
  const patientMeta = [];
  for (let i = 0; i < PATIENT_COUNT; i++) {
    const female = chance(0.52);
    const name = `${female ? pick(FIRST_F) : pick(FIRST_M)} ${pick(LAST)}`;
    let phone;
    do { phone = `+2010${String(int(10000000, 99999999))}`; } while (usedPhones.has(phone));
    usedPhones.add(phone);
    // توزيع تواريخ التسجيل على سنة كاملة مع تكثيف الشهر الأخير
    const daysAgo = chance(0.18) ? int(0, 29) : int(30, DAYS_PAST);
    const createdAt = new Date(now - daysAgo * DAY);
    const birthYear = int(1952, 2018);
    patientMeta.push({ createdAt, name });
    patientRows.push([
      CLINIC_ID, `P-${String(1000 + i)}`, name, phone,
      chance(0.45) ? `patient${i}@example.com` : null,
      `${birthYear}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
      female ? "female" : "male",
      pick(AREAS),
      chance(0.45) ? `${pick(FIRST_M)} ${pick(LAST)} — 010${int(10000000, 99999999)}` : null,
      pick(HISTORY), pick(ALLERGIES), pick(MEDS), pick(CONDITIONS), pick(NOTES),
      pick(["whatsapp","whatsapp","whatsapp","whatsapp","sms","email"]),
      chance(0.06),
      createdAt, createdAt,
    ]);
  }
  const insertedPatients = await bulk(
    "patients",
    ["clinic_id","code","full_name","phone","email","birth_date","gender","address","emergency_contact",
     "medical_history","allergies","medications","conditions","notes","preferred_channel","marketing_opt_out","created_at","updated_at"],
    patientRows,
  );
  const patientIds = insertedPatients.map((r) => r.id);

  // الموافقات
  const consentRows = [];
  patientIds.forEach((pid, i) => {
    if (chance(0.88)) consentRows.push([CLINIC_ID, pid, "treatment_and_communication", true, "موافقة موقعة ورقيًا بالعيادة", patientMeta[i].createdAt]);
    if (chance(0.25)) consentRows.push([CLINIC_ID, pid, "photography_for_records", chance(0.8), "صور إكلينيكية للمتابعة فقط", patientMeta[i].createdAt]);
  });
  await bulk("patient_consents", ["clinic_id","patient_id","type","granted","notes","created_at"], consentRows, null);

  /* --------------- توزيع واقعي لعدد زيارات كل مريض في السنة --------------- */
  // 30% زيارة واحدة · 35% زيارتان لثلاث · 25% أربع لسبع · 10% خطة علاج طويلة
  const bag = [];
  for (const pid of patientIds) {
    const roll = rnd();
    const times = roll < 0.3 ? 1 : roll < 0.65 ? int(2, 3) : roll < 0.9 ? int(4, 7) : int(8, 14);
    for (let k = 0; k < times; k++) bag.push(pid);
  }
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  let bagIndex = 0;
  const nextPatient = () => {
    if (bagIndex >= bag.length) return pick(patientIds);
    return bag[bagIndex++];
  };

  /* ------------------------------- المواعيد ------------------------------- */
  const apptRows = [];
  const apptMeta = [];
  const holidaySet = new Set(config.holidays);

  for (let offset = -DAYS_PAST; offset <= DAYS_FUTURE; offset++) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() + offset);
    if (day.getUTCDay() === 5) continue;                       // الجمعة إجازة
    if (holidaySet.has(day.toISOString().slice(0, 10))) continue; // إجازات رسمية

    for (let di = 0; di < dentistIds.length; di++) {
      const dentistId = dentistIds[di];
      let cursor = 8 * 60 + di * 7;          // 08:00 UTC = 10:00 القاهرة
      const endMin = 18 * 60;                 // 18:00 UTC = 20:00 القاهرة
      const target = offset > 0 ? int(2, 4) : int(2, 5);
      let made = 0;

      while (made < target && cursor + 60 <= endMin) {
        if (cursor >= 12 * 60 - 30 && cursor < 13 * 60) { cursor = 13 * 60; continue; }  // الراحة
        if (chance(0.15)) { cursor += 30; continue; }

        const treatment = pickTreatment();
        const start = new Date(day);
        start.setUTCMinutes(cursor);
        const end = new Date(start.getTime() + treatment.dur * 60000);

        let status;
        if (offset < 0) {
          const roll = rnd();
          status = roll < 0.78 ? "completed" : roll < 0.89 ? "cancelled" : "no_show";
        } else if (offset === 0) {
          status = start.getTime() < now ? pick(["completed","completed","checked_in","no_show"]) : pick(["confirmed","scheduled","confirmed"]);
        } else {
          status = chance(0.5) ? "confirmed" : "scheduled";
        }

        const patientId = nextPatient();
        const source = chance(0.3) ? "ai" : "staff";
        const createdAt = new Date(Math.max(start.getTime() - int(2, 25) * DAY, now - (DAYS_PAST + 30) * DAY));

        apptRows.push([
          CLINIC_ID, patientId, dentistId, treatment.id, start, end, status, treatment.name,
          chance(0.22) ? pick(["المريض يفضل التخدير الموضعي البطيء","متابعة لخطة علاج سابقة","يحتاج تهدئة قبل الإجراء","مريض محوّل"]) : null,
          source, createdAt, createdAt,
        ]);
        apptMeta.push({ patientId, dentistId, start, end, status, treatment, source, createdAt });

        cursor += treatment.dur + 10;
        made++;
      }
    }
  }

  const insertedAppts = await bulk(
    "appointments",
    ["clinic_id","patient_id","dentist_id","treatment_id","starts_at","ends_at","status","type","notes","source","created_at","updated_at"],
    apptRows,
  );
  insertedAppts.forEach((r, i) => { apptMeta[i].id = r.id; });

  // أحداث المواعيد
  const eventRows = [];
  for (const a of apptMeta) {
    eventRows.push([CLINIC_ID, a.id, "created", JSON.stringify({ source: a.source }), a.source === "ai" ? "المساعد الذكي" : "فريق العيادة", a.createdAt]);
    if (a.status === "confirmed" || a.status === "completed" || a.status === "checked_in") {
      eventRows.push([CLINIC_ID, a.id, "status:confirmed", null, "فريق العيادة", new Date(a.start.getTime() - DAY)]);
    }
    if (a.status !== "scheduled") {
      eventRows.push([CLINIC_ID, a.id, `status:${a.status}`, null, "فريق العيادة", a.start]);
    }
  }
  await bulk("appointment_events", ["clinic_id","appointment_id","event","details","actor_label","created_at"], eventRows, null);

  /* ------------------------ الزيارات والإجراءات ------------------------ */
  const completed = apptMeta.filter((a) => a.status === "completed");
  const visitRows = completed.map((a) => [
    CLINIC_ID, a.patientId, a.id, a.dentistId, a.start,
    pick(COMPLAINTS), pick(EXAMS), pick(DIAGNOSES), pick(PLANS), pick(FOLLOWUPS), pick(PRESCRIPTIONS),
    a.start.getTime() < now - 14 * DAY, a.start, a.start,
  ]);
  const insertedVisits = await bulk(
    "visits",
    ["clinic_id","patient_id","appointment_id","dentist_id","visit_date","chief_complaint","examination",
     "diagnosis","treatment_plan","follow_up","prescription","locked","created_at","updated_at"],
    visitRows,
  );

  const TEETH = [11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,31,32,33,34,35,36,37,41,42,43,44,45,46,47];
  const procRows = [];
  const invoiceRows = [];
  const invoicePlan = [];
  let invoiceCounter = 1;

  insertedVisits.forEach((v, idx) => {
    const a = completed[idx];
    const count = int(1, 3);
    const items = [];
    for (let i = 0; i < count; i++) {
      const t = i === 0 ? a.treatment : pickTreatment();
      const tooth = chance(0.82) ? pick(TEETH) : null;
      procRows.push([
        CLINIC_ID, v.id, a.patientId, t.id, t.name, tooth,
        tooth ? pick(["O","M","D","MO","OD","MOD","B","L"]) : null,
        "completed", pick(MATERIALS), pick(PROC_NOTES), t.price, a.start,
      ]);
      items.push({ name: t.name, price: t.price, tooth });
    }
    const subtotal = items.reduce((s, it) => s + it.price, 0);
    const discount = chance(0.24) ? Math.round(subtotal * pick([0.05, 0.1, 0.15, 0.2])) : 0;
    const total = subtotal - discount;
    invoiceRows.push([
      CLINIC_ID, a.patientId, v.id,
      `INV-${a.start.getFullYear()}-${String(invoiceCounter++).padStart(5, "0")}`,
      a.start, subtotal, discount, total, "finalized",
      discount > 0 ? "خصم معتمد من إدارة العيادة" : null, a.start, a.start,
    ]);
    invoicePlan.push({ patientId: a.patientId, items, total, at: a.start });
  });

  await bulk(
    "visit_procedures",
    ["clinic_id","visit_id","patient_id","treatment_id","title","tooth_number","surfaces","status","materials","notes","price_minor","created_at"],
    procRows, null,
  );

  const insertedInvoices = await bulk(
    "invoices",
    ["clinic_id","patient_id","visit_id","number","issued_at","subtotal_minor","discount_minor","total_minor","status","notes","created_at","updated_at"],
    invoiceRows,
  );

  const itemRows = [];
  const paymentRows = [];
  insertedInvoices.forEach((inv, idx) => {
    const plan = invoicePlan[idx];
    for (const it of plan.items) itemRows.push([CLINIC_ID, inv.id, it.name, 1, it.price, it.price, it.tooth]);

    const roll = rnd();
    if (roll < 0.6) {
      paymentRows.push([CLINIC_ID, plan.patientId, inv.id, plan.total, pick(["cash","cash","cash","card","transfer"]),
        chance(0.3) ? `REF-${int(100000, 999999)}` : null, plan.at, plan.at]);
    } else if (roll < 0.88) {
      const first = Math.max(1, Math.round(plan.total * pick([0.3, 0.4, 0.5, 0.6])));
      paymentRows.push([CLINIC_ID, plan.patientId, inv.id, first, pick(["cash","card"]), null, plan.at, plan.at]);
      if (chance(0.5)) {
        const laterAt = new Date(Math.min(plan.at.getTime() + int(3, 25) * DAY, now));
        const rest = plan.total - first;
        const second = chance(0.6) ? rest : Math.max(1, Math.round(rest * 0.5));
        if (second > 0) paymentRows.push([CLINIC_ID, plan.patientId, inv.id, second, pick(["cash","card","transfer"]), null, laterAt, laterAt]);
      }
    }
  });

  await bulk("invoice_items", ["clinic_id","invoice_id","description","quantity","unit_price_minor","total_minor","tooth_number"], itemRows, null);
  const insertedPayments = await bulk(
    "payments",
    ["clinic_id","patient_id","invoice_id","amount_minor","method","reference","paid_at","created_at"],
    paymentRows, "id, patient_id, amount_minor, paid_at",
  );

  // فواتير مسودة (غير معتمدة بعد)
  const draftRows = [];
  for (let i = 0; i < 9; i++) {
    const t = pickTreatment();
    const at = new Date(now - int(0, 10) * DAY);
    draftRows.push([CLINIC_ID, pick(patientIds), null, `INV-${year}-D${String(i + 1).padStart(4, "0")}`, at, t.price, 0, t.price, "draft", "بانتظار مراجعة الحساب", at, at]);
  }
  const insertedDrafts = await bulk(
    "invoices",
    ["clinic_id","patient_id","visit_id","number","issued_at","subtotal_minor","discount_minor","total_minor","status","notes","created_at","updated_at"],
    draftRows,
  );
  await bulk("invoice_items", ["clinic_id","invoice_id","description","quantity","unit_price_minor","total_minor","tooth_number"],
    insertedDrafts.map((d, i) => [CLINIC_ID, d.id, draftRows[i][3].includes("D") ? "علاج مجدول" : "بند", 1, draftRows[i][5], draftRows[i][5], null]), null);

  /* -------------------------------- المرتجعات -------------------------------- */
  const refundRows = [];
  for (const p of insertedPayments) {
    const recent = new Date(p.paid_at).getTime() > now - 35 * DAY;
    if (!chance(recent ? 0.025 : 0.012)) continue;
    const amount = Math.round(Number(p.amount_minor) * pick([0.2, 0.25, 0.5]));
    if (amount <= 0) continue;
    refundRows.push([CLINIC_ID, p.patient_id, p.id, amount, pick(REFUND_REASONS),
      new Date(Math.min(new Date(p.paid_at).getTime() + int(1, 5) * DAY, now))]);
  }
  await bulk("refunds", ["clinic_id","patient_id","payment_id","amount_minor","reason","refunded_at"], refundRows, null);

  /* -------------------------------- المصروفات -------------------------------- */
  const expenseRows = [];
  for (let m = 0; m < 12; m++) {
    for (const [cat, min, max, times, prob] of EXPENSE_CATS) {
      if (!chance(prob)) continue;
      for (let t = 0; t < times; t++) {
        const when = new Date(now - (m * 30 + int(1, 28)) * DAY);
        if (when.getTime() > now) continue;
        expenseRows.push([CLINIC_ID, cat, times > 1 ? `${cat} — دفعة ${t + 1}` : `${cat} — مستحق شهري`, int(min, max), when, when]);
      }
    }
  }
  await bulk("expenses", ["clinic_id","category","description","amount_minor","spent_at","created_at"], expenseRows, null);

  /* ------------------------------ المرفقات ------------------------------ */
  // بيانات وصفية فقط (لا توجد ملفات فعلية — واجهة الرفع غير مفعّلة في هذا الإصدار)
  const attachRows = [];
  insertedVisits.forEach((v, idx) => {
    if (!chance(0.3)) return;
    const a = completed[idx];
    const kind = pick([
      ["xray-panoramic.jpg", "image/jpeg", int(380000, 1200000)],
      ["xray-periapical.png", "image/png", int(120000, 400000)],
      ["consent-form.pdf", "application/pdf", int(60000, 250000)],
      ["clinical-photo.jpg", "image/jpeg", int(200000, 900000)],
    ]);
    attachRows.push([CLINIC_ID, a.patientId, v.id, kind[0], kind[1], kind[2], `demo/clinic-${CLINIC_ID}/visit-${v.id}/${randomUUID()}`, a.start]);
  });
  await bulk("clinical_attachments", ["clinic_id","patient_id","visit_id","file_name","mime_type","size_bytes","storage_key","created_at"], attachRows, null);

  /* ---------------------------- التذكيرات والرسائل ---------------------------- */
  const jobRows = [];
  const jobMeta = [];
  const notifiable = apptMeta.filter((a) => a.start.getTime() > now - 45 * DAY);
  for (const a of notifiable) {
    const channel = pick(["whatsapp","whatsapp","whatsapp","sms","email"]);
    const plans = [
      ["confirmation", new Date(a.createdAt.getTime() + 60000)],
      ["reminder_24h", new Date(a.start.getTime() - DAY)],
      ["reminder_2h", new Date(a.start.getTime() - 2 * 3600000)],
    ];
    if (a.status === "cancelled") plans.push(["cancelled", new Date(a.start.getTime() - 5 * 3600000)]);
    if (a.status === "completed" && chance(0.4)) plans.push(["followup", new Date(a.start.getTime() + 2 * DAY)]);

    for (const [kind, when] of plans) {
      if (when.getTime() > now + DAYS_FUTURE * DAY) continue;
      const due = when.getTime() <= now;
      const failed = due && chance(0.07);
      const status = !due ? "pending" : failed ? "failed" : "sent";
      jobRows.push([
        CLINIC_ID, a.id, a.patientId, kind, channel, when, status, due ? (failed ? 3 : 1) : 0,
        `appt:${a.id}:${kind}:${a.start.toISOString()}`, JSON.stringify({ startsAt: a.start.toISOString() }),
        failed ? pick(["رقم غير مسجل على واتساب","انتهت مهلة الاتصال بالمزود","رفض المزود الرسالة خارج نافذة 24 ساعة"]) : null,
        when, when,
      ]);
      jobMeta.push({ kind, channel, status, when, patientId: a.patientId });
    }
  }
  const insertedJobs = await bulk(
    "notification_jobs",
    ["clinic_id","appointment_id","patient_id","kind","channel","scheduled_for","status","attempts","dedupe_key","payload","last_error","created_at","updated_at"],
    jobRows,
  );

  const logRows = [];
  insertedJobs.forEach((j, i) => {
    const meta = jobMeta[i];
    if (meta.status === "pending") return;
    const bodyByKind = {
      confirmation: "تم تأكيد موعدك في عيادة النيل. للاستفسار: 0225551234",
      reminder_24h: "تذكير: لديك موعد غدًا في عيادة النيل. برجاء الحضور قبل الموعد بـ10 دقائق.",
      reminder_2h: "تذكير: موعدك اليوم في عيادة النيل بعد ساعتين.",
      cancelled: "تم إلغاء موعدك في عيادة النيل. يسعدنا حجز موعد جديد.",
      followup: "نتمنى لك تحسنًا سريعًا. لو لديك أي استفسار بعد زيارتك تواصل معنا.",
    };
    logRows.push([
      CLINIC_ID, j.id, meta.patientId, meta.channel, `+2010*****${int(1000, 9999)}`,
      bodyByKind[meta.kind] ?? "رسالة من عيادة النيل",
      meta.status === "failed" ? "failed" : chance(0.72) ? "delivered" : "provider_accepted",
      meta.channel === "email" ? "dev-log" : "dev-log",
      `wamid.${randomUUID().slice(0, 14)}`,
      meta.status === "failed" ? "رفض المزود الرسالة" : null,
      meta.when,
    ]);
  });
  await bulk(
    "notification_logs",
    ["clinic_id","job_id","patient_id","channel","destination","body","status","provider_name","provider_message_id","error","created_at"],
    logRows, null,
  );

  /* ------------------------- محادثات المساعد الذكي ------------------------- */
  const convoSamples = [
    ["عايز أحجز موعد يوم الأحد الصبح","أقرب المواعيد المتاحة يوم الأحد: 10:00، 10:30، 11:15. تحب أحجزلك أنهي ميعاد؟","search_available_slots",true,false],
    ["الكشف بكام؟","الكشف والتشخيص 200 ج.م، والتنظيف يبدأ من 600 ج.م. السعر النهائي يتحدد بعد الفحص.","get_clinic_information",true,false],
    ["تمام احجزلي 11:15 باسم محمد سمير","تم تأكيد الحجز فعليًا في النظام يوم الأحد الساعة 11:15.","create_appointment",true,false],
    ["عايز ألغي ميعادي بكرة","تم إلغاء الموعد بعد التحقق من رقم الموبايل وتأكيدك.","cancel_appointment",true,false],
    ["العيادة فين بالظبط؟","٢٥ شارع التحرير، الدقي، الجيزة — ويوجد رابط خرائط جوجل.","get_clinic_information",true,false],
    ["عندي تورم ووجع شديد ومش عارف أبلع","ده عرض قد يحتاج تقييم عاجل. توجّه فورًا لأقرب طوارئ، وتم تحويلك لموظف الاستقبال.","request_human_assistance",true,true],
    ["ممكن أأجل ميعادي لبعد بكرة؟","تم تأجيل الموعد بنجاح بعد التحقق والتأكيد.","reschedule_appointment",true,false],
    ["في مواعيد متأخرة بعد الشغل؟","أيوه، متاح حتى 9 مساءً من السبت للخميس.","get_clinic_information",true,false],
    ["عايز أعرف مواعيدي القادمة","لم يتم العثور على مواعيد مطابقة للرقم المُدخل.","find_patient_appointments",false,false],
    ["بتعملوا زراعة أسنان؟ وبكام؟","نعم، زراعة السن تبدأ من 12,000 ج.م وتحتاج كشفًا وأشعة أولاً.","get_clinic_information",true,false],
    ["ابني عنده 5 سنين بتستقبلوا أطفال؟","نعم، لدينا د. سلمى متخصصة في أسنان الأطفال من عمر 3 سنوات.","get_clinic_information",true,false],
    ["ممكن أدفع على دفعات؟","نعم، يمكن تقسيم العلاجات الكبيرة على دفعات — سيتم الاتفاق مع الاستقبال.","get_clinic_information",true,false],
    ["سني اتكسر دلوقتي محتاج أجي حالاً","نستقبل الحالات الطارئة حسب التوافر، وتم تحويلك لموظف الاستقبال للتنسيق الفوري.","request_human_assistance",true,true],
    ["هل التقويم متاح عندكم؟","نعم، التقويم المعدني متاح والدفعة الأولى 6,000 ج.م بعد الكشف والأشعة.","get_clinic_information",true,false],
    ["عايز ميعاد النهاردة","للأسف مواعيد اليوم مكتملة، أقرب موعد متاح غدًا 10:30.","search_available_slots",true,false],
    ["شكراً ليكم","العفو! سعداء بخدمتك دائمًا. 😊","get_clinic_information",true,false],
    ["بتفتحوا الجمعة؟","الجمعة إجازة أسبوعية، ونعمل من السبت للخميس.","get_clinic_information",true,false],
    ["نسيت ميعادي امتى","من فضلك أرسل رقم الموبايل المسجل واسمك الكامل للتحقق.","find_patient_appointments",false,false],
    ["ممكن تحويلي لحد يكلمني؟","تم تحويل طلبك لموظف الاستقبال وسيتم التواصل معك خلال ساعات العمل.","request_human_assistance",true,true],
    ["التبييض بيستحمل قد إيه؟","نتيجة التبييض تدوم من سنة لسنتين حسب العادات الغذائية والتدخين.","get_clinic_information",true,false],
  ];
  const convoRows = convoSamples.map((c, i) => [
    CLINIC_ID, randomUUID(), pick(["web","web","web","whatsapp"]), c[4],
    new Date(now - int(0, 45) * DAY - i * 3600000), new Date(now - int(0, 45) * DAY),
  ]);
  const insertedConvos = await bulk("ai_conversations", ["clinic_id","public_id","channel","escalated","created_at","updated_at"], convoRows);

  const msgRows = [];
  const toolRows = [];
  insertedConvos.forEach((c, i) => {
    const [userMsg, botMsg, tool, success] = convoSamples[i];
    const when = convoRows[i][4];
    msgRows.push([c.id, "user", userMsg, when]);
    msgRows.push([c.id, "assistant", botMsg, new Date(when.getTime() + 4000)]);
    toolRows.push([CLINIC_ID, c.id, tool, JSON.stringify({ phone: `***${int(1000, 9999)}` }), success,
      JSON.stringify({ message: botMsg.slice(0, 160) }), success ? null : "لا يوجد ملف مريض بهذا الرقم",
      new Date(when.getTime() + 2000)]);
  });
  await bulk("ai_messages", ["conversation_id","role","content","created_at"], msgRows, null);
  await bulk("ai_tool_audit_logs", ["clinic_id","conversation_id","tool_name","args","success","result","error","created_at"], toolRows, null);

  /* ------------------------------ سجل العمليات ------------------------------ */
  const auditSamples = [
    ["create","patient","تسجيل مريض جديد"],["update","patient","تحديث بيانات مريض"],
    ["create","appointment","حجز موعد"],["status:completed","appointment","إنهاء موعد"],
    ["status:cancelled","appointment","إلغاء موعد"],["reschedule","appointment","تأجيل موعد"],
    ["create","visit","تسجيل زيارة سريرية"],["lock","visit","قفل سجل علاجي"],
    ["create","invoice","إنشاء فاتورة"],["finalize","invoice","اعتماد فاتورة"],
    ["payment","payment","تحصيل دفعة"],["refund","payment","تسجيل مرتجع"],
    ["create","expense","تسجيل مصروف"],["create","dentist","إضافة طبيب"],
    ["create","treatment","إضافة علاج للدليل"],["update","clinic_settings","تعديل مواعيد العمل"],
  ];
  const auditRows = [];
  for (let i = 0; i < 220; i++) {
    const [action, entity, label] = pick(auditSamples);
    auditRows.push([CLINIC_ID, "فريق العيادة", action, entity, String(int(1, 900)),
      JSON.stringify({ note: label }), new Date(now - int(0, 90) * DAY - int(0, 86399) * 1000)]);
  }
  await bulk("audit_logs", ["clinic_id","actor_label","action","entity","entity_id","metadata","created_at"], auditRows, null);

  /* ------------------------- تحديث آخر زيارة للمرضى ------------------------- */
  await q(
    `update patients p set last_visit_at = s.last_visit
     from (select patient_id, max(starts_at) as last_visit from appointments
           where clinic_id = $1 and status = 'completed' group by patient_id) s
     where p.id = s.patient_id and p.clinic_id = $1`,
    [CLINIC_ID],
  );

  await q("commit");

  const stats = await q(
    `select
      (select count(*) from patients where clinic_id=$1)::int p,
      (select count(*) from appointments where clinic_id=$1)::int a,
      (select count(*) from visits where clinic_id=$1)::int v,
      (select count(*) from visit_procedures where clinic_id=$1)::int vp,
      (select count(*) from invoices where clinic_id=$1)::int inv,
      (select count(*) from payments where clinic_id=$1)::int pay,
      (select count(*) from refunds where clinic_id=$1)::int ref,
      (select count(*) from expenses where clinic_id=$1)::int exp,
      (select count(*) from notification_jobs where clinic_id=$1)::int nj,
      (select count(*) from notification_logs where clinic_id=$1)::int nl,
      (select count(*) from clinical_attachments where clinic_id=$1)::int att,
      (select count(*) from ai_conversations where clinic_id=$1)::int ai,
      (select count(*) from audit_logs where clinic_id=$1)::int au,
      (select coalesce(sum(amount_minor),0) from payments where clinic_id=$1)::bigint collected,
      (select coalesce(sum(total_minor),0) from invoices where clinic_id=$1 and status='finalized')::bigint invoiced,
      (select coalesce(sum(amount_minor),0) from expenses where clinic_id=$1)::bigint spent`,
    [CLINIC_ID],
  );
  const s = stats.rows[0];
  const egp = (v) => `${(Number(v) / 100).toLocaleString("ar-EG", { maximumFractionDigits: 0 })} ج.م`;
  console.log(`\n✅ تم توليد سنة تشغيل كاملة للعيادة #${CLINIC_ID}\n`);
  console.log(`   👥 مرضى: ${s.p}        🗓️ مواعيد: ${s.a}        🩺 زيارات: ${s.v}      🦷 إجراءات: ${s.vp}`);
  console.log(`   🧾 فواتير: ${s.inv}     💵 مدفوعات: ${s.pay}     ↩️ مرتجعات: ${s.ref}    📉 مصروفات: ${s.exp}`);
  console.log(`   🔔 مهام تذكير: ${s.nj}  📨 رسائل: ${s.nl}       📎 مرفقات: ${s.att}    🤖 محادثات: ${s.ai}   🛡️ تدقيق: ${s.au}`);
  console.log(`\n   💰 التحصيل: ${egp(s.collected)}  |  🧾 الفواتير: ${egp(s.invoiced)}  |  📉 المصروفات: ${egp(s.spent)}`);
  console.log(`   ⏳ المستحقات: ${egp(Number(s.invoiced) - Number(s.collected))}\n`);
} catch (err) {
  await q("rollback");
  console.error("❌ فشل التهيئة:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
