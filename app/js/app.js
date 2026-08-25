// The shell: loads the data bundle once, builds the app's brains, routes by
// hash. Three tabs, like the iOS app: Home, the destination filter, trips.
import { TravelDataStore } from "./store.js";
import { TravelPreferences } from "./prefs.js";
import { Shortlist } from "./shortlist.js";
import { TravelDocuments } from "./papers.js";
import { NextTripFilter } from "./filter.js";
import { el } from "./ui.js";
import * as views from "./views.js";

const TABS = [
  { hash: "#/home", label: "ابحث",     icon: "icons/TabHome.svg" },
  { hash: "#/map",  label: "خريطة",   icon: "icons/TabFind.svg" },
  { hash: "#/fav",  label: "المفضلة", icon: "icons/TabFav.svg"  },
];

let ctx = null;      // { store, prefs, shortlist, papers, filter } — one soul

function currentRoute(){
  const h = location.hash || "#/home";
  const [path, arg] = h.slice(2).split("/");
  return { path: path || "home", arg };
}

function drawTabs(){
  const { path } = currentRoute();
  const on = { d: "home", find: "home", prefs: "home", papers: "home", trips: "home" }[path] || path;
  const nav = document.getElementById("tabs");
  nav.replaceChildren(el("div.pill", {},
    TABS.map(t => el("a", { href: t.hash, class: ("#/" + on === t.hash) ? "on" : "" },
      el("img", { src: t.icon, alt: "" }),
      t.label))));
  // The desktop wears a brand bar instead of a thumb pill.
  // الصورة في أقصى اليسار — بعيدًا عن الشعار الذي يفتتح الصف.
  const bar = document.getElementById("topbar");
  if (bar) bar.replaceChildren(
    el("a.brand", { href: "#/home" },
      el("img", { src: "/icon.png", alt: "" }), "سوفينير"),
    el("div.links", {},
      el("a", { href: "#/home", class: on === "home" ? "on" : "" }, "ابحث"),
      el("a", { href: "#/map",  class: on === "map"  ? "on" : "" }, "خريطة"),
      el("a", { href: "#/fav",  class: on === "fav"  ? "on" : "" }, "المفضلة")),
    el("button.avatar", { onclick: openSettings, title: "الإعدادات",
      "aria-label": "الإعدادات" }));
}

// الإعدادات تنبثق كما في التطبيق: لوحة من جهة الصورة، تحمل التفضيلات
// ومداخل رحلاتك وأوراقي، وتغلق بلمسة الخلفية.
function openSettings(){
  if (document.querySelector(".sheetback")) return;
  const back = el("div.sheetback", { onclick: close });
  const sheet = el("aside.sheet", { onclick: e => e.stopPropagation() });
  function close(){ back.remove(); sheet.remove(); render(); }
  function content(){
    return [
      el("div.sheethead", {},
        el("h2", {}, "الإعدادات"),
        el("button.x", { onclick: close, "aria-label": "إغلاق" }, "✕")),
      el("div.sheetlinks", {},
        el("a", { href: "#/trips",  onclick: close }, "رحلاتك"),
        el("a", { href: "#/papers", onclick: close }, "أوراقي")),
      strip(views.prefs(ctx, () => { sheet.replaceChildren(...content()); }))];
  }
  function strip(prefsEl){
    prefsEl.querySelector(".top")?.remove();   // the sheet already has its head
    return prefsEl;
  }
  sheet.replaceChildren(...content());
  document.body.append(back, sheet);
}

export function render(){
  const { path, arg } = currentRoute();
  const view = document.getElementById("view");
  view.replaceChildren();
  const draw = {
    home:   () => views.home(ctx),
    find:   () => views.finder(ctx),
    d:      () => views.destination(ctx, arg),
    prefs:  () => views.prefs(ctx),
    papers: () => views.papers(ctx),
    trips:  () => views.trips(ctx),
    map:    () => { ctx.filter.presentation = "map"; return views.finder(ctx); },
    fav:    () => views.favorites(ctx),
  }[path] || (() => views.home(ctx));
  view.append(draw());
  drawTabs();
  window.scrollTo(0, 0);
}

async function boot(){
  const v = new URL(import.meta.url).searchParams.get("v");
  const bundle = await (await fetch("data/bundle.json" + (v ? "?v=" + v : ""))).json();
  const store = new TravelDataStore(bundle);
  const shortlist = new Shortlist();
  ctx = {
    store,
    shortlist,
    prefs: new TravelPreferences(),
    papers: new TravelDocuments(),
    filter: new NextTripFilter(store, { shortlist }),
  };
  window.addEventListener("hashchange", render);
  render();
}

boot().catch(e => {
  document.getElementById("view").replaceChildren(
    el("div.empty", {}, "تعذر تحميل البيانات — أعد المحاولة. ", String(e)));
});
