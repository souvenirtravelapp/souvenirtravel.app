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
  const caps = days.map((d, i) => {
    if (days.length === 1) return 3;
    if (i === 0 || i === days.length - 1) return 1;
    return 3;
  });
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
    chain.push(rest.shift());
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
    const slots = ["morning", "afternoon", "evening"];
    if (days.length > 1 && i === 0) slots.splice(0, 2);            // الوصول: مساء فقط
    if (days.length > 1 && i === days.length - 1) slots.splice(1); // العودة: صباح فقط
    const taken = new Set();
    // المطاعم والمقاهي تحجز المساء أولًا.
    for (const p of group){
      if (FOOD_KINDS.includes(p.kind) && slots.includes("evening") && !taken.has("evening")){
        p.day = i; p.slot = "evening"; taken.add("evening");
      }
    }
    let ci = 0;
    for (const p of group){
      if (p.day === i && p.slot) continue;
      const free = slots.find(x => !taken.has(x));
      p.day = i; p.slot = free || slots[ci % slots.length] || "";
      if (free) taken.add(free); ci++;
    }
  });
  // ما فاض عن سعة الأيام يعود للسلة بوضوح.
  chain.slice(cursor).forEach(p => { p.day = -1; p.slot = ""; });
  return true;
}

let nominatimTimer = null;
async function searchPlaces(q){
  const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
    q, format: "json", limit: "6", "accept-language": isEN ? "en" : "ar" });
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
  const save = () => Trips.update(tripId, trip);

  const city = trip.cityId ? store.cities.find(c => c.id === trip.cityId) : null;
  root.append(el("div.hero3", {},
    el("div.herorow", {},
      el("h1", {}, t`خطة رحلتك${city ? tt(" إلى ") + cityName(city) : ""}`),
      el("a.circle", { href: "#/trips" }, "‹")),
    el("p", {}, (trip.start || "") + (trip.end ? " ← " + trip.end : ""))));

  const inner = el("div.section");
  root.append(inner);

  // ── بطاقة الصدق: ما لا يضمنه أي ذكاء مولِّد — تأشيرة مراجَعة من مصدر
  //    رسمي، طقس أرقام حقيقية، طيران متحقق منه. تركب أعلى كل خطة. ──
  if (city){
    const facts = el("div.rows");
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
      const origin = (ctx.prefs && ctx.filter)
        ? (ctx.prefs.departures(ctx.filter.origin).find(i => store.route(i, city.id))
           || ctx.filter.origin || null) : null;
      if (origin){
        const r = store.route(origin, city.id);
        const o = store.origin(origin);
        const oname = o ? o.city_ar : origin;
        facts.append(el("div.row", {}, el("span.who", {},
          "✈️ " + (r && store.flightVerified(origin, city.id, m)
            ? tt`طيران مباشر من ${oname} — متحقق منه لهذا الشهر`
            : r ? tt`طيران مباشر من ${oname} — تحقق بالبحث`
                : tt`لا رحلة مباشرة مسجلة من ${oname} — ستبدّل طائرة`))));
      }
    }
    inner.append(el("div.card", { style: "margin-bottom:14px" },
      el("h2", { style: "margin-bottom:6px" }, t("حقائق رحلتك")),
      facts,
      el("div.det", { style: "margin-top:6px" },
        t("من مصادر رسمية وأرقام حقيقية — لا تخمين. القواعد تتغير، تحقق قبل السفر."))));
  }

  // رحلة بلا تواريخ بعد (جاءت من زر الصدر) — الخانة الأولى: متى؟
  if (!trip.start){
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
    regBox.append(el(chosen ? "button.pick.sel" : "button.pick", { onclick: () => {
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
    regBox.append(el("button.pick.sel", { onclick: () => {
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
      const hits = await searchPlaces(q).catch(() => []);
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
      mark: p.day >= 0 ? String(p.day + 1) : "•", grn: p.day >= 0 });
  }
  for (const a of reg){
    if (seenQ.has(a.qid) || !(a.lat || a.lon)) continue;
    pins.push({ lat: a.lat, lon: a.lon,
      name: (isEN ? (a.name_en || a.name_ar) : (a.name_ar || a.name_en)),
      mark: "•", grn: false });
  }
  if (pins.length && window.L){
    const mapBox = el("div.findmap", { style: "height:300px;margin-top:6px" });
    inner.append(el("div.section", { style: "margin-bottom:14px" },
      el("h2", {}, t("خريطة الرحلة")), mapBox));
    setTimeout(() => {
      const m = L.map(mapBox).setView([pins[0].lat, pins[0].lon], 9);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "© OpenStreetMap" }).addTo(m);
      const g = L.featureGroup(pins.map(p =>
        L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "pmark-wrap",
          html: `<div class="pmark${p.grn ? " grn" : ""}">${p.mark}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13] }) })
          .bindTooltip(p.name))).addTo(m);
      m.fitBounds(g.getBounds().pad(0.25));
    }, 0);
  }

  // ── وزّع الآن — بعد الاختيار لا قبله: يختار ثم يوزع، هذا منطق الإجراء ──
  if (trip.start){
    const hasPlaces = trip.plan.length > 0;
    inner.append(el("div.card", { style: "margin-bottom:14px" },
      el("h2", { style: "margin-bottom:6px" }, t("خطط لي أيامي")),
      el("p.det", { style: "margin-bottom:10px" },
        hasPlaces
          ? t("سوفينير يوزع ما اخترته على الأيام: القريب مع القريب، والمطاعم مساءً، ويوما السفر خفيفان. عدّل بعدها ما شئت.")
          : t("لم تختر أماكن بعد؟ نبدأ لك بأكثر ما اختاره المسافرون، ونوزعها على أيامك. عدّل بعدها ما شئت.")),
      el("button.btn", { onclick: () => {
        if (autoPlan(trip, daysOf(trip), city, store)){ save(); render(); }
      } }, t("وزّع الآن"))));
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
    daySel.onchange = () => { p.day = +daySel.value; save(); render(); };
    slotSel.onchange = () => { p.slot = slotSel.value; save(); render(); };
    return el("div", { style: "display:flex;align-items:center;gap:8px;padding:6px 0" },
      el("div", { style: "flex:1;min-width:0" },
        el("div.t", { style: "font-weight:700;font-size:14.5px" }, p.name),
        (p.kind || p.count)
          ? el("div.s", { style: "font-size:11.5px;color:var(--muted)" },
              [p.kind, p.count > 0 ? tt`اختارها ${p.count}` : null]
                .filter(Boolean).join(" · "))
          : null),
      daySel, slotSel,
      el("button.out", { onclick: () => {
        trip.plan = trip.plan.filter(x => x.id !== p.id); save(); render();
      } }, "✕"));
  };

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
    const dayCell = el("td.dt-day", { rowspan: String(nrows) },
      el("div.dd", {}, fmtDay(d)),
      (days.length > 1 && i === 0)
        ? el("div.dm", {}, "✈︎ " + tt("يوم الوصول")) : null,
      (days.length > 1 && i === days.length - 1)
        ? el("div.dm", {}, "✈︎ " + tt("يوم العودة")) : null,
      route);
    const body = el("tbody");
    SLOTS.forEach(([v, ar], si) => {
      const slotPlaces = dayPlaces.filter(p => p.slot === v);
      body.append(el("tr", {},
        si === 0 ? dayCell : null,
        el("td.dt-slot", {}, tt(ar)),
        el("td.dt-acts", {},
          slotPlaces.length
            ? slotPlaces.map(placeRow)
            : el("div.det", { style: "opacity:.4" }, "—"))));
    });
    if (unslotted.length)
      body.append(el("tr", {},
        el("td.dt-slot", {}, "—"),
        el("td.dt-acts", {}, unslotted.map(placeRow))));
    inner.append(el("table.daytbl", {}, body));
  });

  return root;
}
