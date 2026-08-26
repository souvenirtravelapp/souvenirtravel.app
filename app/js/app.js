// The shell: loads the data bundle once, builds the app's brains, routes by
// hash. Three tabs, like the iOS app: Home, the destination filter, trips.
import { TravelDataStore } from "./store.js";
import { TravelPreferences } from "./prefs.js";
import { Shortlist } from "./shortlist.js";
import { TravelDocuments } from "./papers.js";
import { NextTripFilter } from "./filter.js";
import { el } from "./ui.js";
import * as views from "./views.js";
import * as cloud from "./cloud.js";
import { Trips } from "./trips-store.js";

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
  const on = { d: "home", find: "home", prefs: "home", papers: "home",
               trips: "home", mydata: "home" }[path] || path;
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
    avatarFace());
}

// وجه الترويسة: صورة من عنده صورة، وحرفه الأول لمن دخل بلا صورة
// (أبل لا تمنح صورًا)، والوجه المرسوم للضيف.
function avatarFace(){
  const u = cloud.user;
  const base = { onclick: openSettings, title: "الإعدادات", "aria-label": "الإعدادات" };
  if (u?.photoURL)
    return el("button.avatar.real", base,
      el("img", { src: u.photoURL, alt: "", referrerpolicy: "no-referrer" }));
  if (u){
    const letter = (u.displayName || u.email || "•").trim()[0];
    return el("button.avatar.letter", base, letter);
  }
  return el("button.avatar", base);
}

// الإعدادات تنبثق كما في التطبيق: لوحة من جهة الصورة، تحمل التفضيلات
// ومداخل رحلاتك وأوراقي، وتغلق بلمسة الخلفية.
// بوابة الحساب: تُستدعى عند فعلٍ قرّر طارق أنه يحتاج حسابًا (القلب، الأوراق)
// أو اقتراحًا (الرحلة). الفعل المُعلق يُحفظ ويكتمل وحده بعد الدخول.
export function askSignIn(message, pending = null){
  if (document.querySelector(".sheetback")) return;
  const back = el("div.sheetback", { onclick: close });
  const card = el("div.gate", {},
    el("h3", {}, "بحساب واحد — على كل أجهزتك"),
    el("p", {}, message),
    el("button.gsign", { onclick: async () => {
      if (pending) localStorage.setItem("sv.pending", JSON.stringify(pending));
      try { await cloud.signIn(); }
      catch (e){
        localStorage.removeItem("sv.pending");
        if (e?.code !== "auth/popup-closed-by-user") alert("تعذر الدخول — أعد المحاولة.");
      }
    } }, el("span.g", {}, "G"), "الدخول بحساب جوجل"),
    el("button.gsign.apple", { onclick: async () => {
      if (pending) localStorage.setItem("sv.pending", JSON.stringify(pending));
      try { await cloud.signInApple(); }
      catch (e){
        localStorage.removeItem("sv.pending");
        if (e?.code !== "auth/popup-closed-by-user") alert("تعذر الدخول — أعد المحاولة.");
      }
    } }, el("span.g", {}, "\uF8FF"), "الدخول بحساب أبل"),
    el("button.later", { onclick: close }, "ليس الآن"));
  function close(){ back.remove(); card.remove(); }
  document.body.append(back, card);
}

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
      account(),
      el("div.sheetlinks", {},
        el("a", { href: "#/trips",  onclick: close }, "رحلاتك"),
        el("a", { href: "#/papers", onclick: close }, "أوراقي"),
        el("a", { href: "#/mydata", onclick: close }, "بياناتي")),
      sheetTrips(),
      strip(views.prefs(ctx, () => { sheet.replaceChildren(...content()); }))];
  }
  // رحلاته القادمة، بين يدي حسابه.
  function sheetTrips(){
    const coming = Trips.upcoming();
    if (!coming.length) return el("div");
    return el("div.sheettrips", {},
      el("h3", {}, "رحلاتك القادمة"),
      coming.map(t => el("a.trow", { href: "#/trips", onclick: close },
        "✈︎ ", t.title,
        el("span.d", {}, (t.start || "") + (t.end ? " ← " + t.end : "")))));
  }

  // حسابه: دخول جوجل للضيف، وبطاقته مع «خروج» لمن دخل.
  function account(){
    if (!cloud.user){
      const attempt = fn => async () => {
        try { await fn(); }
        catch (e){ if (e?.code !== "auth/popup-closed-by-user") alert("تعذر الدخول — أعد المحاولة."); }
      };
      return el("div", {},
        el("button.gsign", { onclick: attempt(cloud.signIn) },
          el("span.g", {}, "G"),
          "الدخول بحساب جوجل — لتُحفظ مفضلتك ورحلاتك في حسابك"),
        el("button.gsign.apple", { onclick: attempt(cloud.signInApple) },
          el("span.g", {}, "\uF8FF"), "الدخول بحساب أبل"));
    }
    return el("div.account", {},
      cloud.user.photoURL ? el("img", { src: cloud.user.photoURL, alt: "",
        referrerpolicy: "no-referrer" })
        : el("span.letter", {}, (cloud.user.displayName || cloud.user.email || "•").trim()[0]),
      el("div.who", {},
        el("div.n", {}, cloud.user.displayName || ""),
        el("div.e", {}, cloud.user.email || "")),
      el("button.out", { onclick: () => cloud.signOutNow() }, "خروج"));
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
    mydata: () => views.mydata(ctx),
  }[path] || (() => views.home(ctx));
  view.append(draw());
  drawTabs();
  window.scrollTo(0, 0);
  cloud.schedulePush();
}

async function boot(){
  await cloud.restore();
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
  // فعلٌ عُلّق قبل الدخول يكتمل الآن — القلب الذي بدأ الرحلة كلها.
  const pending = JSON.parse(localStorage.getItem("sv.pending") ?? "null");
  if (pending && cloud.user){
    if (pending.type === "heart" && !ctx.shortlist.contains(pending.cityId))
      ctx.shortlist.toggle(pending.cityId, pending.month);
    if (pending.type === "trip")
      Trips.add({ title: pending.title, cityId: pending.cityId,
                  start: pending.start, end: pending.end });
    localStorage.removeItem("sv.pending");
  }
  window.addEventListener("hashchange", render);
  render();
}

boot().catch(e => {
  document.getElementById("view").replaceChildren(
    el("div.empty", {}, "تعذر تحميل البيانات — أعد المحاولة. ", String(e)));
});
