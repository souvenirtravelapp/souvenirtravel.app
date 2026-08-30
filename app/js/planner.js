// مخطط الرحلة على الويب — من جدول طارق النمساوي: اليوم ثلاث خانات لا ساعات،
// سلة تجمع قبل التوزيع، رابط خرائط واحد لليوم، والفراغ محترم.
// «أضف مكانًا» يقتل حلقة الاسم←الخرائط←الجدول: Nominatim يحدد ونحن نرتب.
import { t, t as tt, isEN } from "/app/js/i18n.js";
import { el, cityName, MONTHS_AR, RAIN_AR } from "/app/js/ui.js";
import { Trips } from "/app/js/trips-store.js";
import { visaLine } from "/app/js/views.js";

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
  if (i === 0){
    const arr = hm(trip.flights?.out?.arr);
    if (arr == null) return ["evening"];
    return all.filter(v => arr + 1 <= SLOT_WIN[v][1] - 1);
  }
  if (i === nDays - 1){
    const dep = hm(trip.flights?.back?.dep);
    if (dep == null) return ["morning"];
    return all.filter(v => SLOT_WIN[v][1] <= dep - 2);
  }
  return all;
}
// لكل يوم لونه — في الجدول وعلى دبابيس الخريطة سواء.
const DAYC = ["#B4622E", "#1F8F7C", "#3A6EA5", "#8E5BA6", "#C2903B",
              "#4C8A4C", "#A5486B", "#556B2F", "#20808D", "#7A5C3E"];
const dayColor = (i) => DAYC[i % DAYC.length];

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
        kind: a.kind || "", count: a.added_count || 0, day: -1, slot: "" });
      tallyPick(a.qid);
    }
    pool = trip.plan.slice();
  }
  if (!pool.length) return false;
  // سلسلة أقرب جار (من لديه إحداثيات)، والبقية في الذيل.
  const located = pool.filter(p => p.lat || p.lon);
  const blind = pool.filter(p => !(p.lat || p.lon));
  const chain = [];
  if (located.length){
    const rest = located.slice();
    // إن حُدد سكن، تبدأ السلسلة بأقرب مكان إليه — اليوم يبدأ من الباب.
    let s0 = 0;
    const st = (trip.stays || [])[0];
    if (st){
      let bd = Infinity;
      rest.forEach((p, i) => {
        const dd = (p.lat - st.lat) ** 2 + (p.lon - st.lon) ** 2;
        if (dd < bd){ bd = dd; s0 = i; }
      });
    }
    chain.push(rest.splice(s0, 1)[0]);
    while (rest.length){
      const last = chain[chain.length - 1];
      let bi = 0, bd = Infinity;
      rest.forEach((p, i) => {
        const dd = (p.lat - last.lat) ** 2 + (p.lon - last.lon) ** 2;
        if (dd < bd){ bd = dd; bi = i; }
      });
      chain.push(rest.splice(bi, 1)[0]);
    }
  }
  chain.push(...blind);
  // التعليل: كل مكان يحمل سبب موضعه — الشفافية تقنع أكثر من السحر.
  chain.forEach((p, k) => {
    if (k === 0){
      p.why = (trip.stays || [])[0]
        ? t("الأقرب إلى سكنك — بها يبدأ اليوم")
        : t("نقطة انطلاق المسار");
    } else {
      const q = chain[k - 1];
      if ((p.lat || p.lon) && (q.lat || q.lon)){
        const dk = Math.round(111 * Math.hypot(p.lat - q.lat,
          (p.lon - q.lon) * Math.cos(p.lat * Math.PI / 180)));
        p.why = dk < 1 ? tt`قريبة جدًا من ${q.name}`
                       : tt`قريبة من ${q.name} (~${dk} كم)`;
      } else p.why = "";
    }
  });
  // حصص الأيام: الأيام الكاملة أولًا، ثم يوما السفر إن فاض شيء.
  const quota = caps.map(() => 0);
  const fillOrder = [];
  for (let i = 1; i < days.length - 1; i++) fillOrder.push(i);
  if (days.length > 1){ fillOrder.push(0, days.length - 1); }
  else fillOrder.push(0);
  let left = Math.min(chain.length, total);
  while (left > 0){
    let moved = false;
    for (const i of fillOrder){
      if (left > 0 && quota[i] < caps[i]){ quota[i]++; left--; moved = true; }
    }
    if (!moved) break;
  }
  // فاض الاختيار عن السعة؟ الأيام الكاملة تتسع — كما اتسع بعدُ ظهرِ جدوله لفعاليتين.
  let over = chain.length - total;
  if (over > 0){
    const fulls = fillOrder.filter(i => caps[i] >= 3);
    const tgt = fulls.length ? fulls : fillOrder;
    let j = 0;
    while (over > 0){ quota[tgt[j % tgt.length]]++; j++; over--; }
  }
  // توزيع السلسلة بترتيب الأيام الزمني — التتابع يحفظ الجغرافيا لليوم الواحد.
  let cursor = 0;
  days.forEach((d, i) => {
    const group = chain.slice(cursor, cursor + quota[i]);
    cursor += quota[i];
    const slots = allowedSlots(trip, i, days.length).slice();
    const taken = new Set();
    // المطاعم والمقاهي تحجز المساء أولًا.
    for (const p of group){
      if (FOOD_KINDS.includes(p.kind) && slots.includes("evening") && !taken.has("evening")){
        p.day = i; p.slot = "evening"; taken.add("evening");
        p.why = [p.why, tt("المطاعم والمقاهي مساءً")].filter(Boolean).join(" · ");
      }
    }
    let ci = 0;
    for (const p of group){
      if (p.day === i && p.slot) continue;
      const free = slots.find(x => !taken.has(x));
      p.day = i; p.slot = free || slots[ci % slots.length] || "";
      if (free) taken.add(free); ci++;
    }
    if (days.length > 1 && (i === 0 || i === days.length - 1)){
      const why = i === 0 ? tt("بعد وصولك") : tt("قبل إقلاعك");
      for (const p of group)
        p.why = [p.why, why].filter(Boolean).join(" · ");
    }
  });
  // ما فاض عن سعة الأيام يعود للسلة بوضوح.
  chain.slice(cursor).forEach(p => { p.day = -1; p.slot = ""; });
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
    p.why = t("أُضيفت للأقرب من أيامها مسارًا");
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
  trip.flights = trip.flights || { out: {}, back: {} };
  trip.stays = trip.stays || [];
  const save = () => Trips.update(tripId, trip);

  const city = trip.cityId ? store.cities.find(c => c.id === trip.cityId) : null;
  root.append(el("div.hero3", {},
    el("div.herorow", {},
      el("h1", {}, t`خطة رحلتك${city ? tt(" إلى ") + cityName(city) : ""}`),
      el("a.circle", { href: "#/trips" }, "‹"))));

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
            if (j.ok){ f.dep = j.dep; f.arr = j.arr; save(); render(); return; }
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

    // السكن — فندق أو أكثر (قد يسكن في أكثر من موقع)، يُلتقط بالبحث ويظهر على الخريطة.
    const stayIn = el("input", { placeholder: t("اكتب اسم فندقك أو شقتك…"),
      style: "flex:1;min-width:180px" });
    const stayRes = el("div");
    let stayTimer = null;
    stayIn.oninput = () => {
      clearTimeout(stayTimer);
      const q = stayIn.value.trim(); stayRes.replaceChildren();
      if (q.length < 3) return;
      stayTimer = setTimeout(async () => {
        const hits = await searchPlaces(q, city, true).catch(() => []);
        stayRes.replaceChildren();
        for (const h of hits.slice(0, 5)){
          stayRes.append(el("button.srow", { style: "width:100%;text-align:start",
            onclick: () => {
              trip.stays.push({ id: "s" + Date.now(), name: h.display_name.split(",")[0],
                lat: +h.lat, lon: +h.lon,
                from: trip.start || "", to: trip.end || "" });
              save(); render();
            } },
            el("div", {},
              el("div.t", {}, h.display_name.split(",")[0]),
              el("div.s", {}, h.display_name.split(",").slice(1, 3).join("،")))));
        }
      }, 400);
    };
    facts.append(el("div.row", { style: "flex-wrap:wrap;gap:6px;align-items:center" },
      el("span.who", {}, "🏨 " + tt("السكن")), stayIn), stayRes);
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
  const reg = city ? (store.attractions?.[city.id] || []).slice(0, 20) : [];
  const regQids = new Set(reg.map(a => a.qid));
  const regBox = el("div.pickrow", { style: "margin-top:4px" });
  for (const a of reg){
    const label = (isEN ? (a.name_en || a.name_ar) : (a.name_ar || a.name_en));
    const chosen = planOf(a.qid);
    regBox.append(el(chosen
      ? (chosen.day >= 0 ? "button.pick.sel" : "button.pick.sel.pend")
      : "button.pick", { onclick: () => {
      if (chosen){
        trip.plan = trip.plan.filter(p => p.qid !== a.qid);
      } else {
        trip.plan.push({ id: "p" + Date.now() + Math.random().toString(36).slice(2, 6),
          name: label, qid: a.qid, lat: a.lat || 0, lon: a.lon || 0,
          kind: a.kind || "", count: a.added_count || 0, day: -1, slot: "" });
        tallyPick(a.qid);
      }
      save(); render();
    } },
      (a.source && a.source !== "wikidata")
        ? el("div.aramp.sm", {}, (label || "؟").trim()[0])
        : el("img", { src: "attractions/" + a.qid + ".jpg", alt: label,
            loading: "lazy" }),
      el("div.pn", {}, label),
      el("div.pc", {},
        a.added_count > 0 ? tt`اختارها ${a.added_count}` : "+")));
  }
  // ما جاء من البحث الحر بطاقة مختارة هو الآخر — والضغط عليها يلغيه.
  for (const p of trip.plan){
    if (p.qid && regQids.has(p.qid)) continue;
    regBox.append(el(p.day >= 0 ? "button.pick.sel" : "button.pick.sel.pend",
      { onclick: () => {
      trip.plan = trip.plan.filter(x => x.id !== p.id); save(); render();
    } },
      el("div.aramp.sm", {}, (p.name || "؟").trim()[0]),
      el("div.pn", {}, p.name),
      el("div.pc", {}, p.kind || "‏")));
  }
  const input = el("input", { placeholder: t("اكتب اسم مكان — زحليقة، مقهى، بحيرة…"),
    style: "flex:1;min-width:0" });
  addBox.append(
    el("h2", { style: "margin-bottom:8px" }, t("معالم وفعاليات مقترحة")),
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
  if (pins.length && window.L){
    const mapBox = el("div.findmap", { style: "margin-top:6px" });
    const fullBtn = el("button.mapfullbtn", { "aria-label": t("تكبير الخريطة"),
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
    mapSec = el("div.section.mapsec", {}, fullBtn, mapBox);
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
      m.fitBounds(g.getBounds().pad(0.25));
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
        const ok = (pend && scheduled)
          ? placePending(trip, dd2)
          : autoPlan(trip, dd2, city, store);
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
    const thumb = (p.qid && /^Q/.test(p.qid))
      ? el("img.rowthumb", { src: "attractions/" + p.qid + ".jpg", alt: "",
          loading: "lazy" })
      : el("div.rowthumb.ar", {}, (p.name || "؟").trim()[0]);
    // الجدول يقول اليوم والفترة — لا داعي لتكرارهما على كل صف (طلب طارق).
    // الأدوات تختبئ، وضغطة على الصف تكشفها لمن أراد النقل أو الحذف.
    const tools = el("div", { style: "display:none;gap:6px;align-items:center;"
      + "margin-top:6px" },
      daySel, slotSel,
      el("button.out", { onclick: (ev) => {
        ev.stopPropagation();
        trip.plan = trip.plan.filter(x => x.id !== p.id); save(); render();
      } }, "✕"));
    const row = el("div", { style: "padding:6px 0;cursor:pointer",
      onclick: (ev) => {
        if (ev.target.closest("select,button")) return;
        tools.style.display = tools.style.display === "none" ? "flex" : "none";
      } },
      el("div", { style: "display:flex;align-items:center;gap:8px" },
        thumb,
        el("div", { style: "flex:1;min-width:0" },
          el("div.t", { style: "font-weight:700;font-size:14.5px" }, p.name),
          (p.kind || p.count)
            ? el("div.s", { style: "font-size:11.5px;color:var(--muted)" },
                [p.kind, p.count > 0 ? tt`اختارها ${p.count}` : null]
                  .filter(Boolean).join(" · "))
            : null,
          p.why ? el("div.s", { style:
              "font-size:11px;color:var(--muted);opacity:.85;margin-top:1px" },
              "↳ " + p.why) : null)),
      tools);
    return row;
  };

  const tablesBox = el("div");

  // ── الأيام على هيئة جدول طارق الأصلي: اليوم | الفترة | الفعاليات ──
  days.forEach((d, i) => {
    const dayPlaces = trip.plan.filter(p => p.day === i);
    const withPos = SLOTS.flatMap(([v]) => dayPlaces.filter(p => p.slot === v))
      .concat(dayPlaces.filter(p => !p.slot))
      .filter(p => p.lat || p.lon);
    let route = null;
    if (withPos.length){
      // المسار من أول مكان في اليوم — لا من موقع القارئ الحالي أينما كان.
      const coords = withPos.map(p => p.lat + "," + p.lon);
      route = el("a", { target: "_blank", rel: "noopener",
        href: coords.length > 1
          ? "https://www.google.com/maps/dir/?api=1&origin=" + coords[0]
            + "&destination=" + coords[coords.length - 1]
            + (coords.length > 2
                ? "&waypoints=" + encodeURIComponent(coords.slice(1, -1).join("|")) : "")
          : "https://www.google.com/maps/search/?api=1&query=" + coords[0],
        style: "font-size:12.5px" }, t("خط السير ›"));
    }
    const unslotted = dayPlaces.filter(p => !p.slot);
    const nrows = SLOTS.length + (unslotted.length ? 1 : 0);
    const fo = trip.flights.out, fb = trip.flights.back;
    const dstr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
      + "-" + String(d.getDate()).padStart(2, "0");
    const dayCell = el("td.dt-day", { rowspan: String(nrows) },
      el("div.dn", {}, tt`يوم ${i + 1}`),
      el("div.dd", {}, fmtDay(d)),
      (days.length > 1 && i === 0)
        ? el("div.dm", {}, "✈︎ " + (fo.no || tt("يوم الوصول"))
            + (fo.arr ? " — " + tt`الوصول ${fo.arr}` : "")) : null,
      (days.length > 1 && i === days.length - 1)
        ? el("div.dm", {}, "✈︎ " + (fb.no || tt("يوم العودة"))
            + (fb.dep ? " — " + tt`الإقلاع ${fb.dep}` : "")) : null,
      ...trip.stays.filter(st => st.from === dstr).map(st =>
        el("div.dm", {}, "🏨 " + tt`دخول ${st.name}`)),
      ...trip.stays.filter(st => st.to === dstr).map(st =>
        el("div.dm", {}, "🏨 " + tt`خروج ${st.name}`)),
      route);
    const ok = allowedSlots(trip, i, days.length);
    const body = el("tbody");
    SLOTS.forEach(([v, ar], si) => {
      const slotPlaces = dayPlaces.filter(p => p.slot === v);
      body.append(el("tr", {},
        si === 0 ? dayCell : null,
        el("td.dt-slot", {}, tt(ar)),
        el("td.dt-acts", {},
          slotPlaces.length
            ? slotPlaces.map(placeRow)
            : el("div.det", { style: "opacity:.4" },
                ok.includes(v) ? "—" : "✈︎ " + tt("سفر")))));
    });
    if (unslotted.length)
      body.append(el("tr", {},
        el("td.dt-slot", {}, "—"),
        el("td.dt-acts", {}, unslotted.map(placeRow))));
    tablesBox.append(el("table.daytbl", { style: "--dc:" + dayColor(i) }, body));
  });

  // ── الجدول يمينًا والخريطة يسارًا — وعلى الجوال تنطوي الخريطة تحت الجدول ──
  if (mapSec){
    inner.append(el("div.plansplit", {}, tablesBox,
      el("div.mapside", {}, mapSec)));
  } else {
    inner.append(tablesBox);
  }

  return root;
}
