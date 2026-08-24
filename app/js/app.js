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
  { hash: "#/home",  label: "الرئيسية",      icon: "icons/TabHome.svg"  },
  { hash: "#/find",  label: "فلتر الوجهات", icon: "icons/TabFind.svg"  },
  { hash: "#/trips", label: "رحلاتك",        icon: "icons/TabTrips.svg" },
];

let ctx = null;      // { store, prefs, shortlist, papers, filter } — one soul

function currentRoute(){
  const h = location.hash || "#/home";
  const [path, arg] = h.slice(2).split("/");
  return { path: path || "home", arg };
}

function drawTabs(){
  const { path } = currentRoute();
  const on = { d: "find", prefs: "home", papers: "find" }[path] || path;
  const nav = document.getElementById("tabs");
  nav.replaceChildren(el("div.pill", {},
    TABS.map(t => el("a", { href: t.hash, class: ("#/" + on === t.hash) ? "on" : "" },
      el("img", { src: t.icon, alt: "" }),
      t.label))));
  // The desktop wears a brand bar instead of a thumb pill.
  const bar = document.getElementById("topbar");
  if (bar) bar.replaceChildren(
    el("a.brand", { href: "#/home" }, "سوفينير"),
    el("div.links", {},
      el("a", { href: "#/home",  class: on === "home"  ? "on" : "" }, "التخطيط"),
      el("a", { href: "#/find",  class: on === "find"  ? "on" : "" }, "الوجهات"),
      el("a", { href: "#/trips", class: on === "trips" ? "on" : "" }, "رحلاتك"),
      el("a", { href: "#/papers" }, "أوراقي"),
      el("a", { href: "#/prefs" }, "تفضيلاتي")));
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
  }[path] || (() => views.home(ctx));
  view.append(draw());
  drawTabs();
  window.scrollTo(0, 0);
}

async function boot(){
  const bundle = await (await fetch("data/bundle.json")).json();
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
