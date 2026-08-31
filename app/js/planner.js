// مخطط الرحلة على الويب — من جدول طارق النمساوي: اليوم ثلاث خانات لا ساعات،
// سلة تجمع قبل التوزيع، رابط خرائط واحد لليوم، والفراغ محترم.
// «أضف مكانًا» يقتل حلقة الاسم←الخرائط←الجدول: Nominatim يحدد ونحن نرتب.
import { t, t as tt, isEN } from "/app/js/i18n.js";
import { el, cityName, countryName, MONTHS_AR, RAIN_AR } from "/app/js/ui.js";
import { Trips } from "/app/js/trips-store.js";
import { visaLine } from "/app/js/views.js";
import { activityIcon, eventIcon } from "/app/js/icons.js";

const SLOTS = [
  ["morning", "صباح"],
  ["afternoon", "بعد الظهر"],
  ["evening", "مساء"],
];

// نوافذ الفترات تقريبًا — لحساب ما يتاح في يومي السفر من أوقات الطيران.
const SLOT_WIN = { morning: [9, 12], afternoon: [13, 17], evening: [18, 22] };
function hm(x){ const m = /^(\d{1,2}):(\d{2})$/.exec(x || ""); return m ? +m[1] + (+m[2]) / 60 : null; }
// أي فترات يتاح ملؤها في اليوم i؟ يوما السفر يحكمهما وقتا الوصول والإقلاع.
function allowedSlots(trip, i, nDays){
  const all = SLOTS.map(([v]) => v);
  if (nDays <= 1) return all;
  // الانتقال من المطار وإليه جزء من اليوم لا هامش: الفعالية لا تبدأ قبل
  // أن تصل فندقك فعلًا، ولا تُحشر بعد أن تكون قد غادرت إلى المطار.
  const stay = (trip.stays || []).find(s => s.lat || s.lon);
  const drive = (typeof stay?.driveMin === "number" ? stay.driveMin : 30) / 60;
  if (i === 0){
    const arr = hm(trip.flights?.out?.arr);
    if (arr == null) return ["evening"];
    const ready = arr + 3 + drive;              // وصول + إجراءات + طريق
    // الفترة يجب أن تبدأ بعد استقرارك، لا أن ينتهي طرفها بعده: من يصل
    // فندقه التاسعة مساءً لا «مساء» له مهما بقي من الساعة.
    return all.filter(v => SLOT_WIN[v][0] >= ready);
  }
  if (i === nDays - 1){
    const dep = hm(trip.flights?.back?.dep);
    if (dep == null) return ["morning"];
    const mustLeave = dep - 3 - drive;          // موعد التوجه للمطار
    return all.filter(v => SLOT_WIN[v][1] <= mustLeave);
  }
  return all;
}
// أحداث السكن الموقوتة: الدخول = وصول الطائرة + ٣ ساعات مطار + زمن
// الطريق للفندق (مسافة حقيقية ÷ ٦٠ كم/س)، والخروج ١٢ ظهرًا دومًا.
function fmtT(t){
  const mins = Math.round(t * 60), H = Math.floor(mins / 60) % 24, M = mins % 60;
  return String(H).padStart(2, "0") + ":" + String(M).padStart(2, "0");
}
const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
  + "-" + String(d.getDate()).padStart(2, "0");
const kmAB = (a, b) => 111 * Math.hypot(a.lat - b.lat,
  (a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180));
// سكن ذلك اليوم — من ينتقل بين مدن له فندق لكل مرحلة.
function stayForDay(trip, dstr){
  const stays = (trip.stays || []).filter(s => s.lat || s.lon);
  // قد يتداخل مدى فندقين (سكن المرحلة الأولى ممتد إلى آخر الرحلة): الفندق
  // الذي دخلته أخيرًا هو فندق اليوم، فنرجّح الأحدث بداية لا الأول في القائمة.
  const fit = stays.filter(s => (!s.from || s.from <= dstr) && (!s.to || s.to >= dstr));
  if (fit.length) return fit.reduce((a, b) => (b.from || "") > (a.from || "") ? b : a);
  return stays[0] || null;
}

// مطار وصولك أنت — من رقم رحلتك إن عرفناه، وإلا أقرب مطار للمدينة.
function arrivalAirport(trip, city, store){
  const iata = trip.flights?.out?.to;
  if (iata && store.airportByIata){
    const a = store.airportByIata(iata);
    if (a && a.lat != null) return a;
  }
  const near = city && store.nearestAirport ? store.nearestAirport(city) : null;
  const a = near?.airport || near;
  return (a && a.lat != null) ? a : null;
}
function hotelEvents(trip, dstr, city, store){
  const evs = [];
  for (const st of trip.stays || []){
    if (st.from === dstr){
      let time = null, parts = null;
      const arr = hm(trip.flights?.out?.arr);
      if (arr != null && trip.start === dstr){
        const ap = arrivalAirport(trip, city, store);
        let driveMin = 30;
        if (typeof st.driveMin === "number") driveMin = st.driveMin;   // زمن قيادة حقيقي
        else if (ap && (st.lat || st.lon)){
          const km = 111 * Math.hypot(st.lat - ap.lat,
            (st.lon - ap.lon) * Math.cos(st.lat * Math.PI / 180));
          driveMin = Math.round(km / 60 * 60);
        }
        time = arr + 3 + driveMin / 60;
        parts = { arr: trip.flights.out.arr, driveMin,
                  ap: ap ? (ap.iata || "") : "", real: typeof st.driveMin === "number" };
      }
      evs.push({ kind: "in", name: st.name, time, parts });
    }
    if (st.to === dstr) evs.push({ kind: "out", name: st.name, time: 12 });
  }
  return evs;
}
/// أحداث اليوم الموقوتة: وصول الطائرة، دخول الفندق، خروجه، والتوجه للمطار.
/// وقتٌ يُكتب فقط حين يكون معلومًا حقًا — لا تخمين على الشبكة.
function timedEvents(trip, dstr, city, store, days){
  const evs = hotelEvents(trip, dstr, city, store);
  const last = days.length ? ymd(days[days.length - 1]) : "";
  const first = days.length ? ymd(days[0]) : "";
  const fo = trip.flights?.out || {}, fb = trip.flights?.back || {};
  if (dstr === first && hm(fo.arr) != null)
    evs.unshift({ kind: "land", name: fo.no || "", time: hm(fo.arr) });
  // أول يوم في مرحلة جديدة = يوم انتقال: نقول إلى أين، ونحسب زمنه إن أمكن.
  const legs = legsOf(trip);
  const li = legs.findIndex(l => l.from === dstr);
  if (li > 0){
    const prev = legs[li - 1], now = legs[li];
    const pc = store.cities.find(c => c.id === prev.cityId);
    const nc = store.cities.find(c => c.id === now.cityId);
    const key = "leg:" + prev.cityId + ">" + now.cityId;
    const mins = trip.dayStats?.[key]?.min;
    evs.unshift({ kind: "move", name: nc ? cityName(nc) : "",
                  from: pc ? cityName(pc) : "", time: 10, driveMin: mins });
    // دخول فندق المرحلة الجديدة موقوت بالانتقال نفسه: خرجت العاشرة، فتصل
    // بعد زمن القيادة — لا نتركه بلا ساعة كأنه حدث بلا مكان في اليوم.
    for (const ev of evs){
      if (ev.kind === "in" && ev.time == null && mins){
        ev.time = 10 + mins / 60;
        ev.move = { from: pc ? cityName(pc) : "", driveMin: mins };
      }
      // لا تُسلّم مفتاح فندقٍ بعد أن غادرت مدينته: يوم الانتقال يبدأ
      // بالخروج، ثم الطريق، ثم الدخول في المدينة الجديدة.
      if (ev.kind === "out" && ev.time >= 10) ev.time = 9.5;
    }
  }
  if (dstr === last && hm(fb.dep) != null){
    const st = stayForDay(trip, dstr);
    const drive = (typeof st?.driveMin === "number" ? st.driveMin : 30) / 60;
    // المغادرة للمطار: ٣ ساعات إجراءات + زمن الطريق قبل الإقلاع.
    evs.push({ kind: "toair", name: "", time: hm(fb.dep) - 3 - drive,
               driveMin: Math.round(drive * 60) });
    evs.push({ kind: "fly", name: fb.no || "", time: hm(fb.dep) });
  }
  return evs;
}

function eventSlot(ev, allowed){
  if (ev.time == null) return allowed[0] || "morning";
  if (ev.time <= 12.5) return "morning";
  if (ev.time < 18) return "afternoon";
  return "evening";
}

// لكل يوم لونه — في الجدول وعلى دبابيس الخريطة سواء.
const DAYC = ["#B4622E", "#1F8F7C", "#3A6EA5", "#8E5BA6", "#C2903B",
              "#4C8A4C", "#A5486B", "#556B2F", "#20808D", "#7A5C3E"];
const dayColor = (i) => DAYC[i % DAYC.length];

/// مراحل الرحلة — «في الغالب الشخص لا يسافر لمدينة واحدة» (طارق 2026-08-31):
/// شلادمينغ أربع ليالٍ ثم فيينا ثلاثًا. المرحلة = مدينة + مدى تواريخ، والرحلة
/// القديمة (مدينة واحدة) تُرقّى إلى مرحلة واحدة فلا يضيع شيء.
function legsOf(trip){
  if (Array.isArray(trip.legs) && trip.legs.length) return trip.legs;
  return trip.cityId
    ? [{ cityId: trip.cityId, from: trip.start || "", to: trip.end || trip.start || "" }]
    : [];
}
/// مرحلة ذلك اليوم — عليها تُبنى اقتراحاته وحلقته.
function legForDay(trip, dstr){
  const legs = legsOf(trip);
  return legs.find(l => (!l.from || l.from <= dstr) && (!l.to || l.to >= dstr))
    || legs[0] || null;
}

function daysOf(trip){
  const out = [];
  if (!trip.start) return out;
  const start = new Date(trip.start + "T00:00:00");
  const end = new Date((trip.end || trip.start) + "T00:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1))
    out.push(new Date(d));
  return out;
}

function fmtDay(d){
  return d.toLocaleDateString(isEN ? "en" : "ar", {
    weekday: "short", day: "numeric", month: "short" });
}

// عدّاد المجتمع: إضافةٌ من السجل تزيد «اختارها N» واحدًا — بلا هوية،
// نار-وانسَ، ومن الموقع الحي فقط كي لا تنتفخ الأعداد من التجارب.
const tallied = new Set(); // تبديل الاختيار ذهابًا وإيابًا لا يضخّم العدّ
function tallyPick(qid){
  if (!qid || tallied.has(qid) || location.hostname !== "souvenirtravel.app") return;
  tallied.add(qid);
  fetch("https://mcp.souvenirtravel.app/picked", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ qid }) }).catch(() => {});
}

// «وزّع لي»: القرار الذي كان على المستخدم — القريب مع القريب، والمطاعم مساءً،
// ويوما السفر خفيفان. سلسلة أقرب-جار تحفظ التماسك الجغرافي بلا عناقيد معقدة.
const FOOD_KINDS = ["طعام", "مقهى"];

// إغلاق أسبوعي: «مغلق كل اثنين» بيانات حقيقية لم يكن لها حقل، فكان المخطط
// يقترح ناشماركت يوم أحد ومتحف تاريخ الفنون يوم اثنين. الترقيم ISO (١ الاثنين
// … ٧ الأحد)، و`open_daily_months` استثناء الشهور التي يفتح فيها كل يوم.
const ISO_DAYS_AR = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس",
                     "الجمعة", "السبت", "الأحد"];
function closedWeekly(a, d){
  const cw = a && (a.closed_weekdays || a.cw);
  if (!Array.isArray(cw) || !cw.length || !d) return false;
  const iso = d.getDay() === 0 ? 7 : d.getDay();
  if (!cw.includes(iso)) return false;
  const ex = a.open_daily_months || a.odm;
  if (Array.isArray(ex) && ex.includes(d.getMonth() + 1)) return false;
  return true;
}
const closedDaysText = (a) => {
  const cw = a && (a.closed_weekdays || a.cw);
  return Array.isArray(cw) && cw.length
    ? cw.map(n => ISO_DAYS_AR[n - 1]).filter(Boolean).join("، ") : "";
};

// مكانٌ يبعد عن الفندق أكثر من هذا (بالدقائق قيادةً) يوم كامل لا فترة:
// بحيرة جبلية على بعد ٤٥ دقيقة تحتاج صباحًا وساعات مشي، لا عصرًا مزدحمًا.
const FAR_MIN = 40;
const isFar = (p) => (p.driveFromStayMin || 0) >= FAR_MIN;
function autoPlan(trip, days, city, store){
  let pool = trip.plan.slice();
  const caps = days.map((d, i) => allowedSlots(trip, i, days.length).length);
  const total = caps.reduce((a, b) => a + b, 0);
  // لا اختيارات بعد؟ نبدأ بأكثر ما اختاره مجتمع سوفينير.
  if (!pool.length && city){
    const reg = (store.attractions?.[city.id] || []).slice()
      .sort((a, b) => (b.added_count || 0) - (a.added_count || 0))
      .slice(0, Math.min(total, 9));
    for (const a of reg){
      trip.plan.push({ id: "p" + Date.now() + Math.random().toString(36).slice(2, 6),
        name: (isEN ? (a.name_en || a.name_ar) : (a.name_ar || a.name_en)),
        qid: a.qid, lat: a.lat || 0, lon: a.lon || 0,
        kind: a.kind || "", count: a.added_count || 0,
        roadM: a.road_m || 0, day: -1, slot: "" });
      tallyPick(a.qid);
    }
    pool = trip.plan.slice();
  }
  if (!pool.length) return false;

  const located = pool.filter(p => p.lat || p.lon);
  const blind = pool.filter(p => !(p.lat || p.lon));
  const depot0 = stayForDay(trip, ymd(days[0]));

  // كنسٌ حول الفندق: ترتيب الأماكن بزاويتها منه، فيصير كل يوم قطاعًا
  // متجاورًا — لا يوم يقطع الوادي ذهابًا وآخر يعود إليه.
  let ordered;
  if (depot0 && located.length){
    ordered = located.slice().sort((a, b) =>
      Math.atan2(a.lat - depot0.lat, a.lon - depot0.lon)
      - Math.atan2(b.lat - depot0.lat, b.lon - depot0.lon));
  } else {
    ordered = [];
    const rest = located.slice();
    if (rest.length){
      ordered.push(rest.shift());
      while (rest.length){
        const last = ordered[ordered.length - 1];
        let bi = 0, bd = Infinity;
        rest.forEach((p, i) => { const dd = kmAB(p, last); if (dd < bd){ bd = dd; bi = i; } });
        ordered.push(rest.splice(bi, 1)[0]);
      }
    }
  }
  ordered.push(...blind);

  // حصص الأيام: الأيام الكاملة أولًا، ثم يوما السفر إن فاض شيء.
  const quota = caps.map(() => 0);
  const fillOrder = [];
  for (let i = 1; i < days.length - 1; i++) fillOrder.push(i);
  if (days.length > 1){ fillOrder.push(0, days.length - 1); }
  else fillOrder.push(0);
  let left = Math.min(ordered.length, total);
  while (left > 0){
    let moved = false;
    for (const i of fillOrder){
      if (left > 0 && quota[i] < caps[i]){ quota[i]++; left--; moved = true; }
    }
    if (!moved) break;
  }
  let over = ordered.length - total;
  if (over > 0){
    const fulls = fillOrder.filter(i => caps[i] >= 3);
    const tgt = fulls.length ? fulls : fillOrder;
    let j = 0;
    while (over > 0){ quota[tgt[j % tgt.length]]++; j++; over--; }
  }

  let cursor = 0;
  days.forEach((d, i) => {
    // اليوم الذي فيه مكان بعيد يُخفَّف إلى محطتين — الطريق نفسه نصف اليوم.
    let cap = quota[i];
    const peek = ordered.slice(cursor, cursor + cap);
    if (peek.some(isFar)) cap = Math.min(cap, 2);
    const group = ordered.slice(cursor, cursor + cap);
    cursor += cap;
    const depot = stayForDay(trip, ymd(d)) || depot0;
    // ترتيب اليوم حلقةً: من باب الفندق إلى الأقرب فالأقرب، والعودة إليه.
    let seq = group.filter(p => p.lat || p.lon);
    const noloc = group.filter(p => !(p.lat || p.lon));
    if (depot && seq.length){
      const rest = seq.slice(); seq = [];
      let cur = depot;
      while (rest.length){
        let bi = 0, bd = Infinity;
        rest.forEach((p, k) => { const dd = kmAB(p, cur); if (dd < bd){ bd = dd; bi = k; } });
        cur = rest[bi]; seq.push(rest.splice(bi, 1)[0]);
      }
    }
    const dayGroup = seq.concat(noloc);

    // التعليل — الشفافية تقنع أكثر من السحر.
    dayGroup.forEach((p, k) => {
      // كل تعليل يحمل رقمًا أو لا يُكتب: «الأقرب إليه» كلامٌ لا يقيس شيئًا،
      // والمسافة تقيس. وما دون الكيلومتر يُقال بالأمتار لا بوصف مبهم.
      const near = (q) => {
        if (!q || !(p.lat || p.lon) || !(q.lat || q.lon)) return "";
        const km = kmAB(p, q);
        return km < 1 ? tt`${Math.max(50, Math.round(km * 1000 / 50) * 50)} م من ${q.name}`
                      : tt`~${Math.round(km)} كم من ${q.name}`;
      };
      p.why = k === 0 ? near(depot) : near(dayGroup[k - 1]);
    });
    if (depot && seq.length){
      const last = seq[seq.length - 1];
      const back = Math.round(kmAB(last, depot));
      last.why = [last.why, tt`ثم العودة للفندق (~${back} كم)`]
        .filter(Boolean).join(" · ");
    }

    const slots = allowedSlots(trip, i, days.length).slice();
    const taken = new Set();
    // مَن أُسند في هذه الجولة وحده يُتخطى لاحقًا. الشرط القديم كان يتخطى
    // كل مكان صادف أنه في هذا اليوم من توزيع سابق، فيبقى بفترة لم تعد تصلح.
    const done = new Set();
    // البعيد يحجز الصباح أولًا — الطريق طويل واليوم يبدأ مبكرًا.
    for (const p of dayGroup){
      if (isFar(p) && slots.includes("morning") && !taken.has("morning")){
        p.day = i; p.slot = "morning"; taken.add("morning"); done.add(p.id);
        p.why = [p.why, tt`الطريق إليها ${p.driveFromStayMin} د — انطلاق مبكر`]
          .filter(Boolean).join(" · ");
      }
    }
    for (const p of dayGroup){
      if (FOOD_KINDS.includes(p.kind) && slots.includes("evening") && !taken.has("evening")){
        p.day = i; p.slot = "evening"; taken.add("evening"); done.add(p.id);
        p.why = [p.why, tt("المطاعم والمقاهي مساءً")].filter(Boolean).join(" · ");
      }
    }
    let ci = 0;
    for (const p of dayGroup){
      if (done.has(p.id)) continue;
      const free = slots.find(x => !taken.has(x));
      p.day = i; p.slot = free || slots[ci % slots.length] || "";
      if (free) taken.add(free); ci++;
    }
    if (days.length > 1 && (i === 0 || i === days.length - 1)){
      const why = i === 0 ? tt("بعد وصولك") : tt("قبل إقلاعك");
      for (const p of dayGroup)
        p.why = [p.why, why].filter(Boolean).join(" · ");
    }
  });
  ordered.slice(cursor).forEach(p => { p.day = -1; p.slot = ""; });
  return true;
}

// إدراج الملتحقين بعد توزيع قائم: لا نبعثر ما استقر — كل معلق ينضم
// لليوم الأقرب لمساره وفي أول فترة حرة فيه.
function placePending(trip, days){
  const pending = trip.plan.filter(p => p.day < 0 || p.day >= days.length);
  if (!pending.length) return false;
  for (const p of pending){
    let best = -1, bd = Infinity;
    days.forEach((d, i) => {
      const slots = allowedSlots(trip, i, days.length);
      if (!slots.length) return;
      const mine = trip.plan.filter(x => x.day === i && (x.lat || x.lon));
      let dist = 0;
      if (mine.length && (p.lat || p.lon)){
        const cx = mine.reduce((a, x) => a + x.lat, 0) / mine.length;
        const cy = mine.reduce((a, x) => a + x.lon, 0) / mine.length;
        dist = Math.hypot(p.lat - cx, (p.lon - cy) * Math.cos(p.lat * Math.PI / 180));
      }
      if (closedWeekly(p, d)) return;   // مغلق ذلك اليوم — لا يُقترح فيه
      const load = trip.plan.filter(x => x.day === i).length / slots.length;
      const score = dist + load * 0.05;
      if (score < bd){ bd = score; best = i; }
    });
    if (best < 0) continue;
    const slots = allowedSlots(trip, best, days.length);
    const taken = new Set(trip.plan.filter(x => x.day === best).map(x => x.slot));
    p.day = best;
    if (FOOD_KINDS.includes(p.kind) && slots.includes("evening") && !taken.has("evening"))
      p.slot = "evening";
    else p.slot = slots.find(x => !taken.has(x)) || slots[0] || "";
    p.why = "";   // لا تعليل بلا رقم — سطرٌ لا يفيد القارئ لا يُكتب
  }
  return true;
}

let nominatimTimer = null;
async function searchPlaces(q, near, bounded){
  const params = { q, format: "json", limit: "6",
    "accept-language": isEN ? "en" : "ar" };
  if (near && near.lat != null){
    // صندوق ~40كم حول المدينة: انحياز دائمًا، وحصر صارم عند bounded (الفنادق).
    const d = 0.35;
    params.viewbox = [near.lon - d, near.lat + d, near.lon + d, near.lat - d].join(",");
    if (bounded) params.bounded = "1";
  }
  const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams(params);
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  return r.ok ? r.json() : [];
}

export function planner(ctx, tripId, render){
  const { store } = ctx;
  const trip = Trips.all().find(x => x.id === tripId);
  const root = el("div");
  if (!trip){
    root.append(el("div.empty", {}, t("الرحلة غير موجودة.")));
    return root;
  }
  trip.plan = trip.plan || [];
  // تعليلٌ قديم بلا رقم يبقى محفوظًا في خطط وُزّعت قبل حذفه — يُمحى عند
  // القراءة، فلا يرى المستخدم سطرًا قررنا أنه لا يفيده.
  // تعليلٌ بلا رقم لا يفيد القارئ: «الأقرب إليه»، «قريبة جدًا»، «أُضيفت
  // للأقرب» — كلها بقيت محفوظة في خطط وُزّعت قبل هذه القاعدة، فتُمحى عند
  // القراءة. ويبقى ما فيه قياس: كيلومترات، دقائق، أمتار.
  const DEAD_WHY = [/أُضيفت للأقرب/, /Joined the day whose route/,
                    /— الأقرب إليه/, /Nearest to it/,
                    /قريبة جدًا من/, /Very close to/,
                    /^نقطة انطلاق اليوم$/, /^The day.s starting point$/];
  {
    let cleaned = 0;
    for (const p of trip.plan){
      if (!p.why) continue;
      const kept = p.why.split(" · ").filter(x => !DEAD_WHY.some(d => d.test(x)));
      const next = kept.join(" · ");
      if (next !== p.why){ p.why = next; cleaned++; }
    }
    if (cleaned) Trips.update(tripId, trip);
  }
  trip.flights = trip.flights || { out: {}, back: {} };
  trip.stays = trip.stays || [];
  const save = () => Trips.update(tripId, trip);

  const city = trip.cityId ? store.cities.find(c => c.id === trip.cityId) : null;

  // الخطة تحمل نسخة من إحداثيات كل مكان يوم أُضيف — فإن صححنا السجل بعدها
  // (دبوس انتقل من قمة الجبل إلى محطة الوادي) وجب أن تلحق الخطة به.
  if (city){
    const byQid = {};
    for (const a of (store.attractions?.[city.id] || [])) byQid[a.qid] = a;
    let moved = 0;
    for (const p of trip.plan){
      const a = p.qid && byQid[p.qid];
      if (!a || !(a.lat || a.lon)) continue;
      if (Math.abs(a.lat - p.lat) > 1e-5 || Math.abs(a.lon - p.lon) > 1e-5){
        p.lat = a.lat; p.lon = a.lon; p.roadM = a.road_m || 0; moved++;
      }
      if (!p.en && a.name_en){ p.en = a.name_en; moved++;
      }
    }
    if (moved) save();
  }
  const titleCities = legsOf(trip)
    .map(l => store.cities.find(c => c.id === l.cityId))
    .filter(Boolean).map(cityName).join(" + ");
  root.append(el("div.hero3", {},
    el("div.herorow", {},
      el("h1", {}, t`خطة رحلتك${titleCities ? tt(" إلى ") + titleCities : ""}`),
      el("a.circle", { href: "#/trips" }, "‹")),
    // «أضف مدينة أخرى لهذه الرحلة» — المدخل الأول لتعدد المدن (طارق).
    el("div.addcity", { onclick: () => openAddCity() },
      el("span.plus", {}, "+"),
      el("span", {}, t("أضف مدينة أخرى لهذه الرحلة")))));

  /// لوحة اختيار المدينة الثانية: بحث في مدننا، ثم مدى تواريخها داخل الرحلة.
  function openAddCity(){
    const box = el("div.card", { style: "margin-bottom:14px" });
    const input = el("input", { placeholder: t("اسم المدينة…"), style: "width:100%" });
    const hits = el("div");
    input.oninput = () => {
      const q = input.value.trim().toLowerCase();
      hits.replaceChildren();
      if (q.length < 2) return;
      const found = store.cities.filter(c =>
        (c.name_ar || "").includes(q) || (c.name_en || "").toLowerCase().includes(q))
        .filter(c => !legsOf(trip).some(l => l.cityId === c.id)).slice(0, 6);
      for (const c of found){
        hits.append(el("button.srow", { style: "width:100%;text-align:start",
          onclick: () => {
            const legs = legsOf(trip).slice();
            const last = legs[legs.length - 1];
            // قسمة أولى معقولة: المدينة الجديدة تأخذ آخر ثلث الرحلة، والسابقة
            // تنتهي عندها. والتواريخ تُعدَّل بعدها من «مراحل الرحلة».
            const all = daysOf(trip);
            let from = last?.to || trip.start || "";
            let to = trip.end || from;
            if (all.length >= 3){
              const cut = all[Math.max(1, all.length - Math.max(1, Math.round(all.length / 3)))];
              from = ymd(cut); to = ymd(all[all.length - 1]);
              if (last) last.to = from;
            }
            legs.push({ cityId: c.id, from, to });
            trip.legs = legs;
            if (!trip.end || trip.end < to) trip.end = to;
            save(); render();
          } },
          el("div", {}, el("div.t", {}, cityName(c)),
            el("div.s", {}, countryName(c)))));
      }
    };
    box.append(el("h2", { style: "margin-bottom:8px" }, t("أضف مدينة أخرى لهذه الرحلة")),
      input, hits);
    inner.prepend(box);
    input.focus();
  }

  const inner = el("div.section");
  root.append(inner);

  // ── بطاقة الصدق: ما لا يضمنه أي ذكاء مولِّد — تأشيرة مراجَعة من مصدر
  //    رسمي، طقس أرقام حقيقية، طيران متحقق منه. تركب أعلى كل خطة. ──
  if (city){
    const facts = el("div.rows.factrows");

    // التواريخ — انتقلت من رأس الصفحة إلى هنا، وتُعدَّل في مكانها.
    const ds = el("input", { type: "date", value: trip.start || "" });
    const de = el("input", { type: "date", value: trip.end || "" });
    ds.onchange = de.onchange = () => {
      if (!ds.value) return;
      trip.start = ds.value; trip.end = de.value || ds.value; save(); render();
    };
    facts.append(el("div.row", { style: "flex-wrap:wrap;gap:6px;align-items:center" },
      el("span.who", {}, "📅 " + tt("بداية الرحلة")), ds,
      el("span.who", {}, tt("نهاية الرحلة")), de));

    // مراحل الرحلة: مدينة لكل مدى تواريخ — تُعدَّل هنا في مكانها.
    const legs0 = legsOf(trip);
    if (legs0.length > 1){
      legs0.forEach((l, i) => {
        const c = store.cities.find(x => x.id === l.cityId);
        const lf = el("input", { type: "date", value: l.from || "" });
        const lt = el("input", { type: "date", value: l.to || "" });
        lf.onchange = lt.onchange = () => {
          l.from = lf.value; l.to = lt.value;
          trip.legs = legs0;
          if (trip.end && l.to > trip.end) trip.end = l.to;
          if (trip.start && l.from < trip.start) trip.start = l.from;
          save(); render();
        };
        facts.append(el("div.row", { style: "flex-wrap:wrap;gap:6px;align-items:center" },
          el("span.who", {}, "📍 " + (c ? cityName(c) : "")), lf, lt,
          legs0.length > 1 ? el("button", { style: "border:none;background:none;"
            + "cursor:pointer;color:var(--deep)", onclick: () => {
              trip.legs = legs0.filter((_, k) => k !== i);
              save(); render();
            } }, "✕") : null));
      });
    }

    // رقم الرحلة وأوقاتها — يدخلها المستخدم فتحكم يومي السفر في الجدول والتوزيع.
    // رقم الرحلة أو الأوقات — لا كلاهما: الرقم يجلب الأوقات من الخادم،
    // وإن تعذر الجلب انفتح الإدخال اليدوي.
    const flightRow = (dir, lbl) => {
      const f = trip.flights[dir];
      const row = el("div.row", { style: "flex-wrap:wrap;gap:6px;align-items:center" },
        el("span.who", {}, "✈️ " + lbl));
      if ((f.dep || f.arr) && !f.editing){
        row.append(
          el("span", {}, (f.no ? f.no + " — " : "")
            + tt`إقلاع ${f.dep || "؟"} · وصول ${f.arr || "؟"}`),
          el("button.chip", { onclick: () => { f.editing = true; save(); render(); } },
            "✎"));
        return row;
      }
      const no = el("input", { placeholder: t("رقم الرحلة"), value: f.no || "",
        style: "width:96px" });
      if (f.manual || f.editing){
        const dp = el("input", { type: "time", value: f.dep || "" });
        const ar2 = el("input", { type: "time", value: f.arr || "" });
        const done = () => { f.no = no.value.trim(); f.dep = dp.value;
          f.arr = ar2.value; f.editing = false; save(); render(); };
        no.onchange = dp.onchange = ar2.onchange = done;
        row.append(no, el("span.det", {}, t("إقلاع")), dp,
                   el("span.det", {}, t("وصول")), ar2);
        return row;
      }
      const st = el("span.det");
      row.append(no,
        el("button.chip", { onclick: async () => {
          const v = no.value.trim().toUpperCase().replace(/\s+/g, "");
          if (!v) return;
          f.no = v; st.textContent = "…";
          try {
            const date = dir === "out" ? trip.start : trip.end;
            const r = await fetch("https://mcp.souvenirtravel.app/flight?no="
              + encodeURIComponent(v) + (date ? "&date=" + date : ""));
            const j = await r.json();
            if (j.ok){
              f.dep = j.dep; f.arr = j.arr;
              if (j.to) f.to = j.to;
              // مطار جديد ⇐ زمن الطريق يُعاد حسابه
              for (const st of trip.stays || []) delete st.driveMin;
              save(); render(); return;
            }
          } catch {}
          f.manual = true; save(); render();
        } }, t("أحضر الأوقات")),
        el("a", { href: "#", style: "font-size:12px", onclick: (e) => {
          e.preventDefault(); f.no = no.value.trim(); f.manual = true; save(); render();
        } }, t("أو أدخل الأوقات يدويًا")), st);
      return row;
    };
    facts.append(flightRow("out", tt("رحلة الذهاب")),
                 flightRow("back", tt("رحلة العودة")));

    // السكن — فندق لكل مرحلة. البحث محصور بمدينة المرحلة المختارة، وإلا
    // ما ظهر فندق فيينا أبدًا ما دامت الرحلة تبدأ من شلادمينغ.
    const legs = legsOf(trip);
    const legCity = i => store.cities.find(c => c.id === legs[i]?.cityId) || city;
    const legPick = el("select", { style: "font:inherit;padding:3px 6px" },
      ...legs.map((l, i) => el("option", { value: String(i) }, cityName(legCity(i)))));
    const stayIn = el("input", { placeholder: t("اكتب اسم فندقك أو شقتك…"),
      style: "flex:1;min-width:180px" });
    const stayRes = el("div");
    let stayTimer = null;
    stayIn.oninput = () => {
      clearTimeout(stayTimer);
      const q = stayIn.value.trim(); stayRes.replaceChildren();
      if (q.length < 3) return;
      stayTimer = setTimeout(async () => {
        const i = +legPick.value || 0;
        const leg = legs[i];
        let hits = await searchPlaces(q, legCity(i), true).catch(() => []);
        // لا نترك الباحث بلا نتيجة لضيق الصندوق: نوسّع الانحياز ثم نصفّي بالمسافة.
        if (!hits.length){
          const near = legCity(i);
          hits = (await searchPlaces(q, near, false).catch(() => []))
            .filter(h => !near?.lat || kmAB({ lat: +h.lat, lon: +h.lon }, near) < 60);
        }
        stayRes.replaceChildren();
        if (!hits.length){
          stayRes.append(el("div.s", { style: "padding:4px 2px" },
            tt`لا نتيجة بهذا الاسم في ${cityName(legCity(i))}`));
          return;
        }
        for (const h of hits.slice(0, 5)){
          stayRes.append(el("button.srow", { style: "width:100%;text-align:start",
            onclick: () => {
              trip.stays.push({ id: "s" + Date.now(), name: h.display_name.split(",")[0],
                lat: +h.lat, lon: +h.lon,
                from: leg?.from || trip.start || "",
                to: leg?.to || trip.end || "" });
              save(); render();
            } },
            el("div", {},
              el("div.t", {}, h.display_name.split(",")[0]),
              el("div.s", {}, h.display_name.split(",").slice(1, 3).join("،")))));
        }
      }, 400);
    };
    facts.append(el("div.row", { style: "flex-wrap:wrap;gap:6px;align-items:center" },
      el("span.who", {}, "🏨 " + tt("السكن")),
      ...(legs.length > 1 ? [legPick] : []), stayIn), stayRes);
    for (const st of trip.stays){
      const fi = el("input", { type: "date", value: st.from || "" });
      const ti = el("input", { type: "date", value: st.to || "" });
      fi.onchange = ti.onchange = () => {
        st.from = fi.value; st.to = ti.value; save(); render(); };
      facts.append(el("div.row", { style: "flex-wrap:wrap;gap:6px;align-items:center" },
        el("span", {}, "🏨 " + st.name),
        el("span.det", {}, t("دخول")), fi,
        el("span.det", {}, t("خروج")), ti,
        el("button", { style: "border:none;background:none;cursor:pointer",
          onclick: () => {
            trip.stays = trip.stays.filter(x => x.id !== st.id); save(); render();
          } }, "✕")));
    }

    const vl = visaLine(ctx, city);
    facts.append(el("div.row", {},
      el("span.who", {}, "🛂 " + (vl
        ? vl
        : t("اختر جوازك من صفحة المدينة لترى حكم التأشيرة")))));
    if (trip.start){
      const m = new Date(trip.start + "T00:00:00").getMonth() + 1;
      const w = ctx.store.temps ? ctx.store.temps(city, m) : null;
      if (w){
        const rw = { none: RAIN_AR.r0, light: RAIN_AR.r1,
                     moderate: RAIN_AR.r2, heavy: RAIN_AR.r3 }[ctx.store.rainLevel(w.p_mm_avg)];
        facts.append(el("div.row", {}, el("span.who", {},
          "🌤 " + tt`طقس ${MONTHS_AR[m - 1]} هناك: ${Math.round(w.t_max_avg_c)}° نهارًا، ${Math.round(w.t_min_avg_c)}° ليلًا — ${rw}`)));
      }
    }
    inner.append(el("div.card", { style: "margin-bottom:14px" },
      el("h2", { style: "margin-bottom:6px" }, t("بيانات رحلتك")),
      facts,
      el("div.det", { style: "margin-top:6px" },
        t("من مصادر رسمية وأرقام حقيقية — لا تخمين. القواعد تتغير، تحقق قبل السفر."))));
  }

  // رحلة بلا تواريخ بعد — الخانة في الحقائق؛ هذه البطاقة لرحلة بلا مدينة فقط.
  if (!trip.start && !city){
    const ts = el("input", { type: "date" });
    const te = el("input", { type: "date" });
    inner.append(el("div.card", { style: "margin-bottom:14px" },
      el("h2", { style: "margin-bottom:8px" }, t("متى رحلتك؟")),
      el("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, ts, te,
        el("button.btn", { onclick: () => {
          if (!ts.value) return;
          trip.start = ts.value; trip.end = te.value || ts.value;
          save(); render();
        } }, t("اعتمد التواريخ")))));
  }

  const days = daysOf(trip);
  const planOf = (qid) => trip.plan.find(p => p.qid === qid);

  // ── معالم وفعاليات مقترحة: العين تنتقي — إطار الشفق مع ✓ يقول:
  //    ستُوزَّع عند «وزّع الآن». لا سلة: الاختيار كله يُرى في هذا الصف. ──
  const addBox = el("div.card", { style: "margin-bottom:14px" });
  const results = el("div");
  // المغلق لا يُقترح: لا المغلق الآن (closed_until)، ولا المغلق في أيام
  // رحلتك نفسها (closed_ranges) — كإجازة مطعم معلنة بعد أسبوعين. الثغرة
  // التي كشفها راصد المواسم: بياناتٌ صحيحة لا يقرؤها المنطق.
  const today = new Date().toISOString().slice(0, 10);
  const tFrom = trip.start || today, tTo = trip.end || tFrom;
  const closedDuringTrip = (a) => (a.closed_ranges || []).some(
    r => r.from <= tTo && (r.to || r.from) >= tFrom);
  // اقتراحات كل مرحلة من مدينتها هي — لا معالم فيينا في أيام شلادمينغ.
  const legs = legsOf(trip);
  const legReg = legs.map(l => {
    const c = store.cities.find(x => x.id === l.cityId);
    const from = l.from || tFrom, to = l.to || from;
    const items = (store.attractions?.[l.cityId] || [])
      .filter(a => !(a.closed_until && a.closed_until > from))
      .filter(a => !(a.closed_ranges || []).some(r => r.from <= to && (r.to || r.from) >= from))
      .sort((x, y) => (y.added_count || 0) - (x.added_count || 0)).slice(0, 24);
    return { leg: l, city: c, items };
  }).filter(g => g.items.length);
  const reg = legReg.flatMap(g => g.items);
  const regQids = new Set(reg.map(a => a.qid));
  const regBox = el("div");
  // ضم الفعالية أو فكّها — الفعل نفسه من الزر المختصر ومن نافذة التفاصيل.
  const togglePick = (a, label) => {
    if (planOf(a.qid)) trip.plan = trip.plan.filter(p => p.qid !== a.qid);
    else {
      trip.plan.push({ id: "p" + Date.now() + Math.random().toString(36).slice(2, 6),
        name: label, qid: a.qid, lat: a.lat || 0, lon: a.lon || 0,
        kind: a.kind || "", count: a.added_count || 0,
        roadM: a.road_m || 0, en: a.name_en || "", day: -1, slot: "",
        // أيام إغلاقه ترافقه في الخطة، فيُحسب بها التوزيع ويُنبَّه المستخدم
        ...(a.icon_id ? { icon: a.icon_id } : {}),
        ...(a.closed_weekdays ? { cw: a.closed_weekdays } : {}),
        ...(a.open_daily_months ? { odm: a.open_daily_months } : {}) });
      tallyPick(a.qid);
    }
    save(); render();
  };
  // نافذة التفاصيل: لا يضيف المرء إلى جدوله ما لم يره. نعرض ما في السجل
  // ولا نزيد — ما لم يُجمع لا يُخترع، والقرار (أضف / ألغِ) في يد صاحبه.
  const openDetails = (a, label, onRemoveFree) => {
    if (document.querySelector(".detback")) return;
    const close = () => { back.remove(); card.remove(); };
    const back = el("div.detback", { onclick: close });
    const chosen = !!(a.qid ? planOf(a.qid) : true);
    const rows = [];
    const row = (k, v) => v ? rows.push(el("div.detrow", {},
      el("span.k", {}, k), el("span.v", {}, v))) : null;
    row(t("الأوقات"), a.hours_ar);
    row(t("التذاكر"), a.needs_ticket ? t("تحتاج تذكرة")
      : a.free_entry ? t("الدخول مجاني") : (a.ticket_price_note || ""));
    row(t("الوصول"), a.access_note_ar
      || (a.access_minutes ? tt`${a.access_minutes} د مشيًا` : ""));
    row(t("الموسم"), a.season_note_ar);
    row(t("يغلق"), closedDaysText(a));
    row(t("لمن"), a.audience_note_ar
      || (Array.isArray(a.audiences) ? a.audiences.join("، ") : ""));
    row(t("الشروط"), [a.min_age ? tt`العمر من ${a.min_age} سنة` : "",
      a.min_height_cm ? tt`الطول من ${a.min_height_cm} سم` : ""].filter(Boolean).join(" · "));
    row(t("الموقف"), a.parking_name);
    row(t("القيمة"), a.value_ar);
    const blurb = isEN ? (a.blurb_en || a.blurb) : (a.blurb || a.blurb_en);
    const card = el("div.detcard", { onclick: e => e.stopPropagation() },
      el("div.dethead", {},
        el("div.pickicon", {}, activityIcon(label + " " + (a.name_en || ""), a.kind, a.icon_id)),
        el("div", { style: "flex:1;min-width:0" },
          el("h3", {}, label),
          a.name_en && a.name_en !== label ? el("div.den", {}, a.name_en) : null),
        el("button.x", { onclick: close, "aria-label": t("إغلاق") }, "✕")),
      a.has_image ? el("img.detimg", { src: "attractions/" + a.qid + ".jpg",
        alt: label, loading: "lazy",
        onerror: (e) => e.target.remove() }) : null,
      el("div.detmeta", {},
        a.kind ? el("span.kind", {}, a.kind) : null,
        a.added_count > 0 ? el("span.cnt", {}, tt`اختارها ${a.added_count}`) : null),
      blurb ? el("p.detblurb", {}, blurb) : null,
      rows.length ? el("div.detrows", {}, rows) : null,
      el("div.detlinks", {},
        a.tickets_url ? el("a", { href: a.tickets_url, target: "_blank",
          rel: "noopener nofollow" }, t("شراء التذاكر")) : null,
        a.official_url ? el("a", { href: a.official_url, target: "_blank",
          rel: "noopener nofollow" }, t("الموقع الرسمي ↗")) : null),
      (a.hours_ar || a.tickets_url || a.official_url)
        ? el("div.detdisc", {}, t("معلومات استرشادية — تأكد من المصدر")) : null,
      el("div.detbtns", {},
        el("button.detadd", { onclick: () => {
          close();
          if (onRemoveFree) onRemoveFree();
          else togglePick(a, label);
        } }, chosen ? t("أزل من الجدول") : t("أضف للجدول")),
        el("button.detno", { onclick: close }, t("ألغِ"))));
    document.body.append(back, card);
  };
  // البطاقة: جسدها يفتح التفاصيل، و«+» في زاويتها يضم مباشرة بلا نافذة.
  const pickCard = (a) => {
    const label = (isEN ? (a.name_en || a.name_ar) : (a.name_ar || a.name_en));
    const chosen = planOf(a.qid);
    const body = el(chosen
      ? (chosen.day >= 0 ? "button.pick.sel" : "button.pick.sel.pend")
      : "button.pick", { onclick: () => openDetails(a, label) },
      // أيقونة الفعالية نفسها التي في الجدول — لغة واحدة في الشاشتين.
      el("div.pickicon", {}, activityIcon(label + " " + (a.name_en || ""), a.kind, a.icon_id)),
      el("div.pn", {}, label),
      el("div.pc", {},
        a.added_count > 0 ? tt`اختارها ${a.added_count}` : "‏"));
    const badge = el("button.pickadd" + (chosen ? ".on" : ""),
      { "aria-label": chosen ? t("أزل من الجدول") : t("أضف للجدول"),
        title: chosen ? t("أزل من الجدول") : t("أضف للجدول"),
        onclick: (e) => { e.stopPropagation(); togglePick(a, label); } },
      chosen ? "✓" : "+");
    return el("div.pickwrap" + (chosen ? (chosen.day >= 0 ? "" : ".pend") : ""),
      {}, body, badge);
  };
  // مجموعة لكل مرحلة بعنوان مدينتها — تُعرض العناوين حين تتعدد المدن فقط.
  for (const g of legReg){
    if (legReg.length > 1)
      regBox.append(el("div.legname", {},
        (g.city ? cityName(g.city) : "") +
        (g.leg.from ? " · " + g.leg.from.slice(5) + " → " + (g.leg.to || "").slice(5) : "")));
    regBox.append(el("div.pickrow", {}, g.items.map(pickCard)));
  }
  // ما جاء من البحث الحر بطاقة مختارة هو الآخر — والضغط عليها يلغيه.
  const freeBox = el("div.pickrow", {});
  for (const p of trip.plan){
    if (p.qid && regQids.has(p.qid)) continue;
    const rm = () => { trip.plan = trip.plan.filter(x => x.id !== p.id); save(); render(); };
    const body = el(p.day >= 0 ? "button.pick.sel" : "button.pick.sel.pend",
      { onclick: () => openDetails({ name_en: p.en || "", kind: p.kind || "",
          blurb: p.detail || "", added_count: 0 }, p.name, rm) },
      el("div.pickicon", {}, activityIcon(p.name + " " + (p.en || ""), p.kind)),
      el("div.pn", {}, p.name),
      el("div.pc", {}, p.kind || "‏"));
    freeBox.append(el("div.pickwrap" + (p.day >= 0 ? "" : ".pend"), {}, body,
      el("button.pickadd.on", { "aria-label": t("أزل من الجدول"),
        title: t("أزل من الجدول"),
        onclick: (e) => { e.stopPropagation(); rm(); } }, "✓")));
  }
  if (freeBox.children.length) regBox.append(freeBox);
  const input = el("input", { placeholder: t("اكتب اسم مكان — زحليقة، مقهى، بحيرة…"),
    style: "flex:1;min-width:0" });
  addBox.append(
    // مفتاح الألوان: العنوان يمينًا والدلالات يسارًا — ثلاث حالات لا تُشرح بكلام.
    el("div", { style: "display:flex;align-items:center;flex-wrap:wrap;gap:10px;"
      + "justify-content:space-between;margin-bottom:8px" },
      el("h2", { style: "margin:0" }, t("معالم وفعاليات مقترحة")),
      el("div.legend", {},
        el("span", {}, el("i.sw.sw-free", {}), t("متاح")),
        el("span", {}, el("i.sw.sw-pend", {}), t("مختار — لم يُضف للجدول")),
        el("span", {}, el("i.sw.sw-sel", {}), t("في الجدول")))),
    regBox,
    el("div", { style: "display:flex;align-items:center;gap:10px;margin-top:12px" },
      input,
      el("span.det", { style: "white-space:nowrap" }, t("أضف مكانًا"))),
    results);
  input.oninput = () => {
    clearTimeout(nominatimTimer);
    const q = input.value.trim();
    results.replaceChildren();
    if (q.length < 3) return;
    nominatimTimer = setTimeout(async () => {
      results.replaceChildren(el("div.det", {}, "…"));
      const hits = await searchPlaces(q, city).catch(() => []);
      results.replaceChildren();
      for (const h of hits.slice(0, 6)){
        results.append(el("button.srow", { style: "width:100%;text-align:start",
          onclick: () => {
            trip.plan.push({ id: "p" + Date.now() + Math.random().toString(36).slice(2, 6),
              name: h.display_name.split(",")[0], detail: h.display_name,
              lat: +h.lat, lon: +h.lon, kind: "", day: -1, slot: "" });
            save(); render();
          } },
          el("div", {},
            el("div.t", {}, h.display_name.split(",")[0]),
            el("div.s", {}, h.display_name.split(",").slice(1, 4).join("،")))));
      }
      if (hits.length)
        results.append(el("div.det", { style: "margin-top:4px;font-size:10.5px" },
          "© OpenStreetMap"));
      if (!hits.length)
        results.append(el("div.det", {}, t("لم نجده — جرّب اسمًا أدق أو أضف المدينة للاسم.")));
    }, 400);
  };
  inner.append(addBox);

  // ── الخريطة من البداية: كل معالم المدينة عليها — البرتقالي متاح للاختيار،
  //    والأخضر بلون الشفق دخل الجدول ويحمل رقم يومه. ──
  const pins = [];
  const seenQ = new Set();
  for (const p of trip.plan){
    if (p.qid) seenQ.add(p.qid);
    if (!(p.lat || p.lon)) continue;
    pins.push({ lat: p.lat, lon: p.lon, name: p.name,
      mark: p.day >= 0 ? String(p.day + 1) : "•",
      color: p.day >= 0 ? dayColor(p.day) : null });
  }
  for (const st of trip.stays){
    if (st.lat || st.lon)
      pins.push({ lat: st.lat, lon: st.lon, name: st.name, mark: "🏨", stay: true });
  }
  for (const a of reg){
    if (seenQ.has(a.qid) || !(a.lat || a.lon)) continue;
    pins.push({ lat: a.lat, lon: a.lon,
      name: (isEN ? (a.name_en || a.name_ar) : (a.name_ar || a.name_en)),
      mark: "•", color: null });
  }
  let mapSec = null;
  // مقبض الخريطة يعيش خارج كتلتها — روابط الأيام تحته ترسم وتكبّر.
  const mapRef = { m: null, route: null, home: null };
  let mapBox = null;

  if (pins.length && window.L){
    mapBox = el("div.findmap", { style: "margin-top:6px" });
    const fullBtn = el("button.mapfullbtn.mapexp", { "aria-label": t("تكبير الخريطة"),
      onclick: () => {
        // أنماط مضمنة لا تُغلب — الشلال له قواعده اللاصقة المتشابكة.
        const on = !mapSec.classList.contains("mapfull");
        mapSec.classList.toggle("mapfull", on);
        mapSec.style.cssText = on
          ? "position:fixed;inset:0;z-index:60;height:100vh;width:100vw;"
            + "margin:0;background:var(--bg)"
          : "";
        mapBox.style.height = on ? "100vh" : "";
        mapBox.style.borderRadius = on ? "0" : "";
        document.body.style.overflow = on ? "hidden" : "";
        fullBtn.textContent = on ? "✕" : "⤢";
      } }, "⤢");
    const homeBtn = el("button.mapfullbtn.maphome", {
      "aria-label": t("إرجاع الخريطة لوضعها الأصلي") }, "⌖");
    // بطاقات مدن الرحلة داخل الخريطة: ضغطة تنقل التركيز إلى المدينة
    // بحدود ما حولها من دبابيس — الرحلة إلى مدينتين خريطتها واسعة،
    // فليكن الوصول لكل مدينة بلمسة لا بتقريب يدوي.
    const legCities = legsOf(trip)
      .map(l => store.cities.find(c => c.id === l.cityId))
      .filter(c => c && c.lat != null);
    let chips = null;
    if (legCities.length > 1){
      const btns = [];
      const focus = (c, btn) => {
        const m = mapRef.m; if (!m) return;
        if (mapRef.route){ m.removeLayer(mapRef.route); mapRef.route = null; }
        const near = pins.filter(p => kmAB(p, c) < 80);
        m.invalidateSize();
        // بلا حركة متحركة: انتقالٌ يُقطع بآخر يترك ليفلت عالقًا لا يستجيب.
        if (near.length)
          m.fitBounds(L.latLngBounds(near.map(p => [p.lat, p.lon])).pad(0.25),
            { animate: false });
        else m.setView([c.lat, c.lon], 11, { animate: false });
        btns.forEach(b2 => b2.classList.toggle("on", b2 === btn));
      };
      for (const c of legCities){
        const btn = el("button.mapcity", { onclick: () => focus(c, btn) }, cityName(c));
        btns.push(btn);
      }
      chips = el("div.mapcities", {}, ...btns);
      // العودة للوضع الأصلي تُطفئ التمييز — لا مدينة مختارة حينها.
      homeBtn.addEventListener("click", () => btns.forEach(b2 => b2.classList.remove("on")));
    }
    mapSec = el("div.section.mapsec", {}, fullBtn, homeBtn, chips, mapBox);
    setTimeout(() => {
      const m = L.map(mapBox).setView([pins[0].lat, pins[0].lon], 9);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "© OpenStreetMap" }).addTo(m);
      const g = L.featureGroup(pins.map(p =>
        L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "pmark-wrap",
          html: p.stay
            ? `<div class="pmark stay">${p.mark}</div>`
            : `<div class="pmark"${p.color ? ` style="background:${p.color}"` : ""}>${p.mark}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13] }) })
          .bindTooltip(p.name))).addTo(m);
      const home = g.getBounds().pad(0.25);
      mapRef.m = m; mapRef.home = home;
      m.fitBounds(home);
      homeBtn.onclick = () => {
        if (mapRef.route){ m.removeLayer(mapRef.route); mapRef.route = null; }
        m.invalidateSize();
        m.fitBounds(home, { animate: false });
      };
      // الجدول يطول ويقصر (أيام تزيد، أدوات تنفتح) — الخريطة تلاحقه حيًّا.
      if (window.ResizeObserver)
        new ResizeObserver(() => m.invalidateSize()).observe(mapBox);
    }, 0);
  }

  // ── وزّع الآن — بعد الاختيار لا قبله: يختار ثم يوزع، هذا منطق الإجراء ──
  if (trip.start){
    const dd2 = daysOf(trip);
    const pend = trip.plan.filter(p => p.day < 0 || p.day >= dd2.length).length;
    const scheduled = trip.plan.length - pend;
    inner.append(el("div.card", { style: "margin-bottom:14px" },
      el("h2", { style: "margin-bottom:6px" }, t("خطط لي أيامي")),
      el("p.det", { style: "margin-bottom:10px" },
        trip.plan.length
          ? t("سوفينير يوزع ما اخترته على الأيام: القريب مع القريب، والمطاعم مساءً، ويوما السفر خفيفان. عدّل بعدها ما شئت.")
          : t("لم تختر أماكن بعد؟ نبدأ لك بأكثر ما اختاره المسافرون، ونوزعها على أيامك. عدّل بعدها ما شئت.")),
      el("button.btn", { onclick: () => {
        // كل مرحلة تُوزَّع وحدها: خلط مدينتين متباعدتين يُنتج أيامًا مبعثرة.
        const legs = legsOf(trip);
        let ok = false;
        if (pend && scheduled){
          ok = placePending(trip, dd2);
        } else if (legs.length > 1){
          for (const l of legs){
            const sub = dd2.filter(d => (!l.from || ymd(d) >= l.from)
                                     && (!l.to || ymd(d) <= l.to));
            if (!sub.length) continue;
            const off = dd2.findIndex(d => ymd(d) === ymd(sub[0]));
            const mine = trip.plan.filter(p => {
              const a = (store.attractions?.[l.cityId] || []).find(x => x.qid === p.qid);
              return !!a;
            });
            const shadow = { ...trip, plan: mine };
            if (autoPlan(shadow, sub, store.cities.find(c => c.id === l.cityId), store)){
              for (const p of mine) if (p.day >= 0) p.day += off;
              ok = true;
            }
          }
        } else {
          ok = autoPlan(trip, dd2, city, store);
        }
        if (ok){ save(); render(); }
      } }, pend
          ? tt`هناك ${pend} فعالية غير مضافة للجدول — اضغط للإضافة`
          : t("وزّع الآن"))));
  }

  const placeRow = (p) => {
    const daySel = el("select.menu", {},
      el("option", { value: "-1" }, t("غير موزع")),
      days.map((d, i) => el("option", { value: String(i),
        ...(p.day === i ? { selected: true } : {}) }, fmtDay(d))));
    if (p.day >= 0) daySel.value = String(p.day);
    const slotSel = el("select.menu", {},
      el("option", { value: "" }, "—"),
      SLOTS.map(([v, ar]) => el("option", { value: v,
        ...(p.slot === v ? { selected: true } : {}) }, tt(ar))));
    daySel.onchange = () => { p.day = +daySel.value; p.why = ""; save(); render(); };
    slotSel.onchange = () => { p.slot = slotSel.value; p.why = ""; save(); render(); };
    // مربع بأيقونة نوعه كصف الفندق — الصورة تعيش في بطاقات الاختيار،
    // والجدول يُقرأ بالرمز فيهدأ ويتسع (طلب طارق).
    const thumb = el("div.rowthumb.kindth", {},
      activityIcon(p.name + " " + (p.en || ""), p.kind, p.icon));
    // تحت الاسم: مدينة المكان — في رحلة بمدينتين هذا ما يحتاجه القارئ،
    // ونوع الفعالية تقوله الأيقونة. المدينة تُعرف بالجغرافيا أولًا:
    // مكانٌ في شلادمينغ يبقى شلادمينغ ولو وُضع في يوم فيينا.
    const placeCity = (() => {
      let cid = null, bd = Infinity;
      if (p.lat || p.lon)
        for (const l of legsOf(trip)){
          const c = store.cities.find(x => x.id === l.cityId);
          if (!c || c.lat == null) continue;
          const d = kmAB(p, c);
          if (d < bd){ bd = d; cid = l.cityId; }
        }
      if (!cid && p.day >= 0 && days[p.day])
        cid = legForDay(trip, ymd(days[p.day]))?.cityId;
      const c = cid && store.cities.find(x => x.id === cid);
      return c ? cityName(c) : "";
    })();
    // الجدول يقول اليوم والفترة — لا داعي لتكرارهما على كل صف (طلب طارق).
    // الأدوات تختبئ، وضغطة على الصف تكشفها لمن أراد النقل أو الحذف.
    const tools = el("div", { style: "display:none;gap:6px;align-items:center;"
      + "margin-top:6px" },
      daySel, slotSel,
      el("button.out", { onclick: (ev) => {
        ev.stopPropagation();
        trip.plan = trip.plan.filter(x => x.id !== p.id); save(); render();
      } }, "✕"));
    // نفس بنية صف الحدث (ختم وقت فارغ ثم المربع) — المربعات على خط واحد.
    const row = el("div.trow.prow", { style: "cursor:pointer",
      onclick: (ev) => {
        if (ev.target.closest("select,button")) return;
        tools.style.display = tools.style.display === "none" ? "flex" : "none";
      } },
      el("div.tstamp", {}, ""),
      el("div", { style: "display:flex;align-items:center;gap:8px;flex:1;min-width:0" },
        thumb,
        el("div", { style: "flex:1;min-width:0" },
          el("div.t", { style: "font-weight:700;font-size:14.5px" }, p.name),
          (placeCity || p.count)
            ? el("div.s", { style: "font-size:11.5px;color:var(--muted)" },
                [placeCity, p.count > 0 ? tt`اختارها ${p.count}` : null]
                  .filter(Boolean).join(" · "))
            : null,
          p.why ? el("div.s", { style:
              "font-size:11px;color:var(--muted);opacity:.85;margin-top:1px" },
              "↳ " + p.why) : null,
          // إغلاق أسبوعي وقع في يومه: تنبيه ظاهر لا سطر رمادي — زيارةٌ
          // مغلقة تُفسد اليوم كله، فالأولى أن تُرى قبل السفر لا عنده.
          (p.day >= 0 && days[p.day] && closedWeekly(p, days[p.day]))
            ? el("div.shut", {}, tt`مغلق يوم ${ISO_DAYS_AR[(days[p.day].getDay() || 7) - 1]} — انقله ليوم آخر`)
            : null)),
      tools);
    return row;
  };

  // رحلة عرفنا رقمها ولم نعرف مطار وصولها (خطط حُفظت قبل الميزة) — نسأل
  // مرة بهدوء فيصير الحساب على مطارك الحقيقي لا أقرب مطار للمدينة.
  (async () => {
    for (const dir of ["out", "back"]){
      const f = trip.flights[dir];
      if (!f.no || f.to || f.toTried) continue;
      f.toTried = true;
      try {
        const r = await fetch("https://mcp.souvenirtravel.app/flight?no="
          + encodeURIComponent(f.no));
        const j = await r.json();
        if (j.ok && j.to){
          f.to = j.to;
          if (!f.dep) f.dep = j.dep;
          if (!f.arr) f.arr = j.arr;
          for (const st of trip.stays || []) delete st.driveMin;
          save(); render();
          return;
        }
      } catch {}
      save();
    }
  })();

  // القياس الحقيقي الذي يبني عليه سوفينير قراره: زمن القيادة من الفندق
  // إلى كل مكان، وحلقة كل يوم كاملة. يُحسب مرة ويُحفظ، ويُعرض للمستخدم.
  trip.dayStats = trip.dayStats || {};
  const osrm = async (pts) => {
    const q = pts.map(p => p[1] + "," + p[0]).join(";");
    const r = await fetch("https://router.project-osrm.org/route/v1/driving/"
      + q + "?overview=false");
    const j = await r.json();
    const rt = j?.routes?.[0];
    return rt ? { km: rt.distance / 1000, min: Math.round(rt.duration / 60) } : null;
  };
  (async () => {
    const st0 = stayForDay(trip, trip.start || "");
    if (!st0) return;
    let changed = false;
    for (const p of trip.plan){
      if (p.driveFromStayMin != null || !(p.lat || p.lon) || p.roadM >= 800) continue;
      const r = await osrm([[st0.lat, st0.lon], [p.lat, p.lon]]).catch(() => null);
      p.driveFromStayMin = r ? r.min : 0;
      changed = true;
    }
    // زمن الانتقال بين مرحلتين — يُقاس مرة ويُحفظ كحلقة اليوم.
    const lg = legsOf(trip);
    for (let i = 1; i < lg.length; i++){
      const key = "leg:" + lg[i - 1].cityId + ">" + lg[i].cityId;
      if (trip.dayStats[key]) continue;
      const a1 = store.cities.find(c => c.id === lg[i - 1].cityId);
      const b1 = store.cities.find(c => c.id === lg[i].cityId);
      if (!a1 || !b1) continue;
      const r = await osrm([[a1.lat, a1.lon], [b1.lat, b1.lon]]).catch(() => null);
      if (r){ trip.dayStats[key] = { km: Math.round(r.km * 10) / 10, min: r.min }; changed = true; }
    }
    // حلقة اليوم: من الفندق مرورًا بمحطاته وعودةً إليه.
    const dd = daysOf(trip);
    for (let i = 0; i < dd.length; i++){
      const st = stayForDay(trip, ymd(dd[i])) || st0;
      const stops = SLOTS.flatMap(([v]) => trip.plan.filter(p => p.day === i && p.slot === v))
        .concat(trip.plan.filter(p => p.day === i && !p.slot))
        .filter(p => (p.lat || p.lon) && !(p.roadM >= 800));
      if (!stops.length || !st) continue;
      const sig = i + ":" + stops.map(p => p.id).join(",");
      if (trip.dayStats[sig]) continue;
      const pts = [[st.lat, st.lon], ...stops.map(p => [p.lat, p.lon]), [st.lat, st.lon]];
      const r = await osrm(pts).catch(() => null);
      if (r){ trip.dayStats[sig] = { km: Math.round(r.km * 10) / 10, min: r.min }; changed = true; }
    }
    if (changed){ save(); render(); }
  })();

  // زمن الطريق من المطار إلى السكن — قيادة فعلية لا خط هوائي، يُحفظ مرة.
  (async () => {
    const ap = arrivalAirport(trip, city, store);
    if (!ap) return;
    let changed = false;
    for (const st of trip.stays || []){
      if ("driveMin" in st || !(st.lat || st.lon)) continue;
      try {
        const r = await fetch("https://router.project-osrm.org/route/v1/driving/"
          + ap.lon + "," + ap.lat + ";" + st.lon + "," + st.lat + "?overview=false");
        const j = await r.json();
        const sec = j?.routes?.[0]?.duration;
        st.driveMin = sec ? Math.round(sec / 60) : null;
      } catch { st.driveMin = null; }
      changed = true;
    }
    if (changed){ save(); render(); }
  })();

  // مسار السيارة الحقيقي بين أماكن اليوم — من OSRM (بيانات OpenStreetMap).
  // نرسم المستقيم فورًا ثم نستبدله بالطريق حين يصل، ولا نخفي بقية الدبابيس.
  async function showDayRoute(i, pts){
    const m = mapRef.m;
    if (!m) return;
    if (mapRef.route){ m.removeLayer(mapRef.route); mapRef.route = null; }
    const color = dayColor(i);
    let line = L.polyline(pts, { color, weight: 4, opacity: .5,
      dashArray: "6 7" }).addTo(m);
    mapRef.route = line;
    m.fitBounds(L.latLngBounds(pts).pad(0.3), { animate: false });
    if (window.innerWidth < 860 && mapBox)
      mapBox.scrollIntoView({ behavior: "smooth", block: "center" });
    if (pts.length < 2) return;
    try {
      const q = pts.map(p => p[1] + "," + p[0]).join(";");
      const r = await fetch("https://router.project-osrm.org/route/v1/driving/"
        + q + "?overview=full&geometries=geojson");
      const j = await r.json();
      const g = j?.routes?.[0]?.geometry?.coordinates;
      if (!g || !g.length || mapRef.route !== line) return;
      m.removeLayer(line);
      const real = L.polyline(g.map(c => [c[1], c[0]]),
        { color, weight: 5, opacity: .9 }).addTo(m);
      mapRef.route = real;
      m.fitBounds(real.getBounds().pad(0.2), { animate: false });
    } catch {}
  }

  const tablesBox = el("div");

  // ── الأيام على هيئة جدول طارق الأصلي: اليوم | الفترة | الفعاليات ──
  days.forEach((d, i) => {
    const dayPlaces = trip.plan.filter(p => p.day === i);
    // مكان لا يصله طريق سيارات (جزيرة، بحيرة تُبلغ بقارب) يبقى دبوسًا
    // على الخريطة ولا يدخل مسار القيادة — وإلا صار المسار خيالًا.
    const withPos = SLOTS.flatMap(([v]) => dayPlaces.filter(p => p.slot === v))
      .concat(dayPlaces.filter(p => !p.slot))
      .filter(p => (p.lat || p.lon) && !(p.roadM >= 800));
    let route = null;
    if (withPos.length){
      // المسار من أول مكان في اليوم — لا من موقع القارئ الحالي أينما كان.
      const coords = withPos.map(p => p.lat + "," + p.lon);
      const dstay = stayForDay(trip, ymd(d));
      const pts = withPos.map(p => [p.lat, p.lon]);
      if (dstay) pts.unshift([dstay.lat, dstay.lon]), pts.push([dstay.lat, dstay.lon]);
      // «خط السير» يفتح خرائط جوجل — أسماؤها عربية وملاحتها هي التي يقودها
      // المسافر فعلًا. وخريطتنا تبقى للنظرة الشاملة، ورسم اليوم عليها بأيقونة.
      const gmaps = coords.length > 1
        ? "https://www.google.com/maps/dir/?api=1&origin=" + coords[0]
          + "&destination=" + coords[coords.length - 1]
          + (coords.length > 2
              ? "&waypoints=" + encodeURIComponent(coords.slice(1, -1).join("|")) : "")
        : "https://www.google.com/maps/search/?api=1&query=" + coords[0];
      route = el("div", { style: "display:flex;gap:8px;align-items:center;"
        + "justify-content:center;flex-wrap:wrap;margin-top:4px" },
        el("a", { target: "_blank", rel: "noopener", href: gmaps,
          style: "font-size:12.5px" }, t("خط السير ›")),
        el("a", { href: "#", style: "font-size:12.5px",
          title: t("ارسمه على خريطة الرحلة"), onclick: (e) => {
            e.preventDefault(); showDayRoute(i, pts);
          } }, "⌗"));
    }
    const fo = trip.flights.out, fb = trip.flights.back;
    const dstr = ymd(d);
    const dayCell = el("td.dt-day", {},
      el("div.dn", {}, tt`يوم ${i + 1}`),
      el("div.dd", {}, fmtDay(d)),
      (days.length > 1 && i === 0)
        ? el("div.dm", {}, "✈︎ " + (fo.no || tt("يوم الوصول"))
            + (fo.arr ? " — " + tt`الوصول ${fo.arr}` : "")) : null,
      (days.length > 1 && i === days.length - 1)
        ? el("div.dm", {}, "✈︎ " + (fb.no || tt("يوم العودة"))
            + (fb.dep ? " — " + tt`الإقلاع ${fb.dep}` : "")) : null,
      route);
    const ok = allowedSlots(trip, i, days.length);
    const hev = timedEvents(trip, dstr, city, store, days);
    const evRow = (ev) => el("div.trow", {},
      el("div.tstamp", {}, ev.time != null ? fmtT(ev.time) : ""),
      el("div.rowthumb.evth", {}, eventIcon(ev.kind === "move" ? "toair" : ev.kind)),
      el("div", { style: "flex:1;min-width:0" },
        el("div.t", { style: "font-weight:700;font-size:14px" },
          ev.kind === "in" ? tt`تسجيل الدخول للفندق ${ev.name}`
          : ev.kind === "out" ? tt`تسجيل الخروج من الفندق ${ev.name}`
          : ev.kind === "land" ? (ev.name ? tt`وصول الرحلة ${ev.name}` : t("وصول الرحلة"))
          : ev.kind === "fly" ? (ev.name ? tt`إقلاع الرحلة ${ev.name}` : t("إقلاع الرحلة"))
          : ev.kind === "move" ? tt`الانتقال إلى ${ev.name}`
          : t("التوجه للمطار")),
        ev.kind === "move" && ev.driveMin
          ? el("div.s", { style: "font-size:10.5px;color:var(--muted)" },
              tt`${ev.driveMin} د قيادة من ${ev.from}`) : null,
        ev.kind === "in" && ev.move
          ? el("div.s", { style: "font-size:10.5px;color:var(--muted)" },
              "↳ " + tt`المغادرة ١٠:٠٠ من ${ev.move.from}` + " · "
              + tt`${ev.move.driveMin} د طريق`) : null,
        ev.kind === "toair"
          ? el("div.s", { style: "font-size:10.5px;color:var(--muted)" },
              tt`٣ س إجراءات · ${ev.driveMin} د طريق`)
          : (ev.parts ? el("div.s", { style: "font-size:10.5px;color:var(--muted)" },
              "↳ " + tt`وصول ${ev.parts.arr}` + " · " + tt("٣ س في المطار") + " · "
              + tt`${ev.parts.driveMin} د طريق`
              + (ev.parts.ap ? " (" + ev.parts.ap + ")" : "")) : null)));

    // ترتيب اليوم: الموقوت بوقته، والفعاليات بترتيب فتراتها بينها.
    const SLOT_T = { morning: 10, afternoon: 14.5, evening: 19 };
    const items = [];
    for (const ev of hev) items.push({ at: ev.time ?? 12, node: evRow(ev) });
    SLOTS.forEach(([v]) => {
      dayPlaces.filter(p => p.slot === v)
        .forEach((p, k) => items.push({ at: SLOT_T[v] + k * 0.1, node: placeRow(p) }));
    });
    dayPlaces.filter(p => !p.slot)
      .forEach((p, k) => items.push({ at: 21 + k * 0.1, node: placeRow(p) }));
    items.sort((x, y) => x.at - y.at);

    const body = el("tbody", {},
      el("tr", {}, dayCell,
        el("td.dt-acts", {},
          items.length ? items.map(x => x.node)
            : el("div.det", { style: "opacity:.4" },
                ok.length ? t("يوم فارغ — وهذا خيار أيضًا") : "✈︎ " + tt("سفر")))));
    tablesBox.append(el("table.daytbl", { style: "--dc:" + dayColor(i) }, body));
    // فكرة اليوم بأرقامها — أعيد بناؤها بعد أن صار اليوم قائمة مرتبة.
    const stops = withPos;
    const sig = i + ":" + stops.map(p => p.id).join(",");
    const stat = trip.dayStats[sig];
    const bits = [];
    if (stat) bits.push(tt`حلقة اليوم ${stat.km} كم · ${stat.min} د من الفندق وإليه`);
    const far = dayPlaces.filter(isFar);
    if (far.length) bits.push(tt`محطة بعيدة (${far[0].driveFromStayMin} د) — يوم مخفَّف بانطلاق مبكر`);
    else if (stops.length > 1) bits.push(t("محطات متجاورة في جهة واحدة — طريق واحد لا طريقان"));
    if (bits.length)
      tablesBox.append(el("div.daywhy", { style: "border-inline-start:5px solid "
        + dayColor(i) }, "◷ " + bits.join(" · ")));
  });

  // ── الجدول يمينًا والخريطة يسارًا — وعلى الجوال تنطوي الخريطة تحت الجدول ──
  if (mapSec){
    inner.append(el("div.plansplit", {}, tablesBox,
      el("div.mapside", {}, mapSec)));
  } else {
    inner.append(tablesBox);
  }

  // الحذف قرار ثقيل: في آخر الصفحة، وبتأكيد — لا زر عابر على بطاقة.
  inner.append(el("div", { style: "margin:26px 0 10px;text-align:center" },
    // تأكيدان كحذف الفريق: الأول يسمّي ما يضيع، والثاني يُكتب بخط اليد.
    el("button.out", { style: "color:var(--deep)", onclick: () => {
      const n = (trip.plan || []).length;
      if (!confirm(tt`تحذف رحلتك ${trip.title || ""} ومعها ${n} مكانًا في خطتها؟`))
        return;
      const ans = prompt(t("تأكيد أخير — اكتب: احذف"));
      if ((ans || "").trim() !== "احذف"){ alert(t("لم يُحذف شيء.")); return; }
      Trips.remove(tripId); location.hash = "#/upcoming";
    } }, t("احذف هذه الرحلة"))));

  return root;
}
