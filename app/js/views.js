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
import { Memory } from "./memory-store.js";
import { render, askSignIn } from "./app.js";
import * as cloud from "./cloud.js";
import { COVERS } from "./covers.js";
import { t, t as tt } from "/app/js/i18n.js";
import { isEN } from "/app/js/i18n.js";
const aName = (a) => isEN ? (a.name_en || a.name_ar) : (a.name_ar || a.name_en);
const aBlurb = (a) => isEN ? (a.blurb_en || "") : (a.blurb || "");
const cName = (c) => isEN ? (c.country_name_en || c.country_name_ar) : (c.country_name_ar || c.country_name_en);

const goto = h => { location.hash = h; };

const TAG_AR = { nature: t("الطبيعة"), history: t("التاريخ"), sea: t("البحر"), mountain: t("الجبال") };
const RAIN_WANTED_AR = { any: t("لا يهم"), some: t("مطر خفيف+"), moderate: t("مطر متوسط+"), heavy: t("مطر غزير") };
const GROUP_AR = { no_visa: t("بلا تأشيرة"), permit: t("تصريح/عند الوصول"), embassy: t("تأشيرة سفارة") };

function warmthWord(store, t){ return WARMTH_AR[store.warmthBand(t)]; }
function rainWordOf(store, mm){
  return { none: RAIN_AR.r0, light: RAIN_AR.r1, moderate: RAIN_AR.r2, heavy: RAIN_AR.r3 }[store.rainLevel(mm)];
}

function paperLabel(store, doc){
  const kind = doc.kind === "residency" ? t("إقامة") : t("تأشيرة");
  const who = doc.bloc === "schengen" ? t("شنغن")
            : (store.passportCountryName(doc.countryCode) || doc.countryCode);
  return kind + " " + who;
}

// The entry line: the ruling for the stated passport, softened by papers —
// mirrors the app's entryLine.
export function visaLine(ctx, city){
  const { store, filter, papers } = ctx;
  if (!filter.passport) return null;
  const v = store.visa(city, filter.passport);
  if (!v) return null;
  if (FREE_REQUIREMENTS.includes(v.requirement))
    return REQUIREMENT_AR[v.requirement];
  const held = papers.documentsFor(city.country_code,
                                   store.blocs(city, filter.passport));
  if (held.length) return t`لديك ${paperLabel(store, held[0])}`;
  return REQUIREMENT_AR[v.requirement] || REQUIREMENT_AR.unclear;
}

/* ── الرئيسية: بوابة لا صفحة بحث — بطل بسؤالَي الجميع (الوجهة والشهر)،
   ثم مقترحات تُغني الضيف، ثم شريط ذاكرة رشيق. الفلتر الكامل يعيش مرة
   واحدة في «وجهاتك القادمة» — قرار طارق: ميلٌ نحو بوكينج بلا نسخه. */
export function home(ctx){
  const { store, filter, prefs, shortlist, papers } = ctx;
  const root = el("div.wide");

  // عصب الموقع لا يُخبأ: تحت الشريط صف يكشف أدوات الفلتر نفسها،
  // وكل رقاقة تهبط بصاحبها على بندها هي داخل «وجهاتك القادمة».
  const facet = (icon, label, target) => el("button.chip", {
    style: "background:rgba(255,255,255,.14);color:#fff;border-color:rgba(255,255,255,.35)",
    onclick: () => { sessionStorage.setItem("sv.facet", target || label);
                     goto("#/next"); } }, ficon(icon), label);
  root.append(el("div.hero2", {},
    el("h1", {}, t("إلى أين وجهتك القادمة؟")),
    el("p", {}, t("خطط بالشهر والأجواء والتأشيرة والطيران المباشر — ثم احجز")),
    searchStrip(ctx),
    el("div.chips", { style: "margin-top:12px;justify-content:center" },
      facet("weather", t("الأجواء")),
      facet("rain", t("الأمطار")),
      facet("visa", t("التأشيرة")),
      facet("airport", t("طيران مباشر"), t("المطار")),
      el("button.chip", {
        style: "background:#fff;color:var(--deep);font-weight:800",
        onclick: () => goto("#/next") }, t("الفلتر الكامل ›")))));

  const ideas = plan({ store, filter, prefs, shortlist, papers });

  // الاقتراحات الشهرية — القواعد الست نفسها، بقالب نتائج بوكينج العريض.
  for (const month of Object.keys(ideas)){
    const list = ideas[month];
    if (!list.length) continue;
    const row = el("div");
    for (const { city } of list) row.append(destRow(ctx, city, render, +month));
    root.append(shelf(t`وجهات مقترحة لك لشهر ${MONTHS_AR[month - 1]}`, row));
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
      const row = el("div");
      for (const c of free) row.append(destRow(ctx, c, render));
      root.append(shelf(t`بلا تأشيرة لجوازك — معتدلة في ${MONTHS_AR[filter.month - 1]}`, row));
    }
  }

  if (prefs.isEmpty){
    root.append(el("div.nudge", {},
      el("a", { href: "#/prefs" }, t("أضف تفضيلاتك لتحسين الاقتراحات ›"))));
  }

  const upcoming = Trips.upcoming();
  if (upcoming.length){
    const row = el("div.hcards");
    for (const tr of upcoming.slice(0, 6)){
      // الرحلة تُسمّى باسم دولتها ومدنها هنا كما في «رحلاتك القادمة» — بطاقة
      // واحدة لا اسمين لها في شاشتين.
      const cs = tripCities(tr, ctx.store);
      const names = tripCountries(cs).join(" + ");
      row.append(el("div.hcard", { style: "cursor:pointer",
          onclick: () => goto("#/plan/" + tr.id) },
        el("div.cover", { style: cs[0] ? coverStyle(cs[0], null)
          : "background:linear-gradient(135deg,var(--deep),#8A4520)" },
          cs[0] ? flag(cs[0].country_code) : "✈︎"),
        el("div.body", {}, el("div.n", {}, names || tr.title),
          el("div.c", {}, [cs.map(cityName).join(" + "),
            (tr.start || "") + (tr.end ? " → " + tr.end : "")]
            .filter(Boolean).join(" · ")))));
    }
    root.append(section(t("رحلاتك القادمة"), row));
  }

  // شريط الذاكرة: القادمة تملك البطل، والسابقة سطرٌ متواضع أسفله —
  // تسلسل لا تزاحم، كما في رئيسية التطبيق نفسها.
  root.append(memoryBand(ctx));

  return root;
}

function memoryBand(ctx){
  if (!cloud.user){
    return el("div.section", {},
      el("h2", {}, t("رحلاتك السابقة")),
      el("div.card", { style: "display:flex;align-items:center;gap:14px;flex-wrap:wrap" },
        el("span", { style: "font-size:26px" }, "✈︎"),
        el("span", { style: "flex:1;min-width:200px" },
          t("ذكريات صنعتها لتبقى — سجّل لتحفظ رحلاتك وتجدها على كل أجهزتك.")),
        el("button.btn", { onclick: () =>
          askSignIn(t("ادخل بحسابك لتكون رحلاتك معك على كل أجهزتك.")) }, t("تسجيل الدخول"))));
  }
  const stats = Memory.stats;
  const goTrips = () => goto("#/trips");
  return el("div.section", {},
    el("h2", {}, t("رحلاتك السابقة")),
    el("div.memstats", {},
      statBox(stats.trips, t("الرحلات")),
      statBox(stats.places, t("الأماكن")),
      statBox(stats.countries, t("الدول"))),
    el("div", { style: "display:flex;gap:8px;margin-top:10px" },
      el("button.btn", { onclick: goTrips }, t("رحلاتك السابقة ›")),
      // زر الإضافة في الرئيسية إنقاذ لبيت فارغ لا روتين — قرار طارق:
      // يظهر ما دامت الرحلات صفرًا، فإذا امتلأ البيت سكن في صفحته.
      stats.trips === 0
        ? el("button.chip", { onclick: () => { memAdding = true; goTrips(); } },
            t("أضف رحلة سابقة"))
        : null));
}

function section(title, inner){
  return el("div.section", {}, el("h2", {}, title), inner);
}

// رف اقتراحات: عنوانه بخلفية رملية تفصله عن أسطر المدن تحته.
function shelf(title, inner){
  return el("div.section", {}, el("h2.shelfhead", {}, title), inner);
}

// شريط البطل: سؤالا الجميع — الوجهة والشهر — لا غير؛ زره يغوص في
// «وجهاتك القادمة» حيث الفلتر الكامل. النسخة المدمجة (داخل صفحة الفلتر)
// بلا شهر، فالشهر هناك في صندوقه.
export function searchStrip(ctx, compact = false){
  const { store, filter } = ctx;
  // الصندوق لا يسأل بل يَعِد: يخبر الكاتب بما سيناله من كتابته.
  const q = el("input", { placeholder:
    t("اكتب اسم الوجهة لترى طقسها والتأشيرة المطلوبة وباقي تفاصيلها…"),
    value: filter.query || "" });
  const month = el("select.menu", {},
    MONTHS_AR.map((m, i) => {
      const o = el("option", { value: i + 1 }, m);
      if (i + 1 === filter.month) o.selected = true;
      return o;
    }));
  // الجواز يُسأل عنه مرة واحدة: بعد أول اختيار يُحفظ ويختفي الحقل،
  // ويبقى تغييره من لوحة الإعدادات.
  const pass = filter.passport ? null : el("select", {},
    el("option", { value: "" }, t("جوازك؟")),
    store.passports().map(cc =>
      el("option", { value: cc }, t`جواز ${PASSPORT_AR[cc] || cc}`)));
  const go = el("button.go", { onclick: () => {
    filter.query = q.value;
    filter.month = +month.value;
    if (pass && pass.value) filter.passport = pass.value;
    if (compact) render(); else goto("#/next");
  } }, t("ابحث"));
  q.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); });
  // ترتيب طارق: الشهر أولًا، ثم كلمات البحث، ثم زر ابحث.
  return el("div.strip" + (compact ? ".compact" : ""), {},
    el("div.f", {}, ficon("month"), month),
    el("div.f.grow", {}, ficon("search"), q),
    pass ? el("div.f", {}, ficon("papers"), pass) : null,
    go);
}

// A Booking-style vertical card: cover on top, facts under it.
/* ── فلتر الوجهات ──────────────────────────────────────────────────── */
// The app's arrangement, not a chip wall: labelled rows, and a MENU wherever
// the app opens a menu — the month, the origin country then its airport, the
// passport. Chips only where the app uses chips: weather, visa ease, papers.
export function finder(ctx){
  // بطلٌ كأخيه في «رحلاتك السابقة»: العنوان وأزراره على سطر، ثم الوعد،
  // ثم شريط البحث داخل السماء — والفلتر تحته على أرض الصفحة.
  // القلب في الرأس كما في التطبيق — المفضلة بنت هذه الصفحة لا بابٌ رابع.
  const root = el("div.wide");
  root.append(el("div.hero2", {},
    el("h1", {}, t("وجهاتك القادمة")),
    el("p", {}, t("رشّح وجهتك بالشهر والأجواء والتأشيرة والطيران المباشر — والقلب يحفظها في مفضلتك.")),
    searchStrip(ctx, true)));
  const inner = el("div.section");
  root.append(inner);
  const fs = filterSection(ctx);
  inner.append(fs.controls, fs.results);
  // رقاقة الرئيسية أودعت مقصدها — الصندوق المطلوب يُزار ويومض مرحّبًا.
  const want = sessionStorage.getItem("sv.facet");
  if (want){
    sessionStorage.removeItem("sv.facet");
    queueMicrotask(() => {
      const box = [...root.querySelectorAll(".fbox")].find(b =>
        b.querySelector(".ftitle")?.textContent.includes(want));
      if (!box) return;
      box.scrollIntoView({ behavior: "smooth", block: "center" });
      box.style.transition = "box-shadow .4s";
      box.style.boxShadow = "0 0 0 3px var(--accent)";
      setTimeout(() => { box.style.boxShadow = ""; }, 1900);
    });
  }
  return root;
}

// The whole filter — advanced rows, the lens, the results — as one piece,
// so Home and the finder tab share a single truth.
export function filterSection(ctx, opts = {}){
  const { store, filter, shortlist, papers: docs } = ctx;
  const root = el("div.fsection");
  const rows = el("div.frows");
  root.append(el("div.adv", {}, rows));

  // المطار — دولة ثم مطار، قائمتان متتاليتان.
  // The passports' name table lacks one's own country (it is nobody's
  // destination), so country names come from the cities the reader sees.
  const countryAr = cc =>
    (x => x && cName(x))(store.cities.find(c => c.country_code === cc))
      || store.passportCountryName(cc) || cc;
  const countrySel = menu(
    [["", t("اختر الدولة")]].concat(store.originCountries().map(cc =>
      [cc, countryAr(cc)])),
    filter.originCountry || "",
    v => { filter.originCountry = v || null;
           filter.origin = "";           // an airport dies with its country
           render(); });
  const airports = filter.originCountry ? store.originsIn(filter.originCountry) : [];
  const airportSel = menu(
    [["", t("من أين تطير؟")]].concat(airports.map(o => [o.iata, o.city_ar + " — " + o.iata])),
    filter.origin || "",
    v => { filter.origin = v; render(); }, !filter.originCountry);
  const nonstop = chip(t("مباشر فقط"), filter.nonstopOnly,
    () => { filter.nonstopOnly = !filter.nonstopOnly; render(); }, !filter.origin);
  // الشهر سكن شريط البحث أعلاه — قرار طارق — فلا صندوق له هنا.
  rows.append(frow("airport", t("المطار"), countrySel, airportSel, nonstop));

  // الأجواء دفئًا في صف، والأمطار في صف خاص بها — طلب طارق.
  const warmth = Object.entries(WARMTH_AR).map(([k, ar]) =>
    chip(ar, filter.bands.has(k), () => {
      const next = new Set(filter.bands);
      next.has(k) ? next.delete(k) : next.add(k);
      filter.bands = next; render();
    }));
  rows.append(frow("weather", t("الأجواء"), scrollChips(el("div.chips", {}, warmth))));

  const rains = RAIN_WANTED.map(k => chip(RAIN_WANTED_AR[k], filter.rain === k,
    () => { filter.rain = filter.rain === k ? "any" : k; render(); },
    undefined, k !== "any"));
  rows.append(frow("rain", t("الأمطار"), scrollChips(el("div.chips", {}, rains))));

  // التفضيل خرج من الفلتر (قرار طارق) — الوسوم بقيت في التفضيلات توجّه
  // الاقتراحات؛ وأي وسوم مخزنة من قبل تُمسح كي لا تصفّي النتائج خفيةً.
  if (filter.tags.size) filter.tags = new Set();

  // التأشيرة — الجواز قائمة، والمفردات رقائق خاملة بلا جواز.
  const passSel = filter.passport ? null : menu(
    [["", t("جوازك؟")]].concat(store.passports().map(cc => [cc, PASSPORT_AR[cc] || cc])),
    "",
    v => { if (v) filter.passport = v; render(); });
  const visaChips = VISA_GROUPS.map(g => chip(GROUP_AR[g], filter.visaGroups.has(g), () => {
    const next = new Set(filter.visaGroups);
    next.has(g) ? next.delete(g) : next.add(g);
    filter.visaGroups = next; render();
  }, !filter.passport));
  visaChips.push(chip(t("تأشيرة شنغن"), filter.schengen,
    () => { filter.schengen = !filter.schengen; render(); }, !filter.passport));
  const visaBox = frow("visa", t("التأشيرة"),
    ...(passSel ? [passSel] : []),
    scrollChips(el("div.chips", {}, visaChips)));
  visaBox.classList.add("span");
  rows.append(visaBox);

  // أوراقي تُدار حيث تُستعمل — قرار طارق: الصندوق حاضر دائمًا، رقائقه
  // لمن يملك أوراقًا، ودعوة إضافة لمن لا يملك، ورابط الإدارة في طرفه.
  const paperChips = docs.documents.map(d => {
    const key = d.bloc ? "bloc:" + d.bloc : d.countryCode;
    return chip(paperLabel(store, d), filter.byDocument.has(key), () => {
      filter.byDocument.has(key) ? filter.byDocument.delete(key)
                                 : filter.byDocument.add(key);
      render();
    }, !filter.passport);
  });
  const manageLink = el("a", { href: "#/papers",
    style: "font-size:13px;white-space:nowrap;align-self:center;font-weight:700" },
    docs.documents.length ? t("إدارة أوراقي ›") : t("أضف أوراقك ›"));
  const paperBox = frow("papers", t("أوراقي"),
    docs.documents.length ? scrollChips(el("div.chips", {}, paperChips)) : null,
    manageLink);
  paperBox.classList.add("span");
  rows.append(paperBox);

  const resWrap = el("div.fresults");

  const lens = el("div.lens", {},
    lensBtn(t("خريطة"), filter.presentation === "map",
      () => { filter.presentation = "map"; render(); }),
    lensBtn(t("قائمة"), filter.presentation === "list",
      () => { filter.presentation = "list"; render(); }),
    // المفضلة نتائج سبق اختيارها — فموضعها بين عدسات عرض النتائج.
    lensBtn(t("♥ المفضلة"), filter.presentation === "fav",
      () => { filter.presentation = "fav"; render(); }));
  resWrap.append(el("div.countbar", {}, lens));

  const results = el("div");
  resWrap.append(results);

  function redrawResults(){
    const list = filter.matches(store);
    results.replaceChildren();
    if (filter.presentation === "fav"){
      if (!cloud.user){
        results.append(el("div.card", { style: "text-align:center;padding:26px 18px" },
          el("div", { style: "font-size:34px" }, "♡"),
          el("p", {}, t("المفضلة تحتاج حسابًا — ادخل لتبدأها، أو لتسترجعها من جهاز آخر.")),
          el("button.btn", { onclick: () =>
            askSignIn(t("ادخل بحسابك لتكون مفضلتك معك على كل أجهزتك.")) }, t("تسجيل الدخول"))));
        return;
      }
      const kept = [...shortlist.cityIDs]
        .map(id => store.cities.find(c => c.id === id)).filter(Boolean);
      if (!kept.length){
        results.append(el("div.empty", {}, t("لا مفضلة بعد — المس ♡ على أي وجهة لتبقى هنا.")));
        return;
      }
      for (const city of kept)
        results.append(destRow(ctx, city, redrawResults,
                               shortlist.keptMonth(city.id) || filter.month));
      return;
    }
    if (filter.presentation === "map"){
      const holder = el("div.findmap");
      results.append(holder);
      drawMap(holder, list, city => goto("#/d/" + city.id));
      return;
    }
    // «لم تجدها؟ اطلبها» — ما فُعل لطارق يدويًا صار زرًا لكل مسافر:
    // الطلب يصل خط التوسعة اليومي، والمكان يظهر لكل الناس حين يُضاف.
    if (!list.length && (filter.query || "").trim().length >= 2){
      const q = filter.query.trim();
      const ask = el("div.card", { style: "text-align:center;padding:26px 18px" },
        el("p", {}, t`لم نجد «${q}» بعد — سوفينير يتوسع كل يوم.`),
        el("button.btn", { onclick: async (e) => {
          e.target.disabled = true;
          try {
            await fetch("https://mcp.souvenirtravel.app/request-place", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ query: q, lang: document.documentElement.lang }) });
            ask.replaceChildren(el("p", {}, t("وصل طلبك — سنضيفها قريبًا إن شاء الله.")));
          } catch {
            e.target.disabled = false;
          }
        } }, t("اطلب إضافتها")));
      results.append(ask);
      return;
    }
    for (const city of list.slice(0, 80)) results.append(destRow(ctx, city, redrawResults));
    if (list.length > 80)
      results.append(el("div.empty", {}, t`و${list.length - 80} أخرى — ضيّق البحث`));
  }
  redrawResults();
  return { controls: root, results: resWrap };
}

function lensBtn(label, on, onclick){
  return el("button.chip" + (on ? ".on" : ""), { onclick }, label);
}

// The finder's opening lens, like the app's: every result a pin. Leaflet
// over OpenStreetMap tiles, vendored — the page owes nothing to a CDN.
function drawMap(holder, list, open){
  queueMicrotask(() => {
    const L = window.L;
    if (!L){ holder.textContent = t("الخريطة تُحمّل…"); setTimeout(() => drawMap(holder, list, open), 300); return; }
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

// أيقونات البنود: عائلة Material المصمتة — شكل واحد وروح واحدة، تُرسم
// بـcurrentColor فترث لون عنوانها أينما جلست (بني البند، أبيض البطل).
const FICONS = {
  hours: '<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm.01 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>',
  search: '<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>',
  month: '<path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/>',
  airport: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>',
  weather: '<path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/>',
  rain: '<path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z"/>',
  visa: '<path d="M20 6h-3V4c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-9-2h2v2h-2V4zM4 8h16v3h-3v-2h-2v2H9v-2H7v2H4V8zm0 11v-6h3v2h2v-2h6v2h2v-2h3v6H4z"/>',
  papers: '<path d="M20 7h-5V4c0-1.1-.9-2-2-2h-2c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM9 12c.83 0 1.5.67 1.5 1.5S9.83 15 9 15s-1.5-.67-1.5-1.5S8.17 12 9 12zm3 6H6v-.75c0-1 2-1.55 3-1.55s3 .55 3 1.55V18zm3-3h-2v-1.5h2V15zm3 0h-2v-1.5h2V15zm-3 3h-2v-1.5h2V18zm3 0h-2v-1.5h2V18zm-5-11h-2V4h2v3z"/>',
};

function ficon(name){
  const s = el("span.ficon");
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${FICONS[name]}</svg>`;
  return s;
}

function frow(iconName, label, ...controls){
  return el("div.fbox", {},
    el("div.ftitle", {}, ficon(iconName), label),
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

function chip(label, on, onclick, disabled, removable = true){
  return el("button.chip" + (on ? ".on" : ""), {
    onclick, ...(disabled ? { style: "opacity:.4;pointer-events:none" } : {}) },
    label, on && removable ? el("span.x", {}, "✕") : null);
}
function scrollChips(inner){
  const w = el("div", { style: "overflow-x:auto" }, inner);
  inner.style.flexWrap = "nowrap"; inner.style.width = "max-content";
  return w;
}

// الغلاف لا يُترك فارغًا: صورة المدينة إن وُجدت (منقاة بمراجعة وكيل)،
// وإلا تدرجٌ يُشتق من مناخها في الشهر المعروض — أزرق البرد، خضرة الاعتدال،
// ذهب الدفء، طين الحر — بزاوية تُبذر من هوية المدينة فلا يتطابق جاران.
const COVER_PALETTES = {
  cold: ["#23455C", "#4E7E9C"],
  mild: ["#1D5C50", "#3FA08B"],
  warm: ["#8A5A18", "#D8A548"],
  hot:  ["#8A3B1E", "#C96A3C"],
};
function coverStyle(city, band){
  if (city && COVERS.has(city.id))
    return `background:linear-gradient(rgba(20,30,28,.18),rgba(20,30,28,.30)),`
         + `url(covers/${city.id}.jpg) center/cover no-repeat`;
  const [a, b] = COVER_PALETTES[band] ?? COVER_PALETTES.mild;
  const seed = city ? [...city.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) : 0;
  return `background:linear-gradient(${100 + seed % 60}deg,${a},${b})`;
}

// طابع الحرف الأول — علامة مائية تملأ الغلاف المرسوم؛ الصورة تُغني عنه.
function coverStamp(city){
  if (!city || COVERS.has(city.id)) return null;
  return el("span.stamp", {}, (city.name_ar || t("؟")).trim()[0]);
}

function destRow(ctx, city, redraw, month = ctx.filter.month){
  const { store, filter, shortlist } = ctx;
  const t = store.temps(city, month);
  const kept = shortlist.keptMonth(city.id);
  const heart = el("button.heart" + (shortlist.contains(city.id) ? ".on" : ""), {
    onclick: e => {
      e.stopPropagation();
      if (!cloud.user){
        askSignIn(tt("المفضلة تعيش في حسابك لتجدها على كل أجهزتك — ادخل وسيُحفظ هذا القلب فورًا."),
          { type: "heart", cityId: city.id, month });
        return;
      }
      shortlist.toggle(city.id, month); redraw();
    } },
    shortlist.contains(city.id) ? "♥" : "♡");
  const keptPill = shortlist.contains(city.id) && kept
    ? el("span.keptpill", {}, MONTHS_AR[kept - 1]) : null;
  const badges = [];
  const visa = visaLine(ctx, city);
  if (visa) badges.push(el("span.badge" + (visa === tt("لا تتطلب تأشيرة") ? ".good" : ""), {}, visa));
  // الدرجة الوسطى: المُثبت شهريًا يُجزم به، والمسجل بلا دليل يحمل
  // علامة سؤال — لا وعد بلا سند، ولا صمت يخفي خطًا مسجلًا.
  const from = ctx.prefs.departures(filter.origin).find(i => store.route(i, city.id));
  if (from) badges.push(el("span.badge", {},
    store.flightVerified(from, city.id, month) ? tt("طيران مباشر") : tt("طيران مباشر؟")));
  if (t) badges.push(el("span.badge.w-" + store.warmthBand(t.t_max_avg_c), {},
                        warmthWord(store, t.t_max_avg_c)));
  // بطاقة أفقية بعرض الصفحة كما في بوكينج: صورة، تفاصيل، ثم الحرارة والزر.
  const band = t ? store.warmthBand(t.t_max_avg_c) : null;
  // العلم بجوار اسم دولته لا فوق الصورة — قرار طارق: الصورة للمدينة وحدها.
  return el("div.dest-row", { onclick: () => goto("#/d/" + city.id) },
    el("div.cover", { style: coverStyle(city, band) },
      coverStamp(city), heart, keptPill),
    el("div.names", {},
      el("div.n", {}, cityName(city)),
      el("div.c", {}, flag(city.country_code) + " " + countryName(city)),
      el("div.badges", {}, badges),
      t && t.p_mm_avg != null
        ? el("div.det", {}, rainWordOf(store, t.p_mm_avg) + " · " + MONTHS_AR[month - 1])
        : null),
    el("div.side", {},
      t ? el("div.temp", {},
        el("div.hi", {}, Math.round(t.t_max_avg_c) + "°"),
        el("div.lo", {}, tt`الصغرى ${Math.round(t.t_min_avg_c)}°`)) : el("div"),
      el("span.view", {}, tt("عرض الوجهة"))));
}

/* ── صفحة الوجهة ───────────────────────────────────────────────────── */
export function destination(ctx, cityId){
  const { store, filter, prefs, shortlist, papers } = ctx;
  const city = store.cities.find(c => c.id === cityId);
  if (!city) return el("div.empty", {}, t("وجهة غير معروفة"));
  const month = filter.month;

  const root = el("div");
  root.append(el("a.back", { href: "#/next" }, t("‹ كل الوجهات")));

  const heart = el("button.heart" + (shortlist.contains(city.id) ? ".on" : ""), {
    onclick: () => {
      if (!cloud.user){
        askSignIn(t("المفضلة تعيش في حسابك لتجدها على كل أجهزتك — ادخل وسيُحفظ هذا القلب فورًا."),
          { type: "heart", cityId: city.id, month });
        return;
      }
      shortlist.toggle(city.id, month); render();
    } },
    shortlist.contains(city.id) ? "♥" : "♡");
  root.append(el("div.band", {},
    heart,
    el("h1", {}, flag(city.country_code) + " " + cityName(city)),
    el("div.c", {}, countryName(city))));

  // «لدي رحلة قادمة لهذه المدينة» — باب التخطيط من صدر الصفحة (طارق 2026-08-30).
  root.append(el("button.btn", { style: "width:100%;margin-bottom:12px",
    onclick: () => {
      if (!cloud.user){
        askSignIn(t("خطط رحلتك ويحفظها حسابك على كل أجهزتك."),
          { type: "trip", cityId: city.id, title: cityName(city),
            start: null, end: null });
        return;
      }
      // مدينة في رحلة قائمة؟ افتحها. وإلا فاسأل: رحلة جديدة أم مرحلة فيها؟
      const ups = Trips.upcoming();
      const already = ups.find(x => x.cityId === city.id
        || (x.legs || []).some(l => l.cityId === city.id));
      if (already){ goto("#/plan/" + already.id); return; }
      const host = ups[0];
      if (host){
        const hostName = host.title || tt("رحلتك القادمة");
        if (confirm(tt`عندك رحلة إلى ${hostName}. أتضم ${cityName(city)} إليها كمرحلة؟`)){
          const legs = (host.legs && host.legs.length) ? host.legs.slice()
            : (host.cityId ? [{ cityId: host.cityId, from: host.start || "",
                                to: host.end || host.start || "" }] : []);
          // نفس قسمة المخطط: المدينة الجديدة تأخذ آخر ثلث الرحلة، والسابقة
          // تنتهي عندها — ثم تُعدَّل التواريخ من «مراحل الرحلة».
          const last = legs[legs.length - 1];
          let from = last?.to || host.start || "";
          let to = host.end || from;
          if (host.start && host.end && host.end > host.start){
            const d0 = new Date(host.start + "T00:00:00");
            const d1 = new Date(host.end + "T00:00:00");
            const n = Math.round((d1 - d0) / 86400000) + 1;
            if (n >= 3){
              const cut = new Date(d1);
              cut.setDate(cut.getDate() - Math.max(1, Math.round(n / 3)) + 1);
              from = cut.toISOString().slice(0, 10);
              to = host.end;
              if (last) last.to = from;
            }
          }
          legs.push({ cityId: city.id, from, to });
          Trips.update(host.id, { legs });
          goto("#/plan/" + host.id);
          return;
        }
      }
      const id = Trips.add({ title: cityName(city), cityId: city.id, start: null, end: null });
      goto("#/plan/" + id);
    } },
    t("لدي رحلة قادمة لهذه المدينة — ابدأ التخطيط لها")));

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
    el("h2", {}, t("متوسط الحرارة والأمطار لكل شهر:")), strip,
    el("div", { style: "font-size:11px;color:var(--muted);margin-top:6px" },
      t("بيانات الطقس: Open-Meteo.com (CC BY 4.0)"))));
  queueMicrotask(() => {
    const sel = strip.querySelector(".sel");
    if (sel) sel.scrollIntoView({ inline: "center", block: "nearest" });
  });

  // The visa, in the app's arrangement: my passport, the ruling, my papers.
  const passportSel = el("select", {
    onchange: e => { filter.passport = e.target.value || null; render(); } },
    el("option", { value: "" }, t("اختر جوازك")),
    store.passports().map(cc => {
      const o = el("option", { value: cc }, PASSPORT_AR[cc] || cc);
      if (filter.passport === cc) o.selected = true;
      return o;
    }));
  const v = filter.passport ? store.visa(city, filter.passport) : null;
  const held = filter.passport
    ? papers.documentsFor(city.country_code, store.blocs(city, filter.passport)) : [];
  root.append(el("div.section", {}, el("h2", {}, t("التأشيرة المطلوبة:")),
    el("div.card", {},
      el("div", {}, t("جوازي: "), passportSel),
      v ? el("div", { style: "font-size:19px;font-weight:800;margin:4px 0" },
            REQUIREMENT_AR[v.requirement] || REQUIREMENT_AR.unclear,
            v.allowed_stay_days && v.requirement !== "unclear"
              ? el("span", { style: "font-size:13px;font-weight:400;color:var(--muted)" },
                  t` · الإقامة حتى ${v.allowed_stay_days} يومًا`) : null)
        : el("div.sub", {}, t("اختر جوازًا لترى الحكم")),
      held.length ? el("div", { style: "font-size:14px;color:var(--visited)" },
        t`لديك ${paperLabel(store, held[0])}`
        + (hasExpired(held[0]) ? t(" — منتهية!") : "")) : null,
      el("div", { style: "font-size:12px;color:var(--muted)" },
        t("القواعد تتغير — تحقق من الجهة الرسمية.")),
      el("a", { href: "#/papers", style: "font-size:13px" }, t("أوراقي ›")))));

  // Nonstop flights from the reader's airport, tails and all.
  const origin = prefs.departures(filter.origin).find(i => store.route(i, city.id))
              || filter.origin || null;
  if (origin){
    const r = store.route(origin, city.id);
    const verified = r && store.flightVerified(origin, city.id, month);
    const o = store.origin(origin);
    const inner = el("div.rows");
    if (verified){
      inner.append(el("div.row", {},
        el("span.who", {}, t`طيران مباشر من ${o ? o.city_ar : origin}`),
        el("span.meta", {}, r.airlines.slice(0, 3).map(name =>
          el("span", { style: "margin-inline-start:8px" }, name, el("span.tail", {}, name[0]))))));
    } else if (r){
      inner.append(el("div.row", {},
        el("span.who", {}, t`طيران مباشر من ${o ? o.city_ar : origin}؟ تحقق بالبحث`)));
    } else if (store.hasRoutes(origin)){
      inner.append(el("div.row", {}, el("span.who", {},
        t`لا رحلة مباشرة مسجلة من ${o ? o.city_ar : origin} — ستبدّل طائرة`)));
    }
    root.append(el("div.section", {}, el("h2", {}, t("الرحلات المباشرة:")),
      el("div.card", {}, inner)));
  }

  const near = store.nearestAirport(city);
  if (near){
    const a = near.airport || near;
    const km = near.distanceKm ?? near.distance_km ?? near.km;
    root.append(el("div.section", {}, el("h2", {}, t("أقرب مطار:")),
      el("div.card", {},
        el("bdi", { dir: "ltr" }, `${a.name_en} (${a.iata})`),
        t` — على بعد ${Math.round(km)} كم`)));

    // The handoff. This page IS the website — the allowed channel.
    const from = origin || "RUH";
    root.append(el("div.section", {},
      el("a.book", { rel: "nofollow sponsored", target: "_blank",
        href: kiwiLink(from, a.iata, `webapp_${city.id.replace("city-", "")}_${from}`) },
        t`ابحث عن طيران ${MONTHS_AR[month - 1]}`),
      el("div.disclose", {}, t("رابط شريك — الأسعار والحجز لدى الموقع الشريك."))));
  }

  // أبرز المعالم — تجربة باريس: إجماعٌ مقيس، ومواعيد وروابط رسمية،
  // وتذاكر حيث تُباع، وضوابط المراجعة الثلاثة قبل الدخول.
  const spots = store.attractions?.[city.id];
  if (spots?.length){
    const grid = el("div.attr-grid", {},
      spots.map(a => el("div.attr-card", {},
        (a.source && a.source !== "wikidata")
          ? el("div.aramp", {}, (aName(a) || "؟").trim()[0])
          : el("img", { src: "attractions/" + a.qid + ".jpg", alt: aName(a),
                    loading: "lazy" }),
        el("div.b", {},
          el("div.n", {}, aName(a)),
          aBlurb(a) ? el("div.d", {}, aBlurb(a)) : null,
          a.hours_ar ? el("div.h", {}, ficon("hours"), " ", a.hours_ar) : null,
          a.note ? el("div.d", { style: "margin-top:4px" }, a.note) : null,
          el("div.links", {},
            a.tickets_url ? el("a.tik", { href: a.tickets_url, target: "_blank",
              rel: "noopener nofollow" }, t("شراء التذاكر")) : null,
            a.official_url ? el("a.off", { href: a.official_url, target: "_blank",
              rel: "noopener nofollow" }, t("الموقع الرسمي ↗")) : null),
          // طلب طارق: تنبيه بسيط في كل بطاقة — استرشادية، والمصدر الحكم.
          el("div.disc", {}, t("معلومات استرشادية — تأكد من المصدر"))))));
    root.append(el("div.section", {},
      el("h2", {}, t("أبرز المعالم")), grid,
      el("div", { style: "font-size:11px;color:var(--muted);margin-top:6px" },
        t("المواعيد كما نشرتها المواقع الرسمية يوم جمعها — تحقق قبل زيارتك. الصور: Wikimedia Commons بمرخصها."))));
  }

  // احفظها رحلة — من هنا، لا من صفحة أخرى.
  const mine = Trips.all().filter(t => t.cityId === city.id);
  const planBox = el("div.card");
  if (mine.length){
    for (const t of mine){
      planBox.append(el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:6px" },
        el("span", { style: "flex:1" },
          "✈︎ " + (t.start || tt("؟")) + (t.end ? " ← " + t.end : "")),
        el("button.out", { onclick: () => { Trips.remove(t.id); render(); } }, tt("حذف"))));
    }
  }
  const ts = el("input", { type: "date" });
  const te = el("input", { type: "date" });
  planBox.append(el("div.planrow", {},
    ts, te,
    el("button.btn", { onclick: () => {
      if (!cloud.user){
        askSignIn(t("الرحلات تُحفظ في حسابك لتجدها على كل أجهزتك — ادخل وستُحفظ رحلتك هذه فورًا."),
          { type: "trip", cityId: city.id, title: cityName(city),
            start: ts.value || null, end: te.value || null });
        return;
      }
      Trips.add({ title: cityName(city), cityId: city.id,
                  start: ts.value || null, end: te.value || null });
      render();
    } }, t("احفظ الرحلة"))));
  root.append(el("div.section", {}, el("h2", {}, t("خطط رحلة إلى هنا:")), planBox));
  return root;
}

/* ── تفضيلات السفر ─────────────────────────────────────────────────── */
export function prefs(ctx, redraw = render){
  const { store, prefs, filter } = ctx;
  const root = el("div");
  root.append(el("div.top", {}, el("h1", {}, t("تفضيلات السفر")),
    el("a.circle", { href: "#/home" }, "‹")));

  // الجواز يُسأل عنه مرة واحدة في البحث — وتغييره من هنا.
  const passMenu = menu(
    [["", t("جوازك؟")]].concat(store.passports().map(cc => [cc, PASSPORT_AR[cc] || cc])),
    filter.passport || "",
    v => { filter.passport = v || null; redraw(); });
  root.append(el("div.section", {}, el("h2", {}, t("جواز السفر")), passMenu));

  const secTags = el("div.chips");
  for (const k of DESTINATION_TAGS){
    secTags.append(chip(TAG_AR[k] || k, prefs.tags.has(k),
      () => { prefs.toggleTag(k); redraw(); }));
  }
  const secBands = el("div.chips");
  for (const [k, ar] of Object.entries(WARMTH_AR)){
    if (k === "hot") continue;              // the app never courts hot
    secBands.append(chip(ar, prefs.bands.has(k),
      () => { prefs.toggleBand(k); redraw(); }));
  }
  const secRain = el("div.chips");
  const RAIN_KEYS = { none: RAIN_AR.r0, light: RAIN_AR.r1, moderate: RAIN_AR.r2, heavy: RAIN_AR.r3 };
  for (const [k, ar] of Object.entries(RAIN_KEYS)){
    secRain.append(chip(ar, prefs.rain.has(k),
      () => { prefs.toggleRain(k); redraw(); }));
  }
  const secAir = el("div.chips");
  for (const cc of store.originCountries()){
    for (const o of store.originsIn(cc)){
      const on = prefs.airports.has(o.iata);
      secAir.append(chip(o.city_ar + " " + o.iata, on,
        () => { on ? prefs.removeAirport(o.iata) : prefs.addAirport(o.iata); redraw(); }));
    }
  }
  root.append(
    el("div.section", {}, el("h2", {}, t("ما الذي يعجبك؟")), secTags),
    el("div.section", {}, el("h2", {}, t("الأجواء")), secBands),
    el("div.section", {}, el("h2", {}, t("الأمطار")), secRain),
    el("div.section", {}, el("h2", {}, t("مطارات انطلاقك")), scrollChips(secAir)));
  return root;
}

export function favorites(ctx){
  const { store, shortlist } = ctx;
  // صفحة شخصية — بطلها الهادئ: رمل فاتح لا سماء ليل، فالتمييز الكامل
  // محفوظ لبابي الرحلة الكبيرين.
  const root = el("div.wide");
  root.append(el("div.hero3", {},
    el("div.herorow", {},
      el("h1", {}, t("المفضلة")),
      el("a.circle", { href: "#/next", title: t("وجهاتك القادمة") }, "‹")),
    el("p", {}, t("الوجهات التي أحببتها، كلٌ بشهرها — تعيش في حسابك على كل أجهزتك."))));
  const inner = el("div.section");
  root.append(inner);
  if (!cloud.user){
    inner.append(el("div.card", { style: "text-align:center;padding:26px 18px" },
      el("div", { style: "font-size:34px" }, "♡"),
      el("p", {}, t("المفضلة تحتاج حسابًا — ادخل لتبدأها، أو لتسترجعها إن كنت دخلت من قبل على جهاز آخر.")),
      el("button.btn", { onclick: () =>
        askSignIn(t("ادخل بحسابك لتكون مفضلتك معك على كل أجهزتك.")) }, t("الدخول بحساب جوجل"))));
    return root;
  }
  const kept = [...shortlist.cityIDs]
    .map(id => store.cities.find(c => c.id === id)).filter(Boolean);
  if (!kept.length){
    inner.append(el("div.empty", {}, t("لا مفضلة بعد — المس ♡ على أي وجهة لتبقى هنا.")));
    return root;
  }
  const redraw = () => render();
  for (const city of kept) inner.append(destRow(ctx, city, redraw));
  return root;
}

/* ── بياناتي: الشفافية كاملة — ما في الحساب يراه صاحبه، ويمحوه بزر ── */
export function mydata(ctx){
  const { store, shortlist, prefs, papers, filter } = ctx;
  const root = el("div.wide");
  root.append(el("div.hero3", {},
    el("div.herorow", {},
      el("h1", {}, t("بياناتي")),
      el("a.circle", { href: "#/home" }, "‹")),
    el("p", {}, t("هذا كل ما يحفظه سوفينير في حسابك — لا شيء غيره. وبيدك محوه كله في الأسفل."))));
  const inner = el("div.section");
  root.append(inner);
  if (!cloud.user){
    inner.append(el("div.card", { style: "text-align:center;padding:26px 18px" },
      el("p", {}, t("ادخل بحسابك لترى كل ما هو محفوظ فيه — وتمحوه متى شئت.")),
      el("button.btn", { onclick: () =>
        askSignIn(t("ادخل بحسابك لترى بياناتك وتتحكم بها.")) }, t("الدخول"))));
    return root;
  }

  const sec = (title, body) => el("div.section", {}, el("h2", {}, title), body);

  inner.append(sec(t("حسابك"), el("div.card", {},
    el("div", {}, el("b", {}, cloud.user.displayName || "—")),
    el("div", { style: "color:var(--muted);font-size:13.5px" }, cloud.user.email || ""),
    el("div", { style: "color:var(--muted);font-size:12.5px;margin-top:4px" },
      t`الدخول عبر ${cloud.user.providerData?.[0]?.providerId === "apple.com" ? t("أبل") : t("جوجل")}`))));

  const hearts = [...shortlist.cityIDs]
    .map(id => store.cities.find(c => c.id === id)).filter(Boolean);
  inner.append(sec(t`المفضلة (${hearts.length})`, el("div.card", {},
    hearts.length ? hearts.map(c => {
      const m = shortlist.keptMonth(c.id);
      return el("div", {}, "♥ " + cityName(c) + (m ? " — " + MONTHS_AR[m - 1] : ""));
    }) : t("لا شيء بعد"))));

  const trips = Trips.all();
  inner.append(sec(t`الرحلات (${trips.length})`, el("div.card", {},
    trips.length ? trips.map(t =>
      el("div", {}, "✈︎ " + t.title + " — " + (t.start || tt("؟")) + (t.end ? " ← " + t.end : "")))
      : t("لا شيء بعد"))));

  inner.append(sec(t`الأوراق (${papers.documents.length})`, el("div.card", {},
    papers.documents.length ? papers.documents.map(d =>
      el("div", {}, "🪪 " + paperLabel(store, d) + (d.expiry ? t` — تنتهي ${d.expiry}` : "")))
      : t("لا شيء بعد"))));

  const prefBits = [
    ...[...prefs.tags].map(k => TAG_AR[k] || k),
    ...[...prefs.bands].map(k => WARMTH_AR[k] || k),
    ...[...prefs.rain],
    ...[...prefs.airports]];
  inner.append(sec(t("تفضيلاتك"), el("div.card", {},
    prefBits.length ? prefBits.join(" · ") : t("لا شيء بعد"))));

  inner.append(sec(t("الجواز"), el("div.card", {},
    filter.passport ? t`جواز ${PASSPORT_AR[filter.passport] || filter.passport}` : t("غير محدد"))));

  // المحو الذاتي — سؤال تأكيد في المكان نفسه، ثم لا رجعة.
  const eraseBox = el("div.card", { style: "border-color:var(--hot)" });
  const arm = el("button.erase", { onclick: () => {
    eraseBox.replaceChildren(
      el("p", { style: "margin:0 0 10px" },
        t("سيمحو هذا مفضلتك ورحلاتك وأوراقك وتفضيلاتك من حسابك ومن هذا الجهاز — بلا رجعة. متأكد؟")),
      el("div", { style: "display:flex;gap:8px" },
        el("button.erase", { onclick: async () => {
          try { await cloud.eraseMyData(); }
          catch { alert(t("تعذر المحو — أعد المحاولة.")); }
        } }, t("نعم، احذف نهائيًا")),
        el("button.later", { onclick: () => render() }, t("تراجع"))));
  } }, t("احذف بياناتي من الحساب"));
  eraseBox.append(arm);
  inner.append(sec(t("المحو"), eraseBox));
  return root;
}

/* ── أوراقي ────────────────────────────────────────────────────────── */
export function papers(ctx){
  const { store, papers } = ctx;
  const root = el("div.wide");
  root.append(el("div.hero3", {},
    el("div.herorow", {},
      el("h1", {}, t("أوراقي")),
      el("a.circle", { href: "#/next" }, "‹")),
    el("p", {}, t("تأشيراتك وإقاماتك، تدخلها بنفسك وتُحفظ في حسابك — قراءة الوثائق بالكاميرا ميزة تطبيق iOS."))));
  const inner = el("div.section");
  root.append(inner);
  const append = node => inner.append(node);

  const list = el("div.section");
  for (const d of papers.documents){
    list.append(el("div.card", { style: "margin-bottom:8px" },
      el("b", {}, paperLabel(store, d)),
      d.expiry ? t` — تنتهي ${d.expiry}` : "",
      hasExpired(d) ? el("b", { style: "color:var(--hot)" }, t(" · منتهية")) : "",
      el("button", { style: "float:left;color:var(--deep)",
        onclick: () => { papers.remove(d); render(); } }, t("حذف"))));
  }
  if (!papers.documents.length) list.append(el("div.empty", {}, t("لا أوراق بعد")));
  append(list);

  const kind = el("select", {},
    el("option", { value: "visa" }, t("تأشيرة")),
    el("option", { value: "residency" }, t("إقامة")));
  const seen = new Set();
  const countryOptions = [el("option", { value: "" }, t("الدولة / المنطقة")),
    el("option", { value: "bloc:schengen" }, t("شنغن (المنطقة)"))];
  for (const c of [...ctx.store.cities].sort((a, b) =>
        cName(a).localeCompare(cName(b), isEN ? "en" : "ar"))){
    if (seen.has(c.country_code)) continue;
    seen.add(c.country_code);
    countryOptions.push(el("option", { value: c.country_code }, cName(c)));
  }
  if (!cloud.user){
    append(el("div.card", { style: "text-align:center;padding:22px 18px" },
      el("p", {}, t("أوراق السفر تحتاج حسابًا — حتى تتبعك بتواريخ انتهائها على كل أجهزتك.")),
      el("button.btn", { onclick: () =>
        askSignIn(t("ادخل بحسابك لتضيف أوراقك وتتبعك أينما دخلت.")) }, t("الدخول بحساب جوجل"))));
    return root;
  }
  const country = el("select", {}, countryOptions);
  const expiry = el("input", { type: "date" });
  append(el("div.section", {}, el("h2", {}, t("أضف ورقة")),
    el("div.frow", {}, kind, country, expiry),
    el("button.btn", { onclick: () => {
      if (!country.value) return;
      const doc = country.value.startsWith("bloc:")
        ? { kind: kind.value, countryCode: "", bloc: country.value.slice(5),
            expiry: expiry.value || null }
        : { kind: kind.value, countryCode: country.value, expiry: expiry.value || null };
      papers.save(doc);
      render();
    } }, t("أضف"))));
  return root;
}

/* ── رحلاتك (القادمة فقط — الماضي يعيش في التطبيق) ─────────────────── */
// مدن الرحلة بترتيب مراحلها، ودولها بلا تكرار — البطاقة والعنوان في صفحة
// الخطة يقولان الشيء نفسه: الدولة عنوانًا، ومدنها تحتها بينها «+».
export function tripCities(trip, store){
  const ids = [];
  for (const l of (trip.legs || []))
    if (l.cityId && !ids.includes(l.cityId)) ids.push(l.cityId);
  if (!ids.length && trip.cityId) ids.push(trip.cityId);
  return ids.map(id => store.cities.find(c => c.id === id)).filter(Boolean);
}

export function tripCountries(cities){
  const out = [];
  for (const c of cities){
    const n = countryName(c);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function tripCard(ctx, t){
  const cities = tripCities(t, ctx.store);
  const city = cities[0] || null;
  const countries = tripCountries(cities).join(" + ");
  // في «رحلاتك القادمة» البطاقة كلها بابٌ للخطة — لا زر وسيطًا.
  return el("div.dest-row", { style: "cursor:pointer",
      onclick: () => goto("#/plan/" + t.id) },
    el("div.cover", { style: city ? coverStyle(city, null)
      : "background:linear-gradient(135deg,var(--band1),var(--band2))" },
      city ? flag(city.country_code) : "✈︎"),
    el("div.names", {},
      el("div.n", {}, countries || t.title),
      cities.length ? el("div.c", {}, cities.map(cityName).join(" + ")) : null,
      el("div.det", {}, (t.start || tt("؟")) + (t.end ? " ← " + t.end : ""))),
    el("div.side", {}, el("span.ch", {}, "‹")));
}

let memLens = "timeline";   // عدسة الذاكرة تعيش عبر الرسمات
let memAdding = false;

export function trips(ctx){
  const { store } = ctx;
  // بطلٌ للصفحة الداخلية كما اقترح طارق: العنوان ووعده وعدّاداته الثلاثة
  // على المدرج الليلي نفسه — والعدسات تحته على أرض الصفحة.
  const root = el("div.wide");
  const stats = cloud.user ? Memory.stats : null;
  root.append(el("div.hero2", {},
    el("div.herorow", {},
      el("h1", {}, t("تاريخ رحلاتك")),
      cloud.user ? el("button.btn", { onclick: () => {
        memAdding = !memAdding; render(); } },
        memAdding ? t("إغلاق") : t("أضف رحلة سابقة")) : null),
    el("p", {}, t("سجلات رحلاتك في حسابك على كل أجهزتك — وصورها تبقى في تطبيق iOS.")),
    stats ? el("div.memstats", { style: "margin-top:14px" },
      statBox(stats.trips, t("الرحلات")),
      statBox(stats.places, t("الأماكن")),
      statBox(stats.countries, t("الدول"))) : null));

  const body = wrap => { root.append(el("div.section", {}, wrap)); return root; };

  if (!cloud.user){
    return body(el("div.card", { style: "text-align:center;padding:26px 18px" },
      el("div", { style: "font-size:34px" }, "✈︎"),
      el("p", {}, t("الرحلات تحتاج حسابًا — ادخل لتخطط رحلتك، أو لتسترجع رحلاتك من جهاز آخر.")),
      el("button.btn", { onclick: () =>
        askSignIn(t("ادخل بحسابك لتكون رحلاتك معك على كل أجهزتك.")) }, t("الدخول بحساب جوجل"))));
  }

  const inner = el("div.section");
  root.append(inner);
  const append = node => inner.append(node);

  // القادمة انتقلت لبابها المستقل «رحلاتك القادمة» — هنا الذاكرة وحدها.

  // العدسات + زر الإضافة.
  const lensRow = el("div.countbar", {},
    el("div.lens", {},
      lensBtn(t("الخط الزمني"), memLens === "timeline", () => { memLens = "timeline"; render(); }),
      lensBtn(t("الدول"), memLens === "countries", () => { memLens = "countries"; render(); }),
      lensBtn(t("الخريطة"), memLens === "map", () => { memLens = "map"; render(); }),
      lensBtn(t("الرفقاء"), memLens === "companions", () => { memLens = "companions"; render(); })));
  append(lensRow);

  if (memAdding) append(addTripForm(ctx));

  const lensBody = { timeline: memTimeline, countries: memCountries,
                     map: memMap, companions: memCompanions }[memLens];
  append(lensBody(ctx));
  return root;
}

function statBox(n, label){
  return el("div.stat", {}, el("div.n", {}, String(n)), el("div.l", {}, label));
}

/* الخط الزمني: سنوات تتنازل، وتحت كل سنة رحلاتها بطاقات عريضة. */
function memTimeline(ctx){
  const wrap = el("div");
  const trips = Memory.trips;
  if (!trips.length){
    wrap.append(el("div.empty", {},
      t("لا رحلات سابقة بعد — أضفها يدويًا هنا، أو امسح صورك في تطبيق iOS فتصل وحدها.")));
    return wrap;
  }
  let year = null;
  for (const t of trips){
    const y = (t.start || tt("؟")).slice(0, 4);
    if (y !== year){ year = y; wrap.append(el("div.year-h", {}, year)); }
    wrap.append(memTripCard(ctx, t));
  }
  return wrap;
}

function memTripCard(ctx, t){
  const { store } = ctx;
  const places = (t.places ?? []).map(p => p.name);
  const title = places.length ? places.join(tt("، "))
    : (countryNameAr(store, t.countryIso) || tt("رحلة"));
  const mates = (t.companionIds ?? [])
    .map(id => Memory.companion(id)?.name).filter(Boolean);
  return el("div.dest-row", {},
    el("div.cover", { style: "background:var(--aurora)" },
      t.countryIso ? flag(t.countryIso) : "✈︎"),
    el("div.names", {},
      el("div.n", {}, title),
      el("div.c", {}, countryNameAr(store, t.countryIso) || ""),
      mates.length ? el("div.badges", {},
        mates.map(name => el("span.badge", {}, "👤 " + name))) : null,
      t.notes ? el("div.det", {}, t.notes) : null,
      el("div.det", {}, (t.start || tt("؟")) + (t.end ? " ← " + t.end : "")
        + (t.source === "photos" ? tt(" · من صورك") : "")),),
    el("div.side", {},
      el("div"),
      t.source === "manual"
        ? el("button.out", { onclick: () => {
            if (confirm(tt("حذف هذه الرحلة من حسابك؟"))) { Memory.removeTrip(t.id); render(); }
          } }, tt("حذف"))
        : el("span.det", { style: "font-size:11px;color:var(--muted)" }, tt("من التطبيق"))));
}

function countryNameAr(store, iso){
  if (!iso) return null;
  return (x => x && cName(x))(store.cities.find(c => c.country_code === iso))
    || store.passportCountryName?.(iso) || iso;
}

/* الدول: شبكة أعلام بعدد رحلات كل دولة. */
function memCountries(ctx){
  const { store } = ctx;
  const counts = new Map();
  for (const t of Memory.trips){
    const isos = new Set([t.countryIso, ...(t.places ?? []).map(p => p.countryIso)]
      .filter(Boolean));
    for (const iso of isos) counts.set(iso, (counts.get(iso) ?? 0) + 1);
  }
  const wrap = el("div.cgrid");
  if (!counts.size) return el("div.empty", {}, t("لا دول بعد"));
  for (const [iso, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])){
    wrap.append(el("div.ccell", {},
      el("div.f", {}, flag(iso)),
      el("div.n", {}, countryNameAr(store, iso) || iso),
      el("div.c", {}, n === 1 ? t("رحلة") : t`${n} رحلات`)));
  }
  return wrap;
}

/* الخريطة: كل مكان زرته دبوس. */
function memMap(ctx){
  const holder = el("div.findmap");
  const points = [];
  for (const t of Memory.trips)
    for (const p of t.places ?? [])
      if (p.lat != null) points.push(p);
  if (!points.length) return el("div.empty", {}, t("لا أماكن بإحداثيات بعد"));
  queueMicrotask(() => {
    const L = window.L;
    if (!L) return;
    const map = L.map(holder, { zoomControl: false, worldCopyJump: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 12, attribution: "© OpenStreetMap" }).addTo(map);
    for (const p of points)
      L.circleMarker([p.lat, p.lon], { radius: 6, weight: 2, color: "#B4622E",
        fillColor: "#E0A458", fillOpacity: .92 })
        .addTo(map).bindTooltip(p.name, { direction: "top" });
    map.fitBounds(points.map(p => [p.lat, p.lon]), { padding: [24, 24], maxZoom: 6 });
  });
  return holder;
}

/* الرفقاء: أحرفهم الأولى دوائر شفق — صورهم ميزة التطبيق. */
function memCompanions(ctx){
  const wrap = el("div");
  const list = el("div");
  for (const c of Memory.companions){
    const tripCount = Memory.trips.filter(t =>
      (t.companionIds ?? []).includes(c.id)).length;
    list.append(el("div.comp-row", {},
      el("span.avatarletter", {}, (c.name || t("؟")).trim()[0]),
      el("div.who", {},
        el("div.n", {}, c.name),
        el("div.e", {}, (c.relation ? c.relation + " · " : "")
          + (tripCount ? t`${tripCount} رحلة` : t("بلا رحلات بعد")))),
      el("button.out", { onclick: () => {
        if (confirm(t`حذف ${c.name} من رفقائك؟`)) { Memory.removeCompanion(c.id); render(); }
      } }, t("حذف"))));
  }
  if (!Memory.companions.length)
    list.append(el("div.empty", {}, t("لا رفقاء بعد")));
  const name = el("input", { placeholder: t("اسم الرفيق") });
  const relation = el("input", { placeholder: t("الصلة (اختياري)") });
  wrap.append(list, el("div.card", { style: "margin-top:10px" },
    el("div.planrow", {}, name, relation,
      el("button.btn", { onclick: () => {
        if (!name.value.trim()) return;
        Memory.addCompanion(name.value.trim(), relation.value.trim());
        render();
      } }, t("أضف رفيقًا")))));
  return wrap;
}

/* نموذج إضافة رحلة سابقة يدويًا. */
function addTripForm(ctx){
  const { store } = ctx;
  const place = el("input", { placeholder: t("المكان — مدينة أو موقع") });
  const seen = new Set();
  const countrySel = el("select.menu", {},
    el("option", { value: "" }, t("الدولة")),
    [...store.cities].sort((a, b) =>
      cName(a).localeCompare(cName(b), isEN ? "en" : "ar"))
      .filter(c => !seen.has(c.country_code) && seen.add(c.country_code))
      .map(c => el("option", { value: c.country_code }, cName(c))));
  const start = el("input", { type: "date" });
  const end = el("input", { type: "date" });
  const notes = el("input", { placeholder: t("ملاحظات (اختياري)") });
  const picked = new Set();
  const mates = el("div.chips", {},
    Memory.companions.map(c => {
      const b = chip(c.name, false, () => {
        picked.has(c.id) ? picked.delete(c.id) : picked.add(c.id);
        b.classList.toggle("on");
      });
      return b;
    }));
  return el("div.card", { style: "margin-bottom:12px" },
    el("div.planrow", {}, place, countrySel),
    el("div.planrow", { style: "margin-top:8px" }, start, end),
    el("div.planrow", { style: "margin-top:8px" }, notes),
    Memory.companions.length
      ? el("div", { style: "margin-top:8px" },
          el("div.det", { style: "margin-bottom:6px" }, t("الرفقاء:")), mates)
      : null,
    el("div.planrow", { style: "margin-top:10px" },
      el("button.btn", { onclick: () => {
        const name = place.value.trim();
        if (!name || !start.value) { alert(t("المكان وتاريخ البداية على الأقل.")); return; }
        const iso = countrySel.value || null;
        // إن طابق المكان مدينة معروفة أخذنا إحداثياتها.
        const known = store.cities.find(c => c.name_ar === name
          && (!iso || c.country_code === iso));
        Memory.addTrip({
          start: start.value, end: end.value || start.value,
          notes: notes.value.trim(),
          countryIso: iso ?? known?.country_code ?? "",
          places: [{ name, countryIso: iso ?? known?.country_code ?? "",
                     ...(known?.lat != null ? { lat: known.lat, lon: known.lon } : {}) }],
          companionIds: [...picked],
        });
        memAdding = false;
        render();
      } }, t("احفظ الرحلة"))));
}

/* ── رحلاتك القادمة: قسم التخطيط القائم بذاته — قرار طارق 2026-08-30 ── */
export function upcoming(ctx){
  const root = el("div.wide");
  root.append(el("div.hero2", {},
    el("div.herorow", {}, el("h1", {}, t("رحلاتك القادمة"))),
    el("p", {}, t("كل رحلة تنوي السفر إليها — تخطط أيامها هنا، وتجدها على كل أجهزتك."))));
  const inner = el("div.section");
  root.append(inner);
  if (!cloud.user){
    inner.append(el("div.card", { style: "text-align:center;padding:26px 18px" },
      el("div", { style: "font-size:34px" }, "🧭"),
      el("p", {}, t("رحلاتك القادمة تحتاج حسابًا — ادخل لتبدأ التخطيط، أو لتسترجع خططك من جهاز آخر.")),
      el("button.btn", { onclick: () =>
        askSignIn(t("ادخل بحسابك لتكون خططك معك على كل أجهزتك.")) }, t("الدخول"))));
    return root;
  }
  const coming = Trips.upcoming();
  if (!coming.length){
    inner.append(el("div.card", { style: "text-align:center;padding:26px 18px" },
      el("div", { style: "font-size:34px" }, "🧭"),
      el("p", {}, t("لا رحلات قادمة بعد — افتح أي وجهة واضغط «لدي رحلة قادمة لهذه المدينة».")),
      el("a.btn", { href: "#/next", style: "display:inline-block;margin-top:6px" },
        t("ابحث عن الوجهات"))));
    return root;
  }
  const list = el("div");
  for (const tr of coming) list.append(tripCard(ctx, tr));
  inner.append(list);
  return root;
}


/* ── رأيك: باب الملاحظات ──
   جاء إلى سوفينير جمهورٌ من تيكتوك، والموقع في أوله. أنفع ما يُعطى زائرٌ
   في هذه المرحلة بابٌ يقول منه ما نقص — فما يُقال هنا يصل طارق كما كُتب،
   بلا نموذج ولا وسيط. مفتوح للمسجَّلين وحدهم: الاسم يضبط النبرة ويمنع الضجيج. */
export function feedbackSheet(){
  if (document.querySelector(".sheetback")) return;
  if (!cloud.user){
    askSignIn(t("ادخل بحسابك لترسل ملاحظتك — لنعرف لمن نردّ."));
    return;
  }
  const back = el("div.sheetback", { onclick: close });
  const box = el("textarea.fbtext", {
    rows: 6, maxlength: 4000,
    placeholder: t("ما الذي نقص؟ وما الذي أعجبك؟ اكتب بحرّية.") });
  const note = el("p.fbnote", {});
  const send = el("button.btn", { onclick: async () => {
    const text = box.value.trim();
    if (!text){ note.textContent = t("اكتب ملاحظتك أولًا."); return; }
    send.disabled = true; note.textContent = t("جارٍ الإرسال…");
    try {
      await cloud.sendFeedback(text);
      box.value = "";
      note.textContent = t("وصلت — شكرًا لك. نقرأ كل ملاحظة.");
      setTimeout(close, 1400);
    } catch (e){
      send.disabled = false;
      note.textContent = t("تعذر الإرسال — أعد المحاولة.");
    }
  } }, t("أرسل"));
  const card = el("div.gate.fb", {},
    el("h3", {}, t("رأيك يهمّنا")),
    el("p", {}, t("سوفينير في أوله، وملاحظتك تصنع ما بعده.")),
    box, send, note,
    el("button.later", { onclick: close }, t("ليس الآن")));
  function close(){ back.remove(); card.remove(); }
  document.body.append(back, card);
}

/* ── لوحة الإدارة ──
   لطارق وحده: من دخل الموقع، ومتى، وماذا قال. القواعد في Firestore هي
   الحارس الحقيقي؛ وإخفاء الصفحة أدبٌ لا أمن. */
export function admin(ctx){
  const root = el("div.wide");
  root.append(el("div.hero3", {},
    el("div.herorow", {},
      el("h1", {}, t("لوحة الإدارة")),
      el("a.circle", { href: "#/home" }, "‹")),
    el("p", {}, t("من سجّل في سوفينير، وماذا قالوا."))));
  const inner = el("div.section");
  root.append(inner);
  if (!cloud.isAdmin()){
    inner.append(el("div.card", { style: "text-align:center;padding:26px 18px" },
      el("p", {}, t("هذه الصفحة لصاحب الموقع."))));
    return root;
  }
  const when = v => {
    const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null);
    if (!d || isNaN(d)) return "—";
    return d.toLocaleString(isEN ? "en-GB" : "ar", { dateStyle: "medium", timeStyle: "short" });
  };
  const people = el("div.card", {}, el("div.muted", {}, t("جارٍ التحميل…")));
  const says = el("div.card", {}, el("div.muted", {}, t("جارٍ التحميل…")));
  inner.append(el("div.section", {}, el("h2", {}, t("المسجّلون")), people));
  inner.append(el("div.section", {}, el("h2", {}, t("الملاحظات")), says));

  cloud.listSignups().then(rows => {
    people.replaceChildren(rows.length
      ? el("div", {},
          el("div.admincount", {}, t`العدد: ${String(rows.length)}`),
          ...rows.map(r => el("div.adminrow", {},
            el("div", {},
              el("div.t", {}, r.name || r.email || r.uid),
              el("div.s", {}, r.email || ""),
              el("div.s", {}, t`أول مرة ${when(r.createdAt ?? r.firstSeen)} · آخر مرة ${when(r.lastSeen)}`),
              el("div.s", {}, (r.providers || []).join(" · "))))))
      : el("div.muted", {}, t("لا أحد بعد.")));
  }).catch(e => people.replaceChildren(
    el("div.muted", {}, t("تعذر القراءة — تأكد من قواعد Firestore. ") + String(e?.code || e))));

  cloud.listFeedback().then(rows => {
    says.replaceChildren(rows.length
      ? el("div", {}, ...rows.map(r => el("div.adminrow", {},
          el("div", {},
            el("div.t", {}, r.name || r.email || r.uid),
            el("div.fbbody", {}, r.text || ""),
            el("div.s", {}, t`${when(r.when)} · ${r.page || ""}`)))))
      : el("div.muted", {}, t("لا ملاحظات بعد.")));
  }).catch(e => says.replaceChildren(
    el("div.muted", {}, t("تعذر القراءة — تأكد من قواعد Firestore. ") + String(e?.code || e))));

  return root;
}
