// Souvenir's screens, translated for the web. Each view mirrors its iOS
// sibling and speaks only to the ported logic modules; where the two
// platforms must differ, the reason is written at the spot.
import { el, flag, cityName, countryName, kiwiLink,
         MONTHS_AR, WARMTH_AR, RAIN_AR, REQUIREMENT_AR, PASSPORT_AR } from "./ui.js";
import { FREE_REQUIREMENTS, VISA_GROUPS } from "./store.js";
import { RAIN_WANTED, nextRainWanted, DESTINATION_TAGS } from "./filter.js";
import { plan } from "./ideas.js";
import { hasExpired } from "./papers.js";
import { Trips } from "./trips-store.js";
import { render } from "./app.js";

const goto = h => { location.hash = h; };

const TAG_AR = { nature: "الطبيعة", history: "التاريخ", sea: "البحر", mountain: "الجبال" };
const RAIN_WANTED_AR = { any: "أي أمطار", some: "مطر خفيف+", moderate: "مطر متوسط+", heavy: "مطر غزير" };
const GROUP_AR = { no_visa: "بلا تأشيرة", permit: "تصريح/عند الوصول", embassy: "تأشيرة سفارة" };

function warmthWord(store, t){ return WARMTH_AR[store.warmthBand(t)]; }
function rainWordOf(store, mm){
  return { none: RAIN_AR.r0, light: RAIN_AR.r1, moderate: RAIN_AR.r2, heavy: RAIN_AR.r3 }[store.rainLevel(mm)];
}

function paperLabel(store, doc){
  const kind = doc.kind === "residency" ? "إقامة" : "تأشيرة";
  const who = doc.bloc === "schengen" ? "شنغن"
            : (store.passportCountryName(doc.countryCode) || doc.countryCode);
  return kind + " " + who;
}

// The entry line: the ruling for the stated passport, softened by papers —
// mirrors the app's entryLine.
function visaLine(ctx, city){
  const { store, filter, papers } = ctx;
  if (!filter.passport) return null;
  const v = store.visa(city, filter.passport);
  if (!v) return null;
  if (FREE_REQUIREMENTS.includes(v.requirement))
    return REQUIREMENT_AR[v.requirement];
  const held = papers.documentsFor(city.country_code,
                                   store.blocs(city, filter.passport));
  if (held.length) return "لديك " + paperLabel(store, held[0]);
  return REQUIREMENT_AR[v.requirement] || REQUIREMENT_AR.unclear;
}

/* ── الرئيسية: الصفحة المتكاملة — بطل، شريط بحث موحد، أقسام أفقية ──── */
export function home(ctx){
  const { store, filter, prefs, shortlist, papers } = ctx;
  const root = el("div.wide");

  const guest = "إلى أين وجهتك القادمة؟";
  root.append(el("div.hero2", {},
    el("h1", {}, guest),
    el("p", {}, "خطط بالشهر والأجواء والتأشيرة والطيران المباشر — ثم احجز"),
    searchStrip(ctx)));

  const ideas = plan({ store, filter, prefs, shortlist, papers });

  // أكمل بحثك — آخر أسئلته، كما تفعل مواقع الحجز.
  const recent = JSON.parse(localStorage.getItem("sv.recent") ?? "[]");
  if (recent.length){
    const row = el("div.hcards");
    for (const r of recent.slice(0, 6)){
      const city = r.cityId ? store.cities.find(c => c.id === r.cityId) : null;
      row.append(el("div.hcard", { onclick: () => {
          if (r.month) filter.month = r.month;
          goto(city ? "#/d/" + city.id : "#/find");
        } },
        el("div.cover", { style: city ? coverStyle(city) : "background:linear-gradient(135deg,var(--band1),var(--band2))" },
          city ? flag(city.country_code) : "⌕"),
        el("div.body", {},
          el("div.n", {}, city ? cityName(city) : (r.q || "بحث")),
          el("div.c", {}, r.month ? MONTHS_AR[r.month - 1] : ""))));
    }
    root.append(section("أكمل بحثك", row));
  }

  // الاقتراحات الشهرية — القواعد الست نفسها.
  for (const month of Object.keys(ideas)){
    const list = ideas[month];
    if (!list.length) continue;
    const row = el("div.hcards");
    for (const { city } of list) row.append(bigCard(ctx, city, +month));
    root.append(section("وجهات مقترحة — " + MONTHS_AR[month - 1], row));
  }

  // بلا تأشيرة لجوازك هذا الشهر — القسم الذي يبيع.
  if (filter.passport){
    const free = store.cities.filter(c => {
      const v = store.visa(c, filter.passport);
      const t = store.temps(c, filter.month);
      return v && FREE_REQUIREMENTS.includes(v.requirement)
          && t && store.warmthBand(t.t_max_avg_c) === "mild";
    }).slice(0, 10);
    if (free.length){
      const row = el("div.hcards");
      for (const c of free) row.append(bigCard(ctx, c, filter.month));
      root.append(section("بلا تأشيرة لجوازك — معتدلة في " + MONTHS_AR[filter.month - 1], row));
    }
  }

  if (prefs.isEmpty){
    root.append(el("div.nudge", {},
      el("a", { href: "#/prefs" }, "أضف تفضيلاتك لتحسين الاقتراحات ›")));
  }

  const upcoming = Trips.upcoming();
  if (upcoming.length){
    const row = el("div.hcards");
    for (const t of upcoming.slice(0, 6)){
      row.append(el("div.hcard", {},
        el("div.cover", { style: "background:linear-gradient(135deg,var(--deep),#8A4520)" }, "✈︎"),
        el("div.body", {}, el("div.n", {}, t.title),
          el("div.c", {}, (t.start || "") + (t.end ? " → " + t.end : "")))));
    }
    root.append(section("رحلاتك القادمة", row));
  }

  return root;
}

function section(title, inner){
  return el("div.section", {}, el("h2", {}, title), inner);
}

// The unified strip: destination · month · passport · origin · search — one
// bordered band, the page's single most important object.
export function searchStrip(ctx, compact = false){
  const { store, filter } = ctx;
  const q = el("input", { placeholder: "إلى أين؟ اكتب وجهة أو دولة…",
    value: filter.query || "" });
  const month = el("select", {},
    MONTHS_AR.map((m, i) => {
      const o = el("option", { value: i + 1 }, m);
      if (filter.month === i + 1) o.selected = true;
      return o;
    }));
  const pass = el("select", {},
    el("option", { value: "" }, "جوازك؟"),
    store.passports().map(cc => {
      const o = el("option", { value: cc }, "جواز " + (PASSPORT_AR[cc] || cc));
      if (filter.passport === cc) o.selected = true;
      return o;
    }));
  const origin = el("select", {},
    el("option", { value: "" }, "من أين تطير؟"),
    store.originCountries().flatMap(cc => store.originsIn(cc).map(o2 => {
      const o = el("option", { value: o2.iata }, o2.city_ar + " — " + o2.iata);
      if (filter.origin === o2.iata) o.selected = true;
      return o;
    })));
  const go = el("button.go", { onclick: () => {
    filter.query = q.value;
    filter.month = +month.value;
    filter.passport = pass.value || null;
    filter.origin = origin.value;
    if (origin.value){
      const oc = store.origin(origin.value);
      if (oc) filter.originCountry = oc.country_code;
    }
    const recent = JSON.parse(localStorage.getItem("sv.recent") ?? "[]");
    const hit = filter.matches(store)[0];
    recent.unshift({ q: q.value, month: filter.month,
                     cityId: q.value && hit ? hit.id : null });
    localStorage.setItem("sv.recent", JSON.stringify(recent.slice(0, 6)));
    goto("#/find");
    render();
  } }, "ابحث");
  return el("div.strip" + (compact ? ".compact" : ""), {},
    el("div.f.grow", {}, "🔎", q),
    el("div.f", {}, "🗓", month),
    el("div.f", {}, "🪪", pass),
    el("div.f", {}, "🛫", origin),
    go);
}

// A Booking-style vertical card: cover on top, facts under it.
function bigCard(ctx, city, month){
  const { store } = ctx;
  const t = store.temps(city, month);
  const visa = visaLine(ctx, city);
  return el("div.hcard", { onclick: () => goto("#/d/" + city.id) },
    el("div.cover", { style: coverStyle(city) }, flag(city.country_code)),
    el("div.body", {},
      el("div.n", {}, cityName(city)),
      el("div.c", {}, countryName(city)),
      t ? el("div.t", {}, `${MONTHS_AR[month - 1]} · ${Math.round(t.t_max_avg_c)}° ${warmthWord(store, t.t_max_avg_c)}`) : null,
      visa ? el("div.v", {}, visa) : null));
}

/* ── فلتر الوجهات ──────────────────────────────────────────────────── */
// The app's arrangement, not a chip wall: labelled rows, and a MENU wherever
// the app opens a menu — the month, the origin country then its airport, the
// passport. Chips only where the app uses chips: weather, visa ease, papers.
export function finder(ctx){
  const { store, filter, shortlist, papers: docs } = ctx;
  const root = el("div");
  root.append(el("div.top", {},
    el("h1", {}, "فلتر الوجهات"),
    el("a.circle", { href: "#/papers", title: "أوراقي" }, "🪪")));

  root.append(searchStrip(ctx, true));

  const adv = el("details.adv", { ...(filter.isFiltering ? { open: true } : {}) },
    el("summary", {}, "فلاتر متقدمة"));
  const rows = el("div.frows");
  adv.append(rows);

  // المطار — دولة ثم مطار، قائمتان متتاليتان.
  // The passports' name table lacks one's own country (it is nobody's
  // destination), so country names come from the cities the reader sees.
  const countryAr = cc =>
    store.cities.find(c => c.country_code === cc)?.country_name_ar
      || store.passportCountryName(cc) || cc;
  const countrySel = menu(
    [["", "اختر الدولة"]].concat(store.originCountries().map(cc =>
      [cc, countryAr(cc)])),
    filter.originCountry || "",
    v => { filter.originCountry = v || null;
           filter.origin = "";           // an airport dies with its country
           render(); });
  const airports = filter.originCountry ? store.originsIn(filter.originCountry) : [];
  const airportSel = menu(
    [["", "من أين تطير؟"]].concat(airports.map(o => [o.iata, o.city_ar + " — " + o.iata])),
    filter.origin || "",
    v => { filter.origin = v; render(); }, !filter.originCountry);
  const nonstop = chip("مباشر فقط", filter.nonstopOnly,
    () => { filter.nonstopOnly = !filter.nonstopOnly; render(); }, !filter.origin);
  rows.append(frow("المطار", countrySel, airportSel, nonstop));

  // الأجواء — رقائق كما في التطبيق، والمطر سلّم يصعد بالضغط.
  const weather = [chip(RAIN_WANTED_AR[filter.rain] || RAIN_WANTED_AR.any,
    filter.rain !== "any", () => { filter.rain = nextRainWanted(filter.rain); render(); })];
  for (const [k, ar] of Object.entries(WARMTH_AR)){
    weather.push(chip(ar, filter.bands.has(k), () => {
      const next = new Set(filter.bands);
      next.has(k) ? next.delete(k) : next.add(k);
      filter.bands = next; render();
    }));
  }
  rows.append(frow("الأجواء", scrollChips(el("div.chips", {}, weather))));

  // ما الذي يعجبك — الوسوم الأربعة.
  const tags = DESTINATION_TAGS.map(k => chip(TAG_AR[k] || k, filter.tags.has(k), () => {
    const next = new Set(filter.tags);
    next.has(k) ? next.delete(k) : next.add(k);
    filter.tags = next; render();
  }));
  rows.append(frow("النوع", scrollChips(el("div.chips", {}, tags))));

  // التأشيرة — الجواز قائمة، والمفردات رقائق خاملة بلا جواز.
  const passSel = menu(
    [["", "جوازك؟"]].concat(store.passports().map(cc => [cc, PASSPORT_AR[cc] || cc])),
    filter.passport || "",
    v => { filter.passport = v || null; render(); });
  const visaChips = VISA_GROUPS.map(g => chip(GROUP_AR[g], filter.visaGroups.has(g), () => {
    const next = new Set(filter.visaGroups);
    next.has(g) ? next.delete(g) : next.add(g);
    filter.visaGroups = next; render();
  }, !filter.passport));
  visaChips.push(chip("تأشيرة شنغن", filter.schengen,
    () => { filter.schengen = !filter.schengen; render(); }, !filter.passport));
  rows.append(frow("التأشيرة", passSel, scrollChips(el("div.chips", {}, visaChips))));

  // الأوراق — رقاقة لكل ورقة يحملها، كما يعرض التطبيق جواز أمريكا وشنغن.
  if (docs.documents.length){
    const paperChips = docs.documents.map(d => {
      const key = d.bloc ? "bloc:" + d.bloc : d.countryCode;
      return chip(paperLabel(store, d), filter.byDocument.has(key), () => {
        filter.byDocument.has(key) ? filter.byDocument.delete(key)
                                   : filter.byDocument.add(key);
        render();
      }, !filter.passport);
    });
    rows.append(frow("الأوراق", scrollChips(el("div.chips", {}, paperChips))));
  }

  root.append(adv);

  const count = el("div.sub");
  const lens = el("div.lens", {},
    lensBtn("خريطة", filter.presentation === "map",
      () => { filter.presentation = "map"; render(); }),
    lensBtn("قائمة", filter.presentation === "list",
      () => { filter.presentation = "list"; render(); }));
  root.append(el("div.countbar", {}, count, lens));

  const results = el("div");
  root.append(results);

  function redrawResults(){
    const list = filter.matches(store);
    count.textContent = list.length + (list.length >= 3 && list.length <= 10 ? " وجهات" : " وجهة");
    results.replaceChildren();
    if (filter.presentation === "map"){
      const holder = el("div.findmap");
      results.append(holder);
      drawMap(holder, list, city => goto("#/d/" + city.id));
      return;
    }
    for (const city of list.slice(0, 80)) results.append(destRow(ctx, city, redrawResults));
    if (list.length > 80)
      results.append(el("div.empty", {}, `و${list.length - 80} أخرى — ضيّق البحث`));
  }
  redrawResults();
  return root;
}

function lensBtn(label, on, onclick){
  return el("button.chip" + (on ? ".on" : ""), { onclick }, label);
}

// The finder's opening lens, like the app's: every result a pin. Leaflet
// over OpenStreetMap tiles, vendored — the page owes nothing to a CDN.
function drawMap(holder, list, open){
  queueMicrotask(() => {
    const L = window.L;
    if (!L){ holder.textContent = "الخريطة تُحمّل…"; setTimeout(() => drawMap(holder, list, open), 300); return; }
    const map = L.map(holder, { zoomControl: false, worldCopyJump: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 12, attribution: "© OpenStreetMap" }).addTo(map);
    const points = [];
    for (const c of list){
      if (c.lat == null) continue;
      points.push([c.lat, c.lon]);
      L.circleMarker([c.lat, c.lon], {
        radius: 6, weight: 2, color: "#B4622E",
        fillColor: "#E0A458", fillOpacity: .92 })
        .addTo(map)
        .bindTooltip(c.name_ar, { direction: "top" })
        .on("click", () => open(c));
    }
    if (points.length) map.fitBounds(points, { padding: [24, 24], maxZoom: 6 });
    else map.setView([24, 45], 3);
  });
}

function frow(label, ...controls){
  return el("div.filter-row", {},
    el("span.flabel", {}, label),
    el("div.fcontrols", {}, controls));
}

function menu(pairs, selected, onchange, disabled){
  const sel = el("select.menu", { onchange: e => onchange(e.target.value) },
    pairs.map(([v, label]) => {
      const o = el("option", { value: v }, label);
      if (String(v) === String(selected)) o.selected = true;
      return o;
    }));
  if (disabled){ sel.disabled = true; sel.style.opacity = ".45"; }
  return sel;
}

function chip(label, on, onclick, disabled){
  return el("button.chip" + (on ? ".on" : ""), {
    onclick, ...(disabled ? { style: "opacity:.4;pointer-events:none" } : {}) }, label);
}
function scrollChips(inner){
  const w = el("div", { style: "overflow-x:auto" }, inner);
  inner.style.flexWrap = "nowrap"; inner.style.width = "max-content";
  return w;
}

// Direction D: every cover is a piece of the aurora sky — one identity,
// the tag chips still say what kind of place it is.
function coverStyle(){
  return "background:var(--aurora)";
}

function destRow(ctx, city, redraw){
  const { store, filter, shortlist } = ctx;
  const month = filter.month;
  const t = store.temps(city, month);
  const kept = shortlist.keptMonth(city.id);
  const heart = el("button.heart" + (shortlist.contains(city.id) ? ".on" : ""), {
    onclick: e => { e.stopPropagation(); shortlist.toggle(city.id, month); redraw(); } },
    shortlist.contains(city.id) ? "♥" : "♡",
    kept ? el("span.kept", {}, MONTHS_AR[kept - 1]) : null);
  const badges = [];
  const visa = visaLine(ctx, city);
  if (visa) badges.push(el("span.badge" + (visa === "لا تتطلب تأشيرة" ? ".good" : ""), {}, visa));
  const from = ctx.prefs.departures(filter.origin).find(i => store.route(i, city.id));
  if (from){
    const r = store.route(from, city.id);
    badges.push(el("span.badge", {}, r.seasonal ? "مباشر موسميًا" : "طيران مباشر"));
  }
  if (t) badges.push(el("span.badge.w-" + store.warmthBand(t.t_max_avg_c), {},
                        warmthWord(store, t.t_max_avg_c)));
  return el("div.dest-row", { onclick: () => goto("#/d/" + city.id) },
    el("div.cover", { style: coverStyle(city) }, flag(city.country_code)),
    el("div.names", {},
      el("div.n", {}, cityName(city)),
      el("div.c", {}, countryName(city)),
      el("div.badges", {}, badges)),
    t ? el("div.temp", {},
      el("div.hi", {}, Math.round(t.t_max_avg_c) + "°"),
      el("div.lo", {}, Math.round(t.t_min_avg_c) + "°"),
      el("div.mo", {}, MONTHS_AR[month - 1])) : null,
    heart);
}

/* ── صفحة الوجهة ───────────────────────────────────────────────────── */
export function destination(ctx, cityId){
  const { store, filter, prefs, shortlist, papers } = ctx;
  const city = store.cities.find(c => c.id === cityId);
  if (!city) return el("div.empty", {}, "وجهة غير معروفة");
  const month = filter.month;

  const root = el("div");
  root.append(el("a.back", { href: "#/find" }, "‹ كل الوجهات"));

  const heart = el("button.heart" + (shortlist.contains(city.id) ? ".on" : ""), {
    onclick: () => { shortlist.toggle(city.id, month); render(); } },
    shortlist.contains(city.id) ? "♥" : "♡");
  root.append(el("div.band", {},
    heart,
    el("h1", {}, flag(city.country_code) + " " + cityName(city)),
    el("div.c", {}, countryName(city))));

  if (city.advisory){
    root.append(el("div.card", { style: "border-color:var(--accent);margin-bottom:12px" },
      "⚠️ " + city.advisory));
  }

  // The whole year, opening on the chosen month — the reader who asked about
  // October should not be greeted by January.
  const strip = el("div.months");
  for (let m = 1; m <= 12; m++){
    const t = store.temps(city, m);
    if (!t) continue;
    const cell = el("div.m" + (m === month ? ".sel" : ""), {
      onclick: () => { filter.month = m; render(); } },
      el("div.mo", {}, MONTHS_AR[m - 1]),
      el("div.hi", {}, Math.round(t.t_max_avg_c) + "°"),
      el("div.mu", {}, Math.round(t.t_min_avg_c) + "°"),
      el("div.rain", {}, rainWordOf(store, t.p_mm_avg)));
    strip.append(cell);
  }
  root.append(el("div.section", {},
    el("h2", {}, "متوسط الحرارة والأمطار لكل شهر:"), strip));
  queueMicrotask(() => {
    const sel = strip.querySelector(".sel");
    if (sel) sel.scrollIntoView({ inline: "center", block: "nearest" });
  });

  // The visa, in the app's arrangement: my passport, the ruling, my papers.
  const passportSel = el("select", {
    onchange: e => { filter.passport = e.target.value || null; render(); } },
    el("option", { value: "" }, "اختر جوازك"),
    store.passports().map(cc => {
      const o = el("option", { value: cc }, PASSPORT_AR[cc] || cc);
      if (filter.passport === cc) o.selected = true;
      return o;
    }));
  const v = filter.passport ? store.visa(city, filter.passport) : null;
  const held = filter.passport
    ? papers.documentsFor(city.country_code, store.blocs(city, filter.passport)) : [];
  root.append(el("div.section", {}, el("h2", {}, "التأشيرة المطلوبة:"),
    el("div.card", {},
      el("div", {}, "جوازي: ", passportSel),
      v ? el("div", { style: "font-size:19px;font-weight:800;margin:4px 0" },
            REQUIREMENT_AR[v.requirement] || REQUIREMENT_AR.unclear,
            v.allowed_stay_days && v.requirement !== "unclear"
              ? el("span", { style: "font-size:13px;font-weight:400;color:var(--muted)" },
                  ` · الإقامة حتى ${v.allowed_stay_days} يومًا`) : null)
        : el("div.sub", {}, "اختر جوازًا لترى الحكم"),
      held.length ? el("div", { style: "font-size:14px;color:var(--visited)" },
        "لديك " + paperLabel(store, held[0])
        + (hasExpired(held[0]) ? " — منتهية!" : "")) : null,
      el("div", { style: "font-size:12px;color:var(--muted)" },
        "القواعد تتغير — تحقق من الجهة الرسمية."),
      el("a", { href: "#/papers", style: "font-size:13px" }, "أوراقي ›"))));

  // Nonstop flights from the reader's airport, tails and all.
  const origin = prefs.departures(filter.origin).find(i => store.route(i, city.id))
              || filter.origin || null;
  if (origin){
    const r = store.route(origin, city.id);
    const o = store.origin(origin);
    const inner = el("div.rows");
    if (r){
      inner.append(el("div.row", {},
        el("span.who", {}, (r.seasonal ? "مباشر موسميًا" : "مباشر") + " من " + (o ? o.city_ar : origin)),
        el("span.meta", {}, r.airlines.slice(0, 3).map(name =>
          el("span", { style: "margin-inline-start:8px" }, name, el("span.tail", {}, name[0]))))));
    } else if (store.hasRoutes(origin)){
      inner.append(el("div.row", {}, el("span.who", {},
        "لا رحلة مباشرة مسجلة من " + (o ? o.city_ar : origin) + " — ستبدّل طائرة")));
    }
    root.append(el("div.section", {}, el("h2", {}, "الرحلات المباشرة:"),
      el("div.card", {}, inner)));
  }

  const near = store.nearestAirport(city);
  if (near){
    const a = near.airport || near;
    const km = near.distanceKm ?? near.distance_km ?? near.km;
    root.append(el("div.section", {}, el("h2", {}, "أقرب مطار:"),
      el("div.card", {},
        el("bdi", { dir: "ltr" }, `${a.name_en} (${a.iata})`),
        ` — على بعد ${Math.round(km)} كم`)));

    // The handoff. This page IS the website — the allowed channel.
    const from = origin || "RUH";
    root.append(el("div.section", {},
      el("a.book", { rel: "nofollow sponsored", target: "_blank",
        href: kiwiLink(from, a.iata, `webapp_${city.id.replace("city-", "")}_${from}`) },
        "ابحث عن طيران " + MONTHS_AR[month - 1]),
      el("div.disclose", {}, "رابط شريك — الأسعار والحجز لدى الموقع الشريك.")));
  }
  return root;
}

/* ── تفضيلات السفر ─────────────────────────────────────────────────── */
export function prefs(ctx){
  const { store, prefs } = ctx;
  const root = el("div");
  root.append(el("div.top", {}, el("h1", {}, "تفضيلات السفر"),
    el("a.circle", { href: "#/home" }, "‹")));
  root.append(el("div.sub", {},
    "تُحفظ على جهازك وتوجّه الاقتراحات — المعلن يسبق المستنتج."));

  const secTags = el("div.chips");
  for (const k of DESTINATION_TAGS){
    secTags.append(chip(TAG_AR[k] || k, prefs.tags.has(k),
      () => { prefs.toggleTag(k); render(); }));
  }
  const secBands = el("div.chips");
  for (const [k, ar] of Object.entries(WARMTH_AR)){
    if (k === "hot") continue;              // the app never courts hot
    secBands.append(chip(ar, prefs.bands.has(k),
      () => { prefs.toggleBand(k); render(); }));
  }
  const secRain = el("div.chips");
  const RAIN_KEYS = { none: RAIN_AR.r0, light: RAIN_AR.r1, moderate: RAIN_AR.r2, heavy: RAIN_AR.r3 };
  for (const [k, ar] of Object.entries(RAIN_KEYS)){
    secRain.append(chip(ar, prefs.rain.has(k),
      () => { prefs.toggleRain(k); render(); }));
  }
  const secAir = el("div.chips");
  for (const cc of store.originCountries()){
    for (const o of store.originsIn(cc)){
      const on = prefs.airports.has(o.iata);
      secAir.append(chip(o.city_ar + " " + o.iata, on,
        () => { on ? prefs.removeAirport(o.iata) : prefs.addAirport(o.iata); render(); }));
    }
  }
  root.append(
    el("div.section", {}, el("h2", {}, "ما الذي يعجبك؟"), secTags),
    el("div.section", {}, el("h2", {}, "الأجواء"), secBands),
    el("div.section", {}, el("h2", {}, "الأمطار"), secRain),
    el("div.section", {}, el("h2", {}, "مطارات انطلاقك"), scrollChips(secAir)));
  return root;
}

/* ── أوراقي ────────────────────────────────────────────────────────── */
export function papers(ctx){
  const { store, papers } = ctx;
  const root = el("div");
  root.append(el("div.top", {}, el("h1", {}, "أوراقي"),
    el("a.circle", { href: "#/find" }, "‹")));
  root.append(el("div.sub", {},
    "تأشيراتك وإقاماتك، تدخلها بنفسك وتبقى على جهازك — قراءة الوثائق بالكاميرا ميزة تطبيق iOS."));

  const list = el("div.section");
  for (const d of papers.documents){
    list.append(el("div.card", { style: "margin-bottom:8px" },
      el("b", {}, paperLabel(store, d)),
      d.expiry ? ` — تنتهي ${d.expiry}` : "",
      hasExpired(d) ? el("b", { style: "color:var(--hot)" }, " · منتهية") : "",
      el("button", { style: "float:left;color:var(--deep)",
        onclick: () => { papers.remove(d); render(); } }, "حذف")));
  }
  if (!papers.documents.length) list.append(el("div.empty", {}, "لا أوراق بعد"));
  root.append(list);

  const kind = el("select", {},
    el("option", { value: "visa" }, "تأشيرة"),
    el("option", { value: "residency" }, "إقامة"));
  const seen = new Set();
  const countryOptions = [el("option", { value: "" }, "الدولة / المنطقة"),
    el("option", { value: "bloc:schengen" }, "شنغن (المنطقة)")];
  for (const c of [...ctx.store.cities].sort((a, b) =>
        a.country_name_ar.localeCompare(b.country_name_ar, "ar"))){
    if (seen.has(c.country_code)) continue;
    seen.add(c.country_code);
    countryOptions.push(el("option", { value: c.country_code }, c.country_name_ar));
  }
  const country = el("select", {}, countryOptions);
  const expiry = el("input", { type: "date" });
  root.append(el("div.section", {}, el("h2", {}, "أضف ورقة"),
    el("div.frow", {}, kind, country, expiry),
    el("button.btn", { onclick: () => {
      if (!country.value) return;
      const doc = country.value.startsWith("bloc:")
        ? { kind: kind.value, countryCode: "", bloc: country.value.slice(5),
            expiry: expiry.value || null }
        : { kind: kind.value, countryCode: country.value, expiry: expiry.value || null };
      papers.save(doc);
      render();
    } }, "أضف")));
  return root;
}

/* ── رحلاتك (القادمة فقط — الماضي يعيش في التطبيق) ─────────────────── */
export function trips(ctx){
  const root = el("div");
  root.append(el("div.top", {}, el("h1", {}, "رحلاتك القادمة")));
  root.append(el("div.sub", {},
    "رحلاتك الماضية وصورها تعيش في تطبيق iOS — هنا تخطط القادم."));

  const list = el("div.section");
  for (const t of Trips.all()){
    list.append(el("div.card", { style: "margin-bottom:8px" },
      el("b", {}, t.title), " — ", t.start || "؟", t.end ? " إلى " + t.end : "",
      el("button", { style: "float:left;color:var(--deep)",
        onclick: () => { Trips.remove(t.id); render(); } }, "حذف")));
  }
  if (!Trips.all().length)
    list.append(el("div.empty", {}, "لا رحلات قادمة بعد — ابدأ من الفلتر"));
  root.append(list);

  const title = el("input", { placeholder: "الوجهة أو عنوان الرحلة" });
  const start = el("input", { type: "date" });
  const end = el("input", { type: "date" });
  root.append(el("div.section", {}, el("h2", {}, "أضف رحلة قادمة"),
    el("div.frow", {}, title, start, end),
    el("button.btn", { onclick: () => {
      if (!title.value.trim()) return;
      Trips.add({ title: title.value.trim(), start: start.value || null,
                  end: end.value || null });
      render();
    } }, "أضف")));
  return root;
}
