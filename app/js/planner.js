// مخطط الرحلة على الويب — من جدول طارق النمساوي: اليوم ثلاث خانات لا ساعات،
// سلة تجمع قبل التوزيع، رابط خرائط واحد لليوم، والفراغ محترم.
// «أضف مكانًا» يقتل حلقة الاسم←الخرائط←الجدول: Nominatim يحدد ونحن نرتب.
import { t, t as tt, isEN } from "/app/js/i18n.js";
import { el, flag, cityName, countryName, gate, askConfirm,
         MONTHS_AR, RAIN_AR } from "/app/js/ui.js";
import { Trips } from "/app/js/trips-store.js";
import { visaLine, tripCountries } from "/app/js/views.js";
import { activityIcon, eventIcon } from "/app/js/icons.js";
import { matchesLoosely, fold } from "/app/js/searchtext.js";

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
// قيمةٌ محفوظة قد تحمل نص «null» أو «undefined» — وما ليس بمعلومة لا يُعرض.
// تمرّ عليه كل قيمة قبل أن تصير سطرًا في نافذة التفاصيل.
const clean = (v) => {
  const s = (v == null ? "" : String(v)).trim();
  return (s === "null" || s === "undefined" || s === "NaN") ? "" : s;
};

// ما أضافه المستخدم بالبحث الحر قد يكون عندنا كاملًا: «شافبيرغ» في سجلنا
// باسمها العربي وأوقاتها وإغلاقها، وأضافها هو صدفةً من الخريطة لأن بحثه لم
// يمرّ بالسجل. فنتبنّاها: نقطةٌ واحدة (٤٠٠ م) تعني مكانًا واحدًا، فيرث
// الكرتُ بياناته ويسقط الطلب عن الوكلاء.
// الاسم هو المطابِق والمسافة شاهدة: قرب أربعمئة متر في وسط مدينة يجمع
// الجارَ بجاره — «مسرح الدمى» صار «حديقة ميرابيل» لأنهما على شارع واحد.
// فلا يُوحَّد مكانان ما لم يتوافق اسماهما، والمسافة تشهد أنه هو لا سميّه
// في بلدٍ آخر.
const REG_SAME_KM = 3;
const nameSame = (name, a) => {
  const n = fold(String(name || "").split(",")[0]);
  if (n.length < 3) return false;
  return [a.name_ar, a.name_en].some(c => {
    const f = fold(c || "");
    return f.length >= 3 && (f.includes(n) || n.includes(f));
  });
};
function regSame(pt, name, store){
  let best = REG_SAME_KM, hit = null;
  for (const [cid, list] of Object.entries(store.attractions || {}))
    for (const a of list){
      if (a.lat == null || a.lon == null || !nameSame(name, a)) continue;
      const d = kmAB(pt, a);
      if (d < best){ best = d; hit = { a, cid }; }
    }
  return hit;
}
function adoptFromRegister(trip, store){
  let n = 0;
  for (const p of trip.plan){
    if (p.qid || !(p.lat || p.lon)) continue;
    const found = regSame(p, p.name, store) || regSame(p, p.en, store);
    const hit = found && found.a;
    if (!hit) continue;
    p.qid = hit.qid;
    p.name = (isEN ? (hit.name_en || hit.name_ar) : (hit.name_ar || hit.name_en)) || p.name;
    p.en = hit.name_en || "";
    p.kind = hit.kind || p.kind || "";
    p.count = hit.added_count || 0;
    p.roadM = hit.road_m || 0;
    if (hit.icon_id) p.icon = hit.icon_id;
    if (hit.closed_weekdays) p.cw = hit.closed_weekdays;
    if (hit.closed_ranges) p.cr = hit.closed_ranges;
    if (hit.closed_until) p.closed_until = hit.closed_until;
    if (hit.open_daily_months) p.odm = hit.open_daily_months;
    delete p.ask; delete p.detail;
    n++;
  }
  return n;
}

// الطلب يخرج ساعة الإضافة لا في نهاية الشهر: ما ليس في سجلنا يُطلب فورًا،
// وتبقى البطاقة تدور حتى تصل بياناته. والإحداثي في نصّ الطلب ليعرف الوكيل
// أي «شافبيرغ» يقصد صاحبها.
const asked = new Set();
function askForPlace(p, cityLabel){
  const q = [p.name, cityLabel,
    (p.lat || p.lon) ? `(${(+p.lat).toFixed(4)},${(+p.lon).toFixed(4)})` : ""]
    .filter(Boolean).join(" — ").slice(0, 120);
  return fetch("https://mcp.souvenirtravel.app/request-place", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: q, lang: document.documentElement.lang }) })
    .then(r => r.ok).catch(() => false);
}
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
  // لا تُسلّم مفتاح فندقٍ بعد أن غادرت: الخروج يسبق أول مغادرة في اليوم
  // أيًّا كانت — انتقالًا إلى مدينة أو توجهًا إلى المطار. كانت القاعدة
  // مقصورة على يوم الانتقال، فبقي يوم العودة يُخرجك بعد ذهابك للمطار.
  const leave = evs.filter(e => (e.kind === "move" || e.kind === "toair")
    && e.time != null).map(e => e.time);
  if (leave.length){
    const first = Math.min(...leave);
    for (const ev of evs)
      if (ev.kind === "out" && ev.time != null && ev.time >= first)
        ev.time = first - 0.5;
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

/// ما سقط من الجدول يُقال، لا يختفي. من قصّر رحلته يومين يجب أن يعرف أن
/// فعالياتٍ عادت إلى المعلّقين — وإلا بحث عنها في الجدول ولم يجدها وظنّها ضاعت.
function noteDropped(n){
  gate(close => [
    el("h3", {}, t("تغيّرت تواريخ رحلتك")),
    el("p", {}, tt`${n} من فعالياتك كانت في أيامٍ لم تعد ضمن الرحلة، فعادت إلى «غير موزّعة». وزّعها من جديد متى شئت.`),
    el("button.btn", { onclick: close }, t("فهمت")),
  ]);
}

/// الملعب لا يُقترَح. حكم طارق ٢٠٢٦-٠٩-٠٥: هو مكانٌ لمباراةٍ لا مزار، ولا
/// يُدخَل إلا يوم لعبٍ يعرفه صاحبه — فمن أراده بحث عنه بالاسم ووجده. أما
/// أن يُقحَم بين قصر شونبرون وسوق ناشماركت فيسرق موضعًا من فعاليةٍ تُعاش.
const STADIUM_AR = /ملعب|استاد|ستاد/;
const STADIUM_EN = /\b(stadium|arena|ballpark|velodrome|racecourse)\b|stadion|estádio|estadio|stade\b/i;
// إلا ما صار مزارًا بنفسه: متحف النادي أو جولةٌ في الملعب تُدخَل أي يوم
// بتذكرة، ولا تنتظر مباراة — وهذه فعالية تُعاش لا مقعدٌ ينتظر مباراة.
const TOUR_AR = /متحف|جولة/;
const TOUR_EN = /\b(museum|tour)\b/i;
const isStadium = (a) => (STADIUM_AR.test(a?.name_ar || "")
    || STADIUM_EN.test(a?.name_en || ""))
  && !(TOUR_AR.test(a?.name_ar || "") || TOUR_EN.test(a?.name_en || ""));
/// ما يُعرض في الاقتراحات — مصفاةٌ واحدة يمرّ بها سجلّ كل مدينة.
const suggestable = (list) => (list || []).filter(a => !isStadium(a));

/// نقل الرحلة إلى تواريخها الجديدة — تُستدعى بعد كل تعديل على start/end.
///
/// العلّة التي تعالجها: المراحل والسكن تحمل تواريخ **مطلقة**، وبنود الجدول
/// تحمل **فهرس يوم**. فمن كتب أكتوبر وقصد نوفمبر ثم صحّح، انتقلت رحلته
/// وبقيت مراحله وفنادقه في أكتوبر — فلا يجد `legForDay` مرحلةً ليومٍ واحد
/// ويردّ الأولى للجميع، فتصير رحلة المدينتين مدينةً واحدة بلا أن يُقال له.
///
/// والفهرس هو المعنى الصحيح للبند: «اليوم الأول من رحلتي» لا «الثالث من
/// أكتوبر» — فيبقى كما هو، وينتقل معه. ولا يسقط إلا ما خرج عن مدى الرحلة
/// بعد أن قصُرت، وذاك يُعاد إلى المعلّقين ويُقال عدده.
function retimeTrip(trip, oldStart, oldEnd){
  const dayMs = 86400000;
  const shift = (d, off) => {
    if (!d) return d;
    const x = new Date(d + "T00:00:00");
    x.setDate(x.getDate() + off);
    return ymd(x);
  };
  const off = (oldStart && trip.start)
    ? Math.round((new Date(trip.start + "T00:00:00")
      - new Date(oldStart + "T00:00:00")) / dayMs) : 0;
  const first = trip.start || "";
  const last = trip.end || trip.start || "";
  const clamp = (d) => !d ? d : (first && d < first ? first : (last && d > last ? last : d));

  if (off && Array.isArray(trip.legs))
    for (const l of trip.legs){ l.from = shift(l.from, off); l.to = shift(l.to, off); }
  if (off && Array.isArray(trip.stays))
    for (const st of trip.stays){ st.from = shift(st.from, off); st.to = shift(st.to, off); }
  // قصُرت الرحلة أو طالت: ما خرج عن مداها يُقصّ إليه — مرحلةٌ خارج الرحلة
  // كمرحلةٍ لا وجود لها.
  for (const l of (trip.legs || [])){ l.from = clamp(l.from); l.to = clamp(l.to); }
  for (const st of (trip.stays || [])){ st.from = clamp(st.from); st.to = clamp(st.to); }

  const n = daysOf(trip).length;
  let dropped = 0;
  for (const p of (trip.plan || []))
    if (p.day >= n){ p.day = -1; p.slot = ""; dropped++; }
  return dropped;
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
// التبويب المفتوح في «بيانات رحلتك» — خارج الرسم ليبقى بعد كل إعادة رسم.
let factsTab = 0;
const ISO_DAYS_AR = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس",
                     "الجمعة", "السبت", "الأحد"];
function closedWeekly(a, d){
  if (!a || !d) return false;
  const day = ymd(d);
  // مغلق بمدى معلن (توقف تلفريك، إجازة سنوية) أو مغلق حتى تاريخ
  if (a.closed_until && a.closed_until > day) return true;
  const cr = a.closed_ranges || a.cr;
  if (Array.isArray(cr) && cr.some(r => r && r.from <= day && (r.to || r.from) >= day))
    return true;
  const cw = a.closed_weekdays || a.cw;
  if (!Array.isArray(cw) || !cw.length) return false;
  const iso = d.getDay() === 0 ? 7 : d.getDay();
  if (!cw.includes(iso)) return false;
  const ex = a.open_daily_months || a.odm;
  if (Array.isArray(ex) && ex.includes(d.getMonth() + 1)) return false;
  return true;
}
// سبب إغلاق ذلك اليوم كما نشره المصدر — يُقال للمستخدم بنصّه لا بحكم عام.
function closedWhy(a, d){
  const day = ymd(d);
  const cr = a && (a.closed_ranges || a.cr);
  const hit = Array.isArray(cr)
    ? cr.find(r => r && r.from <= day && (r.to || r.from) >= day) : null;
  return hit?.why_ar || "";
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

  // مكانٌ لمدينته وأيامها: رحلةٌ بمدينتين كانت تُرتَّب حول فندق أول يوم ثم
  // تُقصّ على الأيام تباعًا، فتقع فعالية شلادمينغ في يوم فيينا وتصير حلقة
  // اليوم ستمئة كيلومتر. كل مرحلة تُوزَّع على أيامها وحدها.
  const legsA = legsOf(trip);
  const legIdxOfDay = days.map(d => {
    const l = legForDay(trip, ymd(d));
    const k = l ? legsA.indexOf(l) : -1;
    return k < 0 ? 0 : k;
  });
  const legIdxOfPlace = (p) => {
    if (!legsA.length || !(p.lat || p.lon)) return 0;
    let best = 0, bd = Infinity;
    legsA.forEach((l, k) => {
      const c = store.cities.find(x => x.id === l.cityId);
      if (!c || c.lat == null) return;
      const dd = kmAB(p, c);
      if (dd < bd){ bd = dd; best = k; }
    });
    return best;
  };
  const sweep = (list, depot) => {
    if (depot && list.length)
      return list.slice().sort((a, b) =>
        Math.atan2(a.lat - depot.lat, a.lon - depot.lon)
        - Math.atan2(b.lat - depot.lat, b.lon - depot.lon));
    const out = [], rest = list.slice();
    if (rest.length){
      out.push(rest.shift());
      while (rest.length){
        const last = out[out.length - 1];
        let bi = 0, bd = Infinity;
        rest.forEach((p, i) => { const dd = kmAB(p, last); if (dd < bd){ bd = dd; bi = i; } });
        out.push(rest.splice(bi, 1)[0]);
      }
    }
    return out;
  };

  const quota = caps.map(() => 0);
  const ordered = [];
  const nLegs = Math.max(1, legsA.length);
  for (let L = 0; L < nLegs; L++){
    const dayIdxs = days.map((_, i) => i).filter(i => legIdxOfDay[i] === L);
    if (!dayIdxs.length) continue;
    const mine = located.filter(p => legIdxOfPlace(p) === L);
    const depotL = stayForDay(trip, ymd(days[dayIdxs[0]])) || depot0;
    const seq = sweep(mine, depotL);
    ordered.push(...seq);
    // حصص أيام هذه المرحلة: أيامها الكاملة أولًا، ثم يوماها الطرفيان.
    const fill = dayIdxs.slice(1, -1);
    if (dayIdxs.length > 1) fill.push(dayIdxs[0], dayIdxs[dayIdxs.length - 1]);
    else fill.push(dayIdxs[0]);
    const capL = dayIdxs.reduce((a, i) => a + caps[i], 0);
    let left = Math.min(seq.length, capL);
    while (left > 0){
      let moved = false;
      for (const i of fill)
        if (left > 0 && quota[i] < caps[i]){ quota[i]++; left--; moved = true; }
      if (!moved) break;
    }
    let over = seq.length - capL;
    if (over > 0){
      const fulls = fill.filter(i => caps[i] >= 3);
      const tgt = fulls.length ? fulls : fill;
      let j = 0;
      while (over > 0){ quota[tgt[j % tgt.length]]++; j++; over--; }
    }
  }
  // من لا موقع له يلحق بآخر الأيام المتاحة.
  ordered.push(...blind);
  if (blind.length){
    let rest = blind.length;
    for (let i = days.length - 1; i >= 0 && rest > 0; i--)
      while (rest > 0 && quota[i] < caps[i]){ quota[i]++; rest--; }
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
    });

    const slots = allowedSlots(trip, i, days.length).slice();
    const taken = new Set();
    // مَن أُسند في هذه الجولة وحده يُتخطى لاحقًا. الشرط القديم كان يتخطى
    // كل مكان صادف أنه في هذا اليوم من توزيع سابق، فيبقى بفترة لم تعد تصلح.
    const done = new Set();
    // البعيد يحجز الصباح أولًا — الطريق طويل واليوم يبدأ مبكرًا.
    for (const p of dayGroup){
      if (isFar(p) && slots.includes("morning") && !taken.has("morning")){
        p.day = i; p.slot = "morning"; taken.add("morning"); done.add(p.id);
      }
    }
    for (const p of dayGroup){
      if (FOOD_KINDS.includes(p.kind) && slots.includes("evening") && !taken.has("evening")){
        p.day = i; p.slot = "evening"; taken.add("evening"); done.add(p.id);
        // «المطاعم والمقاهي مساءً» قاعدةٌ لا قياس — والقاعدة لا تُكتب تحت كل
        // صف. ما يُكتب هنا رقمٌ يخص هذا المكان وحده.
      }
    }
    let ci = 0;
    for (const p of dayGroup){
      if (done.has(p.id)) continue;
      const free = slots.find(x => !taken.has(x));
      p.day = i; p.slot = free || slots[ci % slots.length] || "";
      if (free) taken.add(free); ci++;
    }
  });
  ordered.slice(cursor).forEach(p => { p.day = -1; p.slot = ""; });
  return true;
}

// إدراج الملتحقين بعد توزيع قائم: لا نبعثر ما استقر — كل معلق ينضم
// لليوم الأقرب لمساره وفي أول فترة حرة فيه.
//
// العطل الذي عولج هنا (بلاغ طارق ٢٠٢٦-٠٩-٠٥): «قمة كابرون» أُضيفت وهي قرب
// شلادمينغ فنزلت في أيام فيينا. والسبب أن المسافة كانت تُقاس إلى **مركز ما
// استقر في ذلك اليوم**، فاليوم الفارغ لا مركز له فتصير مسافته صفرًا — أي
// «أقرب شيء إلى كل شيء» — فيفوز دائمًا، وأول يوم فارغ هو أول أيام الرحلة.
// ولم يكن في الحساب ذكرٌ للمرحلة أصلًا: يومٌ في فيينا كان يقبل مكانًا في
// شلادمينغ ما دام فارغًا.
//
// الصواب أن يُقاس إلى **مدينة مرحلة ذلك اليوم** — فهي مرساة اليوم سواء
// امتلأ أو فرغ. وما لا نعرف موضعه يبقى معلّقًا حتى تصل إحداثياته، فوضعه
// في يومٍ بالحدس أسوأ من تركه ظاهرًا في «غير موزّعة».
function placePending(trip, days, cities){
  const pending = trip.plan.filter(p => p.day < 0 || p.day >= days.length);
  if (!pending.length) return false;
  const cityOfDay = (d) => {
    const l = legForDay(trip, ymd(d));
    return l ? (cities || []).find(c => c.id === l.cityId) : null;
  };
  for (const p of pending){
    if (!(p.lat || p.lon)) continue;   // لا موضع له بعد — لا يُحزر له يوم
    let best = -1, bd = Infinity;
    days.forEach((d, i) => {
      const slots = allowedSlots(trip, i, days.length);
      if (!slots.length) return;
      // المرساة أولًا: مدينة المرحلة. وإن جهلناها فمركز ما استقر في اليوم.
      let anchor = cityOfDay(d);
      if (!anchor || anchor.lat == null){
        const mine = trip.plan.filter(x => x.day === i && (x.lat || x.lon));
        anchor = mine.length ? {
          lat: mine.reduce((a, x) => a + x.lat, 0) / mine.length,
          lon: mine.reduce((a, x) => a + x.lon, 0) / mine.length } : null;
      }
      // بلا مرساة لا ندّعي قربًا: يُؤجَّل هذا اليوم لغيره ممّا نعرف مرساته.
      const dist = anchor ? Math.hypot(p.lat - anchor.lat,
        (p.lon - anchor.lon) * Math.cos(p.lat * Math.PI / 180)) : 1e6;
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
  // قرار طارق: لا تعليل تحت المكان. الحقل خرج من النموذج فلا يكتبه أحد،
  // وهذا الكنس لِما حُفظ في خطط سابقة وحده — بلا مصدرٍ يعيد ملأه.
  {
    let cleaned = 0;
    for (const p of trip.plan)
      if ("why" in p){ delete p.why; cleaned++; }   // ولو كان فارغًا — مفتاحٌ ميت يبقى بابًا
    if (cleaned) Trips.update(tripId, trip);
  }
  trip.flights = trip.flights || { out: {}, back: {} };
  trip.stays = trip.stays || [];
  const save = () => Trips.update(tripId, trip);

  const city = trip.cityId ? store.cities.find(c => c.id === trip.cityId) : null;

  // الخطة تحمل نسخة من إحداثيات كل مكان يوم أُضيف — فإن صححنا السجل بعدها
  // (دبوس انتقل من قمة الجبل إلى محطة الوادي) وجب أن تلحق الخطة به.
  if (city){
    // السجل يتقدّم والخطة محفوظة منذ زمن: كل فتحة تُحدِّث ما يخص كل مكان من
    // السجل — إحداثيه، وأيقونته، وأيام إغلاقه. وكيلٌ يكتشف إغلاقًا اليوم
    // يجب أن يبلغ خطةً أُنشئت الأسبوع الماضي.
    const byQid = {};
    for (const l of legsOf(trip))
      for (const a of (store.attractions?.[l.cityId] || [])) byQid[a.qid] = a;
    for (const a of (store.attractions?.[city.id] || [])) byQid[a.qid] = a;
    let moved = 0;
    for (const p of trip.plan){
      const a = p.qid && byQid[p.qid];
      if (!a) continue;
      if ((a.lat || a.lon)
          && (Math.abs(a.lat - p.lat) > 1e-5 || Math.abs(a.lon - p.lon) > 1e-5)){
        p.lat = a.lat; p.lon = a.lon; p.roadM = a.road_m || 0; moved++;
      }
      if (!p.en && a.name_en){ p.en = a.name_en; moved++; }
      if (a.icon_id && p.icon !== a.icon_id){ p.icon = a.icon_id; moved++; }
      const sync = (k, v) => {
        const now = JSON.stringify(v ?? null), was = JSON.stringify(p[k] ?? null);
        if (now !== was){ if (v == null) delete p[k]; else p[k] = v; moved++; }
      };
      sync("cw", a.closed_weekdays);
      sync("odm", a.open_daily_months);
      sync("cr", a.closed_ranges);
      sync("closed_until", a.closed_until);
    }
    if (moved) save();
  }
  // قبل الرسم: ما أضافه من الخريطة وعندنا مثله يرث بياناته الآن لا غدًا.
  if (adoptFromRegister(trip, store)) save();
  // الدولة عنوانًا والمدن تحتها — كما في بطاقة «رحلاتك القادمة» سواءً.
  const tripCityList = legsOf(trip)
    .map(l => store.cities.find(c => c.id === l.cityId)).filter(Boolean);
  const titleCities = tripCityList.map(cityName).join(" + ");
  const titleCountries = tripCountries(tripCityList).join(" + ");
  root.append(el("div.hero3", {},
    el("div.herorow", {},
      el("div", { style: "min-width:0" },
        el("h1", {}, t`خطة رحلتك${titleCountries ? tt(" إلى ") + titleCountries : ""}`),
        titleCities ? el("div.herocities", {}, titleCities,
          // «تعديل» عند العنوان: من قرأ دولته ومدنه هنا يصحّحهما هنا.
          el("button.editplaces", { onclick: () => openEditPlaces() },
            t("تعديل"))) : null),
      // الرجوع من الخطة إلى رحلاتك القادمة دائمًا — منها جئت وإليها تعود.
      el("a.circle", { href: "#/upcoming" }, "‹"))));
  // «أضف مدينة أخرى لهذه الرحلة» رُفع من الترويسة: كان يجاور «تعديل» بابين
  // لنيةٍ واحدة — و«تعديل» يضيف المدينة ويحذفها معًا (addBox/askAdd أدناه).
  // بابان لغرض واحد يجعلان القارئ يسأل عن الفرق بينهما، ولا فرق.

  /// المدينة تصير مرحلةً في الرحلة. قسمة أولى معقولة: الجديدة تأخذ آخر ثلث
  /// الرحلة والسابقة تنتهي عندها — ثم تُعدَّل التواريخ من «مراحل الرحلة».
  function addCityLeg(c){
    const legs = legsOf(trip).slice();
    const last = legs[legs.length - 1];
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
    save();
  }

  /// حذف مدنٍ من الرحلة بمعرّفاتها. الرحلة لا تُفرَّغ — آخر مدينة تبقى.
  /// و`cityId` (مدينة الرحلة الأصل) قد يشير إلى محذوفة، فيتبع أول مرحلة
  /// باقية: بدونه تبقى «بطاقة الصدق» تتحدث عن مدينة ليست في الرحلة.
  function removeCities(ids){
    const legs = legsOf(trip).filter(l => !ids.includes(l.cityId));
    if (!legs.length) return;
    trip.legs = legs;
    if (ids.includes(trip.cityId)) trip.cityId = legs[0].cityId;
    save();
  }

  /// «تعديل» بجوار العنوان: دول الرحلة ومدنها في نافذة واحدة، يُحذف منها
  /// ويُضاف إليها، وكل إجراء يمرّ بتأكيد. كان الحذف ✕ صامتة داخل تبويب
  /// «تواريخ الرحلة» — لا يجدها من يقرأ عنوانه ويريد تصحيحه، وتحذف بلا
  /// سؤال. (طارق 2026-09-02)
  function openEditPlaces(){
    gate(close => {
      const body = el("div");

      // التأكيد يحلّ محلّ القائمة في البطاقة نفسها — لا نافذة فوق نافذة.
      const ask = ({ title, text, yes, danger, onYes }) => body.replaceChildren(
        el("h3", {}, title),
        el("p", {}, text),
        el("button.btn" + (danger ? ".danger" : ""),
          { onclick: () => { onYes(); draw(); } }, yes),
        el("button.later", { onclick: draw }, t("إلغاء")));

      const askAdd = (c) => ask({
        title: t("تأكيد الإضافة"),
        text: t`ستُضاف ${cityName(c)} مرحلةً إلى الرحلة، وتأخذ آخر ثلثها — والتواريخ تعدّلها بعدُ من «مراحل الرحلة».`,
        yes: t("أضفها"),
        onYes: () => addCityLeg(c),
      });
      const askCity = (c) => ask({
        title: t("حذف المدينة"),
        text: t`ستُحذف ${cityName(c)} من الرحلة بمرحلتها وتواريخها، وما وزّعته لها في الجدول يبقى في أيامه.`,
        yes: t("احذفها"), danger: true,
        onYes: () => removeCities([c.id]),
      });
      const askCountry = (g) => ask({
        title: t("حذف الدولة"),
        text: t`ستُحذف ${g.name} من الرحلة ومعها ${g.cities.map(cityName).join(" + ")}، وما وزّعته لها في الجدول يبقى في أيامه.`,
        yes: t("احذفها"), danger: true,
        onYes: () => removeCities(g.cities.map(c => c.id)),
      });

      /// صندوق الإضافة — بصياغة الصفحة نفسها لئلا تكون للنية الواحدة عبارتان.
      function addBox(){
        const input = el("input.gateinput", { placeholder: t("اسم المدينة…") });
        const hits = el("div.gatelist");
        input.oninput = () => {
          const q = input.value.trim().toLowerCase();
          hits.replaceChildren();
          if (q.length < 2) return;
          const found = store.cities.filter(c =>
            (c.name_ar || "").includes(q) || (c.name_en || "").toLowerCase().includes(q))
            .filter(c => !legsOf(trip).some(l => l.cityId === c.id)).slice(0, 6);
          if (!found.length){
            hits.append(el("div.empty", {}, t("لا مدينة بهذا الاسم عندنا.")));
            return;
          }
          for (const c of found)
            hits.append(el("button.grow", { onclick: () => askAdd(c) },
              el("div", { style: "min-width:0" },
                el("div.t", {}, cityName(c)),
                el("div.d", { style: "margin:0" }, countryName(c)))));
        };
        return el("div", {},
          el("h4.addhead", {}, t("أضف مدينة أخرى لهذه الرحلة")),
          input, hits);
      }

      function draw(){
        const cities = legsOf(trip)
          .map(l => store.cities.find(c => c.id === l.cityId)).filter(Boolean);
        // الدول بترتيب ظهورها في مراحل الرحلة — لا ترتيب مخترع.
        const groups = [];
        for (const c of cities){
          let g = groups.find(x => x.code === c.country_code);
          if (!g){ g = { code: c.country_code, name: countryName(c), cities: [] }; groups.push(g); }
          g.cities.push(c);
        }
        const list = el("div.gatelist");
        for (const g of groups){
          list.append(el("h4", {}, flag(g.code) + " " + g.name,
            groups.length > 1
              ? el("button.x", { "aria-label": t("احذف الدولة"),
                  onclick: () => askCountry(g) }, "✕")
              : null));
          for (const c of g.cities)
            list.append(el("div.grow", {},
              el("span.t", {}, cityName(c)),
              cities.length > 1
                ? el("button.x", { "aria-label": t("احذف المدينة"),
                    onclick: () => askCity(c) }, "✕")
                : null));
        }
        body.replaceChildren(
          el("h3", {}, t("مدن الرحلة ودولها")),
          el("p", {}, cities.length > 1
            ? t("احذف ما ليس منها، أو أضف مدينة أخرى.")
            : t("مدينة واحدة — أضف غيرها قبل أن تحذفها، فالرحلة لا تبقى بلا مدينة.")),
          list, addBox(),
          el("button.later", { onclick: close }, t("تم")));
      }

      draw();
      return body;
    }, render);   // الصفحة تحته تُعاد مرة واحدة عند الإغلاق، فلا تقفز تحت يده
  }

  const inner = el("div.section");
  root.append(inner);

  // ── بطاقة الصدق: ما لا يضمنه أي ذكاء مولِّد — تأشيرة مراجَعة من مصدر
  //    رسمي، طقس أرقام حقيقية، طيران متحقق منه. تركب أعلى كل خطة. ──
  if (city){
    // تبويبات: القارئ يفتح ما يريده ولا يمرّ بما لا يعنيه. والاختيار يبقى
    // بين إعادات الرسم — من فتح «السكن» ثم أضاف فندقًا يجده أمامه لا يبحث عنه.
    const facts = el("div.facttabs");
    const tabbar = el("div.tabbar");
    const panes = el("div.tabpanes");
    facts.append(tabbar, panes);
    const tabs = [];
    const show = (k) => {
      factsTab = k;
      tabs.forEach((t2, j) => {
        t2.btn.classList.toggle("on", j === k);
        t2.pane.style.display = j === k ? "" : "none";
      });
    };
    const sec = (title) => {
      const box = el("div.rows.factrows");
      const pane = el("div.tabpane", {}, box);
      const k = tabs.length;
      const btn = el("button.tabbtn", { onclick: () => show(k) }, title);
      tabs.push({ btn, pane });
      tabbar.append(btn); panes.append(pane);
      return box;
    };
    const secDates = sec(t("تواريخ الرحلة"));
    const secFly = sec(t("الطيران"));
    const secStay = sec(t("السكن"));
    const secVisa = sec(t("التأشيرة"));
    const secWx = sec(t("الطقس"));

    // التواريخ — انتقلت من رأس الصفحة إلى هنا، وتُعدَّل في مكانها.
    const ds = el("input", { type: "date", value: trip.start || "" });
    const de = el("input", { type: "date", value: trip.end || "" });
    ds.onchange = de.onchange = () => {
      if (!ds.value) return;
      const was = [trip.start, trip.end];
      trip.start = ds.value; trip.end = de.value || ds.value;
      const dropped = retimeTrip(trip, was[0], was[1]);
      // بداية الرحلة هي بداية أولى مدنها، ونهايتها نهاية آخرها — بديهةٌ كان
      // المستخدم يكتبها مرتين. وما بينهما يبقى كما رتّبه هو.
      const L = legsOf(trip);
      if (L.length){
        L[0].from = trip.start;
        L[L.length - 1].to = trip.end;
        trip.legs = L;
      }
      save(); render();
      if (dropped) noteDropped(dropped);
    };
    secDates.append(el("div.row", { style: "flex-wrap:wrap;gap:6px;align-items:center" },
      el("span.who", {}, "📅 " + tt("كامل الرحلة")), ds, de));

    // مراحل الرحلة: مدينة لكل مدى تواريخ — تُعدَّل هنا في مكانها.
    const legs0 = legsOf(trip);
    if (legs0.length > 1){
      legs0.forEach((l, i) => {
        const c = store.cities.find(x => x.id === l.cityId);
        const lf = el("input", { type: "date", value: l.from || "" });
        const lt = el("input", { type: "date", value: l.to || "" });
        lf.onchange = lt.onchange = () => {
          l.from = lf.value; l.to = lt.value;
          // يوم الانتقال واحد: تُغادر فيينا في الثالث وتصل شلادمينغ فيه.
          // فنهاية المدينة بدايةُ تاليتها — يكتبها مرة وتُكتب مرتين.
          const nx = legs0[i + 1];
          if (nx && l.to){
            nx.from = l.to;
            if (nx.to && nx.to < nx.from) nx.to = nx.from;
          }
          trip.legs = legs0;
          if (trip.end && l.to > trip.end) trip.end = l.to;
          if (trip.start && l.from < trip.start) trip.start = l.from;
          save(); render();
        };
        // الترتيب يُبدِّل **المدن** لا المدايات: التواريخ تبقى متسلسلة في
        // مكانها وتتبادل المدينتان موضعيهما فيها. ولو بدّلنا المرحلتين
        // بتاريخيهما لخرجت الرحلة عن ترتيبها الزمني وصار اليوم الرابع
        // قبل الثاني.
        const swap = (j) => {
          const a = legs0[i], b = legs0[j];
          if (!a || !b) return;
          const keep = a.cityId; a.cityId = b.cityId; b.cityId = keep;
          trip.legs = legs0;
          // مدينة الرحلة الأصل هي أولاها دائمًا — وقد تبدّلت للتوّ.
          trip.cityId = legs0[0].cityId;
          save(); render();
        };
        // `disabled: false` تمرّ عبر setAttribute فتصير disabled="false" —
        // وHTML يقرؤها معطَّلةً لا عاملة. فالسمة تُوضع أو لا تُوضع، ولا تُنفى.
        const arrow = (glyph, label, to, on) => el("button.legmove", {
          "aria-label": label, title: label,
          ...(on ? {} : { disabled: "disabled" }),
          onclick: () => on && swap(to) }, glyph);
        secDates.append(el("div.row.legrow",
          { style: "flex-wrap:wrap;gap:6px;align-items:center" },
          el("span.who", {}, "📍 " + (c ? cityName(c) : "")),
          el("span.legmoves", {},
            arrow("↑", t("قدّمها"), i - 1, i > 0),
            arrow("↓", t("أخّرها"), i + 1, i < legs0.length - 1)),
          lf, lt,
          // الحذف هنا يمرّ بما يمرّ به حذف «تعديل» سواءً: سؤالٌ أولًا،
          // ومدينة الرحلة الأصل تتبع أول مرحلة باقية.
          legs0.length > 1 ? el("button", { style: "border:none;background:none;"
            + "cursor:pointer;color:var(--deep)", "aria-label": t("احذف المرحلة"),
            onclick: () => askConfirm({
              title: t("حذف المدينة"),
              body: t`ستُحذف ${c ? cityName(c) : ""} من الرحلة بمرحلتها وتواريخها، وما وزّعته لها في الجدول يبقى في أيامه.`,
              yes: t("احذفها"), danger: true,
              onYes: () => { removeCities([l.cityId]); render(); },
            }) }, "✕") : null));
      });
    }

    // مطارٌ برمزه لا يقول شيئًا لمن لا يحفظ الرموز: VIE ثلاثة أحرف، و«فيينا»
    // مدينةٌ يعرفها. فنردّ الإياتا إلى أقرب مدينةٍ في سجلنا مرتبطةً به.
    const cityOfIata = (iata) => {
      if (!iata) return "";
      const code = iata.toUpperCase();
      // `origins` خريطةٌ مسمّاة يدًا: مطارٌ ومدينته بالعربية. تُقدَّم على
      // الحساب لأن الأقرب مسافةً ليس المدينة الأمّ دائمًا — RUH أقرب إلى
      // الدرعية منه إلى الرياض، وDXB إلى الشارقة. جُرِّبا فأخطأ الحسابُ فيهما.
      const o = (store.origins || []).find(x => (x.iata || "").toUpperCase() === code);
      if (o) return isEN ? (o.city_en || o.city_ar) : (o.city_ar || o.city_en);
      const ap = Object.values(store.airports || {})
        .find(a => (a.iata || "").toUpperCase() === code);
      if (!ap) return code;
      let best = null, bd = Infinity;
      for (const [cid, links] of Object.entries(store.cityAirports || {}))
        for (const l of links)
          if (l.airport_id === ap.id && (l.distance_km ?? 1e9) < bd){
            bd = l.distance_km ?? 1e9; best = cid;
          }
      const c = best && store.cities.find(x => x.id === best);
      return c ? cityName(c) : (ap.name_en || iata);
    };
    /// «إقلاع من جدة (JED) 10:10 - وصول إلى فيينا (VIE) 14:25» — جملةٌ تُقرأ
    /// لا رموزٌ وأسهم. الرمز والوقت لاتينيان داخل عربية، فيُعزلان بمحرفَي
    /// العزل (U+2066/U+2069) وإلا أعاد ترتيبُ الاتجاه قوسًا أو نقطتين.
    const LRI = "\u2066", PDI = "\u2069";
    const iso = (x) => x ? LRI + x + PDI : "";
    // «من» و«إلى» حرفا جرٍّ لا يقفان وحدهما: بلا مطارٍ معلوم تصير «إقلاع
    // 10:10»، وبلا وقتٍ ولا مطار يسقط الطرف كله بدل «إقلاع من -» معلّقة.
    const endPart = (withPlace, bare, iata, time) => {
      const city = cityOfIata(iata);
      if (!city && !time) return "";
      const bits = [city ? withPlace : bare];
      if (city) bits.push(city);
      if (iata) bits.push(iso("(" + iata + ")"));
      if (time) bits.push(iso(time));
      return bits.join(" ");
    };
    const routeLine = (f) => {
      const a = endPart(t("إقلاع من"), t("إقلاع"), f.from, f.dep);
      const b = endPart(t("وصول إلى"), t("وصول"), f.to, f.arr);
      return [a, b].filter(Boolean).join(" - ");
    };

    // رقم الرحلة وأوقاتها — يدخلها المستخدم فتحكم يومي السفر في الجدول والتوزيع.
    // رقم الرحلة أو الأوقات — لا كلاهما: الرقم يجلب الأوقات من الخادم،
    // وإن تعذر الجلب انفتح الإدخال اليدوي.
    const flightRow = (dir, lbl) => {
      const f = trip.flights[dir];
      const row = el("div.row", { style: "flex-wrap:wrap;gap:6px;align-items:center" },
        el("span.who", {}, "✈️ " + lbl));
      if ((f.dep || f.arr) && !f.editing){
        const route = routeLine(f);
        row.append(
          el("div", { style: "display:flex;flex-direction:column;gap:2px;min-width:0" },
            f.no ? el("span", {}, iso(f.no)) : null,
            // الأوقات كانت تُكتب مرتين: مرة عارية ومرة مع المدينتين.
            el("span", {}, route || tt`إقلاع ${f.dep || "؟"} · وصول ${f.arr || "؟"}`)),
          // رقمٌ خاطئ يُصحَّح بالرقم لا باليد: «تصحيح الرقم» يعيدنا إلى
          // البحث فتُجلب الأوقات والمدينتان من جديد. و«الأوقات» لمن أرادها
          // يدويًا — كان الزر الوحيد يقود إلى اليد وحدها.
          el("button.chip", { title: t("صحّح رقم الرحلة"),
            onclick: () => { f.editing = true; f.manual = false;
              f.dep = ""; f.arr = ""; save(); render(); } }, "✎ " + t("الرقم")),
          el("button.chip", { title: t("عدّل الأوقات يدويًا"),
            onclick: () => { f.editing = true; f.manual = true; save(); render(); } },
            "🕑"));
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
        const route = routeLine(f);
        if (route) row.append(el("span.det", {}, route));
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
              if (j.from) f.from = j.from;   // مطار الإقلاع كان يُهمَل
              if (j.to) f.to = j.to;
              f.editing = false; f.manual = false;
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
    secFly.append(flightRow("out", tt("رحلة الذهاب")),
                  flightRow("back", tt("رحلة العودة")));

    // السكن — فندق لكل مرحلة. البحث محصور بمدينة المرحلة المختارة، وإلا
    // ما ظهر فندق فيينا أبدًا ما دامت الرحلة تبدأ من شلادمينغ.
    const legs = legsOf(trip);
    const legCity = i => store.cities.find(c => c.id === legs[i]?.cityId) || city;
    // تبدأ على أول مرحلة بلا سكن: من أضاف فيينا للتو يبحث في فيينا، لا في
    // شلادمينغ فيرى «لا نتيجة» ويظنّ البحث معطوبًا.
    const legHasStay = (i) => {
      const l = legs[i]; if (!l) return true;
      return (trip.stays || []).some(st => st.from && l.from
        && st.from >= l.from && st.from <= (l.to || l.from));
    };
    const firstEmpty = Math.max(0, legs.findIndex((_, i) => !legHasStay(i)));
    const legPick = el("select", { style: "font:inherit;padding:3px 6px" },
      ...legs.map((l, i) => el("option", { value: String(i) }, cityName(legCity(i)))));
    legPick.value = String(firstEmpty);
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
    secStay.append(el("div.row", { style: "flex-wrap:wrap;gap:6px;align-items:center" },
      el("span.who", {}, "🏨 " + tt("ابحث عن سكنك")),
      ...(legs.length > 1 ? [legPick] : []), stayIn), stayRes);
    for (const st of trip.stays){
      const fi = el("input", { type: "date", value: st.from || "" });
      const ti = el("input", { type: "date", value: st.to || "" });
      fi.onchange = ti.onchange = () => {
        st.from = fi.value; st.to = ti.value; save(); render(); };
      secStay.append(el("div.row", { style: "flex-wrap:wrap;gap:6px;align-items:center" },
        el("span", {}, "🏨 " + st.name),
        el("span.det", {}, t("دخول")), fi,
        el("span.det", {}, t("خروج")), ti,
        el("button", { style: "border:none;background:none;cursor:pointer",
          onclick: () => {
            trip.stays = trip.stays.filter(x => x.id !== st.id); save(); render();
          } }, "✕")));
    }

    // مدن الرحلة كلها: حكم التأشيرة يتبع الدولة، والطقس يتبع المدينة وشهر
    // مرحلتها — رحلةٌ إلى مدينتين قد تعبر دولتين وطقسين.
    const legCityList = legsOf(trip)
      .map(l => ({ leg: l, c: store.cities.find(x => x.id === l.cityId) }))
      .filter(x => x.c);
    if (!legCityList.length) legCityList.push({ leg: {}, c: city });
    const seenCountry = new Set();
    let visaRows = 0;
    for (const { c } of legCityList){
      if (seenCountry.has(c.country_code)) continue;
      seenCountry.add(c.country_code);
      const vl = visaLine(ctx, c);
      if (!vl) continue;
      visaRows++;
      secVisa.append(el("div.row", {}, el("span.who", {},
        "🛂 " + (legCityList.length > 1 || seenCountry.size > 1
          ? countryName(c) + ": " + vl : vl))));
    }
    if (!visaRows)
      secVisa.append(el("div.row", {}, el("span.who", {},
        "🛂 " + t("اختر جوازك من صفحة المدينة لترى حكم التأشيرة"))));
    let wxRows = 0;
    for (const { leg, c } of legCityList){
      const day = leg.from || trip.start;
      if (!day) continue;
      const m = new Date(day + "T00:00:00").getMonth() + 1;
      const w = store.temps ? store.temps(c, m) : null;
      if (!w) continue;
      wxRows++;
      const rw = { none: RAIN_AR.r0, light: RAIN_AR.r1,
                   moderate: RAIN_AR.r2, heavy: RAIN_AR.r3 }[store.rainLevel(w.p_mm_avg)];
      secWx.append(el("div.row", {}, el("span.who", {},
        "🌤 " + (legCityList.length > 1 ? cityName(c) + " · " : "")
        + tt`${MONTHS_AR[m - 1]}: ${Math.round(w.t_max_avg_c)}° نهارًا، ${Math.round(w.t_min_avg_c)}° ليلًا — ${rw}`)));
    }
    if (!wxRows)
      secWx.append(el("div.row", {}, el("span.who", {},
        "🌤 " + t("حدد تواريخ رحلتك ليظهر طقس شهرها"))));
    show(Math.min(factsTab, tabs.length - 1));
    inner.append(el("div.card", { style: "margin-bottom:14px" },
      el("h2", { style: "margin-bottom:6px" }, t("بيانات رحلتك")),
      facts));
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
          const was = [trip.start, trip.end];
          trip.start = ts.value; trip.end = te.value || ts.value;
          const dropped = retimeTrip(trip, was[0], was[1]);
          save(); render();
          if (dropped) noteDropped(dropped);
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
    // مغلقٌ في بعض أيام المرحلة لا يُحذف من الاقتراحات: هوبسيلاند مفتوح
    // أربعة من أيامك ومغلق يومين — يبقى، ويُمنع من يومَي إغلاقه وحدهما.
    // ولا يسقط إلا من أُغلق كل أيام المرحلة، فذاك لا موضع له فيها.
    const legDays = [];
    for (let d = new Date(from + "T00:00:00"), end = new Date((to || from) + "T00:00:00");
         d <= end; d.setDate(d.getDate() + 1)) legDays.push(new Date(d));
    const items = suggestable(store.attractions?.[l.cityId])
      .filter(a => !legDays.length || legDays.some(d => !closedWeekly(a, d)))
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
        ...(a.closed_ranges ? { cr: a.closed_ranges } : {}),
        ...(a.closed_until ? { closed_until: a.closed_until } : {}),
        ...(a.open_daily_months ? { odm: a.open_daily_months } : {}) });
      tallyPick(a.qid);
    }
    save(); render();
  };
  // نافذة التفاصيل: لا يضيف المرء إلى جدوله ما لم يره. نعرض ما في السجل
  // ولا نزيد — ما لم يُجمع لا يُخترع، والقرار (أضف / ألغِ) في يد صاحبه.
  // نافذة التفاصيل: لا يضيف المرء إلى جدوله ما لم يره. نعرض ما في السجل
  // ولا نزيد — ما لم يُجمع لا يُخترع، والقرار (أضف / أزل) في يد صاحبه.
  // والأسهم تنقلك بين فعاليات المجموعة نفسها بلا إغلاق وفتح.
  const openDetails = (list, idx, onRemoveFree, ctl) => {
    if (document.querySelector(".detback")) return;
    const close = () => { back.remove(); card.remove(); };
    const back = el("div.detback", { onclick: close });
    const card = el("div.detcard", { onclick: e => e.stopPropagation() });
    let i = Math.max(0, Math.min(idx, list.length - 1));

    const paint = () => {
      const { a, label, city } = list[i];
      const chosen = onRemoveFree ? true : !!(a.qid && planOf(a.qid));
      const rows = [];
      // لا يُكتب سطرٌ لقيمة ليست معلومة: «null» محفوظًا من خطة قديمة نصٌّ
      // في العين وفراغٌ في المعنى.
      const row = (k, v) => { const val = clean(v); return val
        ? rows.push(el("div.detrow", {}, el("span.k", {}, k), el("span.v", {}, val)))
        : null; };
      row(t("الأوقات"), a.hours_ar);
      row(t("التذاكر"), a.needs_ticket ? t("تحتاج تذكرة")
        : a.free_entry ? t("الدخول مجاني") : (a.ticket_price_note || ""));
      row(t("الوصول"), a.access_note_ar
        || (a.access_minutes ? tt`${a.access_minutes} د مشيًا` : ""));
      row(t("الموسم"), a.season_note_ar);
      row(t("يغلق"), [closedDaysText(a),
        ...(a.closed_ranges || []).map(r => `${r.from} → ${r.to || r.from}: ${r.why_ar || ""}`)]
        .filter(Boolean).join(" · "));
      row(t("لمن"), a.audience_note_ar
        || (Array.isArray(a.audiences) ? a.audiences.join("، ") : ""));
      row(t("الشروط"), [a.min_age ? tt`العمر من ${a.min_age} سنة` : "",
        a.min_height_cm ? tt`الطول من ${a.min_height_cm} سم` : ""].filter(Boolean).join(" · "));
      row(t("الموقف"), [a.parking_name, a.parking_note_ar].filter(Boolean).join(" · "));
      row(t("القيمة"), a.value_ar);
      // مكانٌ كتبه صاحب الرحلة بيده: عنوانه من الخريطة سطرٌ معنون، لا نصٌّ
      // سائب في موضع التعريف.
      row(t("العنوان"), a.where);
      const blurb = clean(isEN ? (a.blurb_en || a.blurb) : (a.blurb || a.blurb_en));
      const nameEn = clean(a.name_en);
      const nav = (d) => { i = (i + d + list.length) % list.length; paint(); };
      // `replaceChildren` ليس كـ`el`: ما مرّ إليه فارغًا (بلا صورة، بلا
      // تعريف، بلا تنبيه) صار عقدة نصّها «null» تُقرأ في وجه المستخدم.
      // فيُنخل الفارغ قبل أن يدخل النافذة.
      card.replaceChildren(...[
        el("div.dethead", {},
          el("div.pickicon", {}, activityIcon(label + " " + (a.name_en || ""), a.kind, a.icon_id)),
          el("div", { style: "flex:1;min-width:0" },
            el("h3", {}, label),
            // المدينة أولًا وبوضوح: «هالشتات» تقول لك أين أنت قبل كل تفصيل.
            city ? el("div.detcity", {}, "◉ " + city) : null,
            nameEn && nameEn !== label ? el("div.den", {}, nameEn) : null),
          el("button.x", { onclick: close, "aria-label": t("إغلاق") }, "✕")),
        a.has_image ? el("img.detimg", { src: "attractions/" + a.qid + ".jpg",
          alt: label, loading: "lazy", onerror: (e) => e.target.remove() }) : null,
        el("div.detmeta", {},
          clean(a.kind) ? el("span.kind", {}, clean(a.kind)) : null,
          a.added_count > 0 ? el("span.cnt", {}, tt`اختارها ${a.added_count}`) : null),
        blurb ? el("p.detblurb", {}, blurb) : null,
        rows.length ? el("div.detrows", {}, rows) : null,
        // ما ليس في سجلنا بعد: نقول إن العمل جارٍ، ولا نترك نافذةً فارغة
        // يظنّها القارئ عطلًا.
        a.pending ? el("div.detwait", {}, el("i.spin"),
          el("span", {}, t("جارٍ جمع بياناتها — أوقاتها وتذاكرها وما يلزم قبل الذهاب"))) : null,
        el("div.detlinks", {},
          a.tickets_url ? el("a", { href: a.tickets_url, target: "_blank",
            rel: "noopener nofollow" }, t("شراء التذاكر")) : null,
          a.official_url ? el("a", { href: a.official_url, target: "_blank",
            rel: "noopener nofollow" }, t("الموقع الرسمي ↗")) : null),
        (a.hours_ar || a.tickets_url || a.official_url)
          ? el("div.detdisc", {}, t("معلومات استرشادية — تأكد من المصدر")) : null,
        // مكانٌ في الجدول: يومه وفترته يُنقلان من هنا — لا من صفٍّ يتمدد
        // تحت البطاقة بأدوات لا يطلبها من أراد أن يقرأ فقط.
        ctl || null,
        el("div.detbtns", {},
          // التنقل بين فعاليات المجموعة: في العربية السهم الأيمن للسابق.
          list.length > 1 ? el("button.detnav", { "aria-label": t("السابق"),
            title: t("السابق"), onclick: () => nav(-1) }, "›") : null,
          el("button" + (chosen ? ".detrm" : ".detadd"), { onclick: () => {
            // القرار يُنهي النافذة: من ضمّ أو أزال انتهى شغله بها، ولا يُترك
            // أمام نافذة تعرض حالةً سبقت فعله.
            close();
            if (onRemoveFree) onRemoveFree();
            else togglePick(a, label);
          } }, chosen ? t("أزل من الجدول") : t("أضف للجدول")),
          list.length > 1 ? el("button.detnav", { "aria-label": t("التالي"),
            title: t("التالي"), onclick: () => nav(1) }, "‹") : null,
          el("button.detno", { onclick: close }, t("أغلق")))].filter(Boolean));
    };
    paint();
    document.body.append(back, card);
  };
  // البطاقة: جسدها يفتح التفاصيل، و«+» في زاويتها يضم مباشرة بلا نافذة.
  const pickCard = (a, ctx) => {
    const label = (isEN ? (a.name_en || a.name_ar) : (a.name_ar || a.name_en));
    const chosen = planOf(a.qid);
    const body = el(chosen
      ? (chosen.day >= 0 ? "button.pick.sel" : "button.pick.sel.pend")
      : "button.pick", { onclick: () => {
        const list = (ctx?.items || [a]).map(x => ({
          a: x, city: ctx?.city || "",
          label: (isEN ? (x.name_en || x.name_ar) : (x.name_ar || x.name_en)) }));
        openDetails(list, Math.max(0, (ctx?.items || []).indexOf(a)));
      } },
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
  // مجموعة لكل مرحلة بعنوان مدينتها — والاسم يُكتب ولو كانت المدينة واحدة.
  // كان يُخفى حينها، فيبدأ الاقتراح بلا عنوان بينما «الأماكن القريبة» تحته
  // تعلن مدينتها دائمًا — فيسأل القارئ: لمن هذه الأولى؟ والتواريخ وحدها
  // تُذكر عند التعدد، إذ لا معنى لمدىً واحد يساوي مدى الرحلة كلها.
  // كل صفٍّ يُحفظ باسم مدينته: ما يضيفه المستخدم بيده ينزل تحت مدينته لا
  // في صفٍّ يتيم آخر الصفحة — فالمكان يُقرأ مع جيرانه أو لا يُقرأ.
  const rowByCity = new Map();
  /// مدى المرحلة بالعربية: «١٠ – ٢١ سبتمبر» في الشهر الواحد، و«٢٨ سبتمبر –
  /// ٣ أكتوبر» عبر شهرين. كان «09-10 → 09-21» — أرقامٌ يقلب اتجاهُ الصفحة
  /// ترتيبَها ويقلب سهمَها معها، فيقرأ العربي الشهر قبل اليوم والسهم معكوسًا.
  /// والاسم الصريح للشهر لا يحتمل قلبًا، والشرطة لا اتجاه لها تُعكس.
  const legRange = (from, to) => {
    if (!from) return "";
    const d1 = new Date(from + "T00:00:00");
    const d2 = new Date((to || from) + "T00:00:00");
    const loc = isEN ? "en" : "ar";
    const mon = (d) => d.toLocaleDateString(loc, { month: "long" });
    const day = (d) => d.toLocaleDateString(loc, { day: "numeric" });
    return mon(d1) === mon(d2)
      ? `${day(d1)} – ${day(d2)} ${mon(d2)}`
      : `${day(d1)} ${mon(d1)} – ${day(d2)} ${mon(d2)}`;
  };
  for (const g of legReg){
    const name = g.city ? cityName(g.city) : "";
    const range = legReg.length > 1 ? legRange(g.leg.from, g.leg.to) : "";
    regBox.append(el("div.legname", {}, name,
      range ? el("span.legdates", {}, " · " + range) : null));
    const gctx = { items: g.items, city: name };
    const row = el("div.pickrow", {}, g.items.map(a => pickCard(a, gctx)));
    regBox.append(row);
    if (name) rowByCity.set(name, row);
  }
  // ── أماكن قريبة من مكان إقامتك ──
  // من ينزل في شلادمينغ يزور هالشتات وسالزبورغ في يومٍ منها ولا ينقل حقائبه.
  // فهذه ليست مراحل — لا فندق لها ولا تواريخ — بل مدن على مرمى قيادة من
  // سكنك، تدخل فعالياتها جدولك كأي فعالية أخرى.
  const NEAR_KM = 110;
  const legCityIds = new Set(legsOf(trip).map(l => l.cityId));
  const bases = legsOf(trip)
    .map(l => store.cities.find(c => c.id === l.cityId)).filter(c => c && c.lat != null);
  const nearby = [];
  if (bases.length){
    for (const c of store.cities){
      if (legCityIds.has(c.id) || c.lat == null) continue;
      const items = suggestable(store.attractions?.[c.id])
        .sort((x, y) => (y.added_count || 0) - (x.added_count || 0)).slice(0, 12);
      if (!items.length) continue;
      let km = Infinity;
      for (const b of bases) km = Math.min(km, kmAB(c, b));
      if (km <= NEAR_KM) nearby.push({ city: c, km: Math.round(km), items });
    }
    // الترتيب بزمن القيادة متى قِيس: سالزبورغ أبعد هوائيًا من باد غاشتاين
    // وأقرب بالطريق — والمسافر يقود ولا يطير.
    const drvOf = (n) => trip.dayStats?.["near:" + n.city.id]?.min ?? null;
    nearby.sort((a2, b2) => {
      const d1 = drvOf(a2), d2 = drvOf(b2);
      if (d1 != null && d2 != null) return d1 - d2;
      if (d1 != null) return -1;
      if (d2 != null) return 1;
      return a2.km - b2.km;
    });
  }
  // ثلاث لكل مرحلة لا أربع للرحلة كلها: من ينزل مدينتين له جيرانٌ في كلٍّ.
  const nearShow = [];
  for (const base of bases){
    const mine = nearby.filter(n => bases.reduce((acc, b) =>
      kmAB(n.city, b) < kmAB(n.city, acc) ? b : acc, bases[0]) === base);
    nearShow.push(...mine.slice(0, 3));
  }
  if (nearShow.length){
    regBox.append(el("div.nearhead", {}, t("أماكن قريبة من مكان إقامتك")));
    for (const n of nearShow){
      const drv = trip.dayStats?.["near:" + n.city.id]?.min;
      regBox.append(el("div.legname", {},
        cityName(n.city) + " · " + (drv ? tt`${drv} د قيادة` : tt`~${n.km} كم`)));
      const nctx = { items: n.items, city: cityName(n.city) };
      const nrow = el("div.pickrow", {}, n.items.map(a => pickCard(a, nctx)));
      regBox.append(nrow);
      rowByCity.set(cityName(n.city), nrow);
    }
  }

  // ما جاء من البحث الحر بطاقة مختارة هو الآخر — والضغط عليها يلغيه.
  const freeBox = el("div.pickrow", {});
  const nearestBase = (p) => (bases.length && (p.lat || p.lon))
    ? bases.reduce((acc, b) => kmAB(p, b) < kmAB(p, acc) ? b : acc, bases[0]) : null;
  // أين يقع فعلًا؟ أقرب مدينة نعرفها في سجلنا كله — لا مدن الرحلة وحدها.
  // من كتب اسمًا فأصاب مكانًا في دولة أخرى يستحق أن يُقال له أين وقع، لا
  // أن تُدفن بطاقته في آخر الصفحة بلا عنوان.
  const nearestKnown = (p) => {
    if (!(p.lat || p.lon)) return null;
    let best = null, bestKm = Infinity;
    for (const c of store.cities){
      if (c.lat == null || c.lon == null) continue;
      const d = kmAB(p, c);
      if (d < bestKm){ bestKm = d; best = c; }
    }
    return best ? { city: best, km: Math.round(bestKm) } : null;
  };
  for (const p of trip.plan){
    if (p.qid && regQids.has(p.qid)) continue;
    const rm = () => { trip.plan = trip.plan.filter(x => x.id !== p.id); save(); render(); };
    // ليس في سجلنا بعد: طلبُه خرج للوكلاء، والبطاقة تدور حتى تصل بياناته.
    const waiting = !p.qid;
    const base = nearestBase(p);
    const baseKm = base ? Math.round(kmAB(p, base)) : null;
    const near = base && baseKm < 120;
    const where = near ? cityName(base) : "";
    // بعيدٌ عن كل مدن رحلته: نقول له أين وقع وكم يبعد، بدل صمتٍ يوهمه
    // أن اقتراحه في مكانه. والدولة تُذكر إن اختلفت — فذاك أبعد من مسافة.
    let farLine = "";
    if (!near && (p.lat || p.lon)){
      const k = nearestKnown(p);
      const there = k ? cityName(k.city) : "";
      const land = k && base && k.city.country_code !== base.country_code
        ? countryName(k.city) : "";
      const bits = [];
      if (there) bits.push(land ? there + tt("، ") + land : there);
      if (base && baseKm != null) bits.push(tt`${baseKm} كم من ${cityName(base)}`);
      farLine = bits.join(" · ");
    }
    if (waiting && !p.ask && !asked.has(p.id)){
      asked.add(p.id);
      askForPlace(p, where).then(ok => { if (ok){ p.ask = 1; save(); } });
    }
    const body = el(p.day >= 0 ? "button.pick.sel" : "button.pick.sel.pend",
      { onclick: () => openDetails([{ a: { name_en: clean(p.en), kind: clean(p.kind),
          where: clean(p.detail), pending: waiting, added_count: 0 },
          label: p.name, city: where }], 0, rm) },
      el("div.pickicon", {}, activityIcon(p.name + " " + (p.en || ""), p.kind)),
      el("div.pn", {}, p.name),
      waiting
        ? el("div.pc.wait", {}, el("i.spin"), t("جارٍ جمع بياناتها"))
        : el("div.pc", {}, clean(p.kind) || "‏"),
      // موضعه الحقيقي ومسافته — يُكتب على البطاقة نفسها لا في هامش.
      farLine ? el("div.pcfar", {}, "⚑ " + farLine) : null);
    const wrap = el("div.pickwrap" + (p.day >= 0 ? "" : ".pend"), {}, body,
      el("button.pickadd.on", { "aria-label": t("أزل من الجدول"),
        title: t("أزل من الجدول"),
        onclick: (e) => { e.stopPropagation(); rm(); } }, "✓"));
    // تحت مدينته إن عرفناها — وإلا فصفٌّ أخير لما لم نستطع نسبته.
    (rowByCity.get(where) || freeBox).append(wrap);
  }
  if (freeBox.children.length){
    regBox.append(el("div.legname", {}, t("أماكن أضفتها — خارج مدن رحلتك")));
    regBox.append(el("div.farnote", {},
      t("هذه لم تقع قرب أي مدينة في رحلتك. تحت كل بطاقة موضعها ومسافتها — راجعها قبل أن توزّعها على أيامك.")));
    regBox.append(freeBox);
  }
  const input = el("input.addowninput", {
    placeholder: t("اكتب اسم مكان — زحليقة، مقهى، بحيرة…") });
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
    // صندوقٌ له عنوانه: كان حقلًا عاريًا بكلمة «أضف مكانًا» بجانبه، فيمرّ
    // عليه القارئ ولا يعلم أن له أن يضيف من عنده. العنوان يقول له ذلك.
    el("div.addown", {},
      el("h3", {}, t("لم تجد ما تريد؟ أضفه بنفسك")),
      el("p", {}, t("اكتب اسم أي مكان — مقهى، حديقة، مطعم، شاطئ — ونجمع بياناته ونضعه تحت مدينته.")),
      input,
      results));
  // سجلنا أولًا ثم الخريطة: من كتب «شافبيرغ» عندنا سجلها كاملةً — اسمها
  // العربي وأوقاتها وإغلاقها وأيقونتها — فلا يُضاف صدفةٌ عارية من الخريطة
  // ولنا أصلها. والأقرب إلى مدن رحلته أوّلًا، ثم الأكثر اختيارًا.
  const regSearch = (q) => {
    const out = [];
    for (const [cid, list] of Object.entries(store.attractions || {}))
      for (const a of list)
        if (matchesLoosely(q, [a.name_ar || "", a.name_en || ""])) out.push({ a, cid });
    const cityOf = (cid) => store.cities.find(c => c.id === cid);
    return out.map(h => { const c = cityOf(h.cid);
        return { ...h, c, km: (c && bases.length)
          ? Math.min(...bases.map(b => kmAB(c, b))) : 9e9 }; })
      .sort((x, y) => (x.km - y.km) || ((y.a.added_count || 0) - (x.a.added_count || 0)))
      .slice(0, 6);
  };
  // ردٌّ بطيء لحرفٍ سابق لا يكتب في نتائج حرفٍ لاحق.
  let searchSeq = 0;
  // نتيجة خريطةٍ عندنا أصلها: اسمٌ يوافق اسمنا ونقطةٌ تشهد أنه هو.
  const regNear = (pt, name) => {
    const h = regSame(pt, name, store);
    return h ? { ...h, c: store.cities.find(c => c.id === h.cid) } : null;
  };
  input.oninput = () => {
    clearTimeout(nominatimTimer);
    const seq = ++searchSeq;
    const q = input.value.trim();
    results.replaceChildren();
    if (q.length < 3) return;
    const regRow = (h) => {
      const label = (isEN ? (h.a.name_en || h.a.name_ar) : (h.a.name_ar || h.a.name_en));
      return el("button.srow", { style: "width:100%;text-align:start",
        onclick: () => openDetails([{ a: h.a, label,
          city: h.c ? cityName(h.c) : "" }], 0) },
        el("div", {},
          el("div.t", {}, label,
            el("span.inreg", {}, t("في سوفينير"))),
          el("div.s", {}, [h.c ? cityName(h.c) : "", clean(h.a.kind)]
            .filter(Boolean).join(" · "))));
    };
    const mine = regSearch(q);
    for (const h of mine) results.append(regRow(h));
    nominatimTimer = setTimeout(async () => {
      const wait = el("div.det", {}, "…");
      results.append(wait);
      const hits = await searchPlaces(q, city).catch(() => []);
      if (seq !== searchSeq) return;
      wait.remove();
      const shown = new Set(mine.map(m => m.a.qid));
      const seenOsm = new Set();
      for (const h of hits.slice(0, 6)){
        // الخريطة تعيد المكان الواحد ثلاثًا (نقطة ومساحة وعلاقة) — صفٌّ واحد
        // يكفي: الاسم نفسه على بعد خمسين مترًا هو هو.
        const stem = h.display_name.split(",")[0] + "@"
          + (+h.lat).toFixed(3) + "," + (+h.lon).toFixed(3);
        if (seenOsm.has(stem)) continue;
        seenOsm.add(stem);
        // نتيجة الخريطة التي عندنا أصلها تُعرض بأصلها: من بحث بالألمانية
        // «Mirabellgarten» يصل إلى «قصر ميرابيل وحدائقه» بسجله كاملًا، لا
        // إلى صدفةٍ عارية باسم أجنبي. والمطابقة بالنقطة لا بالاسم.
        const at = { lat: +h.lat, lon: +h.lon };
        const same = regNear(at, h.display_name);
        if (same){
          if (shown.has(same.a.qid)) continue;
          shown.add(same.a.qid);
          results.append(regRow(same));
          continue;
        }
        results.append(el("button.srow", { style: "width:100%;text-align:start",
          onclick: () => {
            const np = { id: "p" + Date.now() + Math.random().toString(36).slice(2, 6),
              name: h.display_name.split(",")[0], detail: h.display_name,
              lat: +h.lat, lon: +h.lon, kind: "", day: -1, slot: "" };
            trip.plan.push(np);
            save(); render();
          } },
          el("div", {},
            el("div.t", {}, h.display_name.split(",")[0]),
            el("div.s", {}, h.display_name.split(",").slice(1, 4).join("،")))));
      }
      if (mine.length && !hits.length) return;
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
  // الدبوس يفتح بطاقته، والبطاقة تُبنى بعدُ في الشيفرة — فيمرّ الفتح من هنا.
  const mapOpen = {};
  for (const p of trip.plan){
    if (p.qid) seenQ.add(p.qid);
    if (!(p.lat || p.lon)) continue;
    pins.push({ lat: p.lat, lon: p.lon, name: p.name,
      mark: p.day >= 0 ? String(p.day + 1) : "•",
      color: p.day >= 0 ? dayColor(p.day) : null,
      open: () => mapOpen.place && mapOpen.place(p) });
  }
  for (const st of trip.stays){
    if (st.lat || st.lon)
      pins.push({ lat: st.lat, lon: st.lon, name: st.name, mark: "🏨", stay: true });
  }
  for (const a of reg){
    if (seenQ.has(a.qid) || !(a.lat || a.lon)) continue;
    const label = (isEN ? (a.name_en || a.name_ar) : (a.name_ar || a.name_en));
    pins.push({ lat: a.lat, lon: a.lon, name: label, mark: "•", color: null, reg: true,
      open: () => openDetails([{ a, label,
        city: mapOpen.cityOf ? mapOpen.cityOf(a) : "" }], 0) });
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
      // الاسم مكتوبٌ تحت الدبوس لا في تلميحٍ يظهر بالمرور: من يقرأ الخريطة
      // على هاتفه لا يمرّ بمؤشر. ويختفي حين تتسع الرقعة فلا تزدحم القارة.
      const esc = (x) => String(x).replace(/[&<>"]/g,
        c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      const g = L.featureGroup(pins.map(p => {
        const mk = L.marker([p.lat, p.lon], { icon: L.divIcon({
          className: "pmark-wrap" + (p.reg ? " regpin" : ""),
          html: (p.stay
            ? `<div class="pmark stay">${p.mark}</div>`
            : `<div class="pmark"${p.color ? ` style="background:${p.color}"` : ""}>${p.mark}</div>`)
            + `<span class="plabel">${esc(p.name)}</span>`,
          iconSize: [26, 26], iconAnchor: [13, 13] }) });
        // الضغط على الدبوس يفتح بطاقة مكانه — كما تفتحها بطاقة المقترحات
        // وصفّ الجدول سواء.
        if (p.open) mk.on("click", () => p.open());
        return mk;
      })).addTo(m);
      // أماكن رحلتك وفنادقها تحمل أسماءها في كل رقعة. أما المقترحات التي
      // لم تخترها فأسماؤها تُطوى حين تتسع الرقعة، وإلا حجب الحبرُ الخريطة.
      const labelZoom = () => mapBox.classList.toggle("nolabels", m.getZoom() < 10);
      m.on("zoomend", labelZoom); labelZoom();
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
          ok = placePending(trip, dd2, store.cities);
        } else if (legs.length > 1){
          for (const l of legs){
            const sub = dd2.filter(d => (!l.from || ymd(d) >= l.from)
                                     && (!l.to || ymd(d) <= l.to));
            if (!sub.length) continue;
            const off = dd2.findIndex(d => ymd(d) === ymd(sub[0]));
            // من يخصّ هذه المرحلة؟ كان الجواب «من له qid في سجلّ مدينتها» —
            // فما أضافه المستخدم بيده لا qid له، فلا يخصّ مرحلةً قط ويبقى
            // معلّقًا حتى ضغطةٍ ثانية. والصواب أن تحكم الجغرافيا: أقرب مدن
            // الرحلة إلى إحداثياته هي مرحلته، سجّلناه أو لم نسجّله.
            const legCity = store.cities.find(c => c.id === l.cityId);
            const mine = trip.plan.filter(p => {
              if ((store.attractions?.[l.cityId] || []).some(x => x.qid === p.qid))
                return true;
              if (p.qid || !(p.lat || p.lon) || !legCity || legCity.lat == null)
                return false;
              // أقرب مرحلةٍ إليه لا أيّ مرحلة: لا يُحسب لفيينا وشلادمينغ معًا.
              let near = null, nd = Infinity;
              for (const g of legs){
                const gc = store.cities.find(c => c.id === g.cityId);
                if (!gc || gc.lat == null) continue;
                const d = kmAB(p, gc);
                if (d < nd){ nd = d; near = g; }
              }
              return near === l;
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

  // السجل بالمعرّف — ليُفتَح لمكانٍ في الجدول ما يُفتح له في المقترحات.
  let regIndex = null;
  const regOf = (qid) => {
    if (!regIndex){
      regIndex = {};
      for (const list of Object.values(store.attractions || {}))
        for (const a of list) regIndex[a.qid] = a;
    }
    return (qid && regIndex[qid]) || null;
  };
  // مدينة المكان تُعرف بالجغرافيا أولًا: مكانٌ في شلادمينغ يبقى شلادمينغ
  // ولو وُضع في يوم فيينا.
  const cityOfPlace = (p) => {
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
  };

  // بطاقة المكان: من صف الجدول ومن دبوس الخريطة سواء — بابٌ واحد لا بابان،
  // واليوم والفترة داخلها لا بجوارها.
  const openPlaceCard = (p) => {
    const daySel = el("select.menu", {},
      el("option", { value: "-1" }, t("غير موزع")),
      days.map((d, i) => el("option", { value: String(i),
        ...(p.day === i ? { selected: true } : {}) }, fmtDay(d))));
    if (p.day >= 0) daySel.value = String(p.day);
    const slotSel = el("select.menu", {},
      el("option", { value: "" }, "—"),
      SLOTS.map(([v, ar]) => el("option", { value: v,
        ...(p.slot === v ? { selected: true } : {}) }, tt(ar))));
    // النقل يُغلق نافذته: من نقل مكانًا ليومٍ آخر انتهى شغله بها، ولا تبقى
    // نافذةٌ معلّقة فوق جدولٍ أُعيد رسمه.
    const shut = () => { document.querySelector(".detback")?.remove();
      document.querySelector(".detcard")?.remove(); };
    daySel.onchange = () => { p.day = +daySel.value; shut(); save(); render(); };
    slotSel.onchange = () => { p.slot = slotSel.value; shut(); save(); render(); };
    const ctl = el("div.detctl", {},
      el("label", {}, el("span", {}, t("اليوم")), daySel),
      el("label", {}, el("span", {}, t("الفترة")), slotSel));
    const rec = regOf(p.qid);
    const a = rec || { name_en: clean(p.en), kind: clean(p.kind),
      where: clean(p.detail), pending: !p.qid, added_count: p.count || 0 };
    openDetails([{ a, label: p.name, city: cityOfPlace(p) }], 0, () => {
      trip.plan = trip.plan.filter(x => x.id !== p.id); save(); render();
    }, ctl);
  };
  mapOpen.place = openPlaceCard;
  mapOpen.cityOf = (a) => cityOfPlace({ lat: a.lat, lon: a.lon, day: -1 });

  const placeRow = (p) => {
    // مربع بأيقونة نوعه كصف الفندق — الصورة تعيش في بطاقات الاختيار،
    // والجدول يُقرأ بالرمز فيهدأ ويتسع (طلب طارق).
    const thumb = el("div.rowthumb.kindth", {},
      activityIcon(p.name + " " + (p.en || ""), p.kind, p.icon));
    // تحت الاسم: مدينة المكان — في رحلة بمدينتين هذا ما يحتاجه القارئ،
    // ونوع الفعالية تقوله الأيقونة.
    const placeCity = cityOfPlace(p);
    // نفس بنية صف الحدث (ختم وقت فارغ ثم المربع) — المربعات على خط واحد.
    const row = el("div.trow.prow", { style: "cursor:pointer",
      onclick: (ev) => {
        if (ev.target.closest("select,button,a")) return;
        openPlaceCard(p);
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
          // إغلاق أسبوعي وقع في يومه: تنبيه ظاهر لا سطر رمادي — زيارةٌ
          // مغلقة تُفسد اليوم كله، فالأولى أن تُرى قبل السفر لا عنده.
          (p.day >= 0 && days[p.day] && closedWeekly(p, days[p.day]))
            ? el("div.shut", {}, closedWhy(p, days[p.day])
                || tt`مغلق يوم ${ISO_DAYS_AR[(days[p.day].getDay() || 7) - 1]} — انقله ليوم آخر`)
            : null)));
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
    // زمن القيادة يُقاس من فندق **مرحلة المكان**، لا من فندق أول يوم: مكانٌ
    // في فيينا قيس من فندق شلادمينغ يأخذ مئتي دقيقة، فيُحسب «بعيدًا»، فيُخفَّف
    // يومه، ويُطبع للمستخدم رقمٌ دقيق المظهر مقيسٌ من فندقٍ غادره. والقياس
    // يُحفظ مع معرّف فندقه، فإن تغيّر السكن أو المراحل أُعيد الحساب.
    const stayForPlace = (p) => {
      const legs = legsOf(trip);
      if (!legs.length) return stayForDay(trip, trip.start || "");
      let best = null, bd = Infinity;
      for (const l of legs){
        const c = store.cities.find(x => x.id === l.cityId);
        if (!c || c.lat == null) continue;
        const d = (p.lat || p.lon) ? kmAB(p, c) : Infinity;
        if (d < bd){ bd = d; best = l; }
      }
      const day = best?.from || trip.start || "";
      return stayForDay(trip, day);
    };
    let changed = false;
    for (const p of trip.plan){
      if (!(p.lat || p.lon) || p.roadM >= 800) continue;
      const st = stayForPlace(p);
      if (!st) continue;
      if (p.driveFromStayMin != null && p.driveFrom === st.id) continue;
      const r = await osrm([[st.lat, st.lon], [p.lat, p.lon]]).catch(() => null);
      p.driveFromStayMin = r ? r.min : 0;
      p.driveFrom = st.id;
      changed = true;
    }
    // زمن القيادة إلى المدن القريبة — يُقاس مرة ويُحفظ، فيصير العنوان
    // «هالشتات · ٧٤ د قيادة» بدل مسافة هوائية.
    for (const n of nearby.slice(0, 8)){
      const k = "near:" + n.city.id;
      if (trip.dayStats[k]) continue;
      const b0 = bases.reduce((acc, b) =>
        (acc && kmAB(n.city, acc) <= kmAB(n.city, b)) ? acc : b, null);
      if (!b0) continue;
      const r = await osrm([[b0.lat, b0.lon], [n.city.lat, n.city.lon]]).catch(() => null);
      if (r){ trip.dayStats[k] = { km: Math.round(r.km), min: r.min }; changed = true; }
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
      // بلا فندقٍ ليومه لا حلقة تُقاس — وكان هنا رجوعٌ إلى `st0` لا وجود له
      // فيرمي المتصفح ويسقط القياس كله عن رحلةٍ لم يُسجَّل سكنها بعد.
      const st = stayForDay(trip, ymd(dd[i]));
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
        // قرار طارق ٢٠٢٦-٠٨-٣١: بيان حساب الساعة **يبقى** تحت أحداث
        // الفندق والمطار. سطور التعليل تحت الأماكن حُذفت لأنها تشرح قرارًا،
        // وهذا يشرح رقمًا يظهر على الشاشة لم يكتبه المستخدم ولا الفندق.
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
