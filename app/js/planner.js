// مخطط الرحلة على الويب — من جدول طارق النمساوي: اليوم ثلاث خانات لا ساعات،
// سلة تجمع قبل التوزيع، رابط خرائط واحد لليوم، والفراغ محترم.
// «أضف مكانًا» يقتل حلقة الاسم←الخرائط←الجدول: Nominatim يحدد ونحن نرتب.
import { t, t as tt, isEN } from "/app/js/i18n.js";
import { el, cityName } from "/app/js/ui.js";
import { Trips } from "/app/js/trips-store.js";

const SLOTS = [
  ["morning", "صباحًا"],
  ["afternoon", "ظهرًا"],
  ["evening", "مساءً"],
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

  // ── أضف مكانًا: بحث حر يحدد الموقع، أو انتقاء من سجل سوفينير ──
  const addBox = el("div.card", { style: "margin-bottom:14px" });
  const input = el("input", { placeholder: t("اكتب اسم مكان — زحليقة، مقهى، بحيرة…"),
    style: "width:100%" });
  const results = el("div");
  addBox.append(el("h2", { style: "margin-bottom:8px" }, t("أضف مكانًا")), input, results);
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

  // من سجل سوفينير: معالم وفعاليات مدينة الرحلة، بعدّاد من اختاروها.
  if (city){
    const reg = (store.attractions?.[city.id] || []).slice(0, 12)
      .filter(a => !trip.plan.some(p => p.qid === a.qid));
    if (reg.length){
      const regBox = el("div.chips", { style: "margin-top:10px" });
      for (const a of reg){
        const label = (isEN ? (a.name_en || a.name_ar) : (a.name_ar || a.name_en));
        regBox.append(el("button.chip", { onclick: () => {
          trip.plan.push({ id: "p" + Date.now() + Math.random().toString(36).slice(2, 6),
            name: label, qid: a.qid, lat: a.lat || 0, lon: a.lon || 0,
            kind: a.kind || "", day: -1, slot: "" });
          save(); render();
        } }, "+ " + label
          + (a.added_count > 0 ? " · " + a.added_count : "")));
      }
      addBox.append(el("div.det", { style: "margin:10px 0 6px" },
        t("من سوفينير:")), regBox);
    }
  }
  inner.append(addBox);

  const days = daysOf(trip);
  const basket = trip.plan.filter(p => p.day < 0 || p.day >= days.length);

  const placeRow = (p) => {
    const daySel = el("select.menu", {},
      el("option", { value: "-1" }, t("السلة")),
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
        p.kind ? el("div.s", { style: "font-size:11.5px;color:var(--muted)" }, p.kind) : null),
      daySel, slotSel,
      el("button.out", { onclick: () => {
        trip.plan = trip.plan.filter(x => x.id !== p.id); save(); render();
      } }, "✕"));
  };

  if (basket.length){
    const b = el("div.card");
    for (const p of basket) b.append(placeRow(p));
    inner.append(el("div.section", {},
      el("h2", {}, t("سلة الرحلة")), b,
      el("div.det", {}, t("أماكن حفظتها، تنتظر يومها."))));
  }

  // ── الأيام: ثلاث خانات، ويوما السفر صفان مميزان، ورابط مسار لليوم ──
  days.forEach((d, i) => {
    const dayPlaces = trip.plan.filter(p => p.day === i);
    const sec = el("div.card", { style: "margin-bottom:10px" });
    const head = el("div", { style: "display:flex;align-items:baseline;gap:8px" },
      el("h2", { style: "flex:1" }, fmtDay(d)));
    const withPos = SLOTS.flatMap(([v]) => dayPlaces.filter(p => p.slot === v))
      .concat(dayPlaces.filter(p => !p.slot))
      .filter(p => p.lat || p.lon);
    if (withPos.length){
      const coords = withPos.map(p => p.lat + "," + p.lon);
      const dest = coords[coords.length - 1];
      const wp = coords.slice(0, -1).join("|");
      head.append(el("a", { target: "_blank", rel: "noopener",
        href: "https://www.google.com/maps/dir/?api=1&destination=" + dest
          + (wp ? "&waypoints=" + encodeURIComponent(wp) : ""),
        style: "font-size:13px" }, t("خط السير ›")));
    }
    sec.append(head);
    if (i === 0) sec.append(el("div.det", {}, "✈︎ " + tt("يوم الوصول")));
    if (i === days.length - 1 && days.length > 1)
      sec.append(el("div.det", {}, "✈︎ " + tt("يوم العودة")));
    for (const [v, ar] of SLOTS){
      const slotPlaces = dayPlaces.filter(p => p.slot === v);
      sec.append(el("div", { style: "margin-top:8px" },
        el("div", { style: "font-size:12px;font-weight:700;color:var(--accent)" }, tt(ar)),
        slotPlaces.length
          ? el("div", {}, slotPlaces.map(placeRow))
          : el("div.det", { style: "opacity:.5" }, "—")));
    }
    const unslotted = dayPlaces.filter(p => !p.slot);
    if (unslotted.length)
      sec.append(el("div", { style: "margin-top:8px" }, unslotted.map(placeRow)));
    inner.append(sec);
  });

  // ── خريطة الرحلة: كل الدبابيس — القرار الذي كان بالعين يُرى بنظرة ──
  const pinned = trip.plan.filter(p => p.lat || p.lon);
  if (pinned.length && window.L){
    const mapBox = el("div.findmap", { style: "height:300px;margin-top:6px" });
    inner.append(el("div.section", {}, el("h2", {}, t("خريطة الرحلة")), mapBox));
    setTimeout(() => {
      const m = L.map(mapBox).setView([pinned[0].lat, pinned[0].lon], 9);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "© OpenStreetMap" }).addTo(m);
      const g = L.featureGroup(pinned.map(p =>
        L.marker([p.lat, p.lon]).bindTooltip(p.name))).addTo(m);
      m.fitBounds(g.getBounds().pad(0.25));
    }, 0);
  }

  return root;
}
