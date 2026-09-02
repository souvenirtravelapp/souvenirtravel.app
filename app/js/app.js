import { t, isEN, setLang, applyDir } from "/app/js/i18n.js";
applyDir();
// The shell: loads the data bundle once, builds the app's brains, routes by
// hash. Three tabs, like the iOS app: Home, the destination filter, trips.
import { TravelDataStore } from "./store.js";
import { TravelPreferences } from "./prefs.js";
import { Shortlist } from "./shortlist.js";
import { TravelDocuments } from "./papers.js";
import { NextTripFilter } from "./filter.js";
import { el } from "./ui.js";
import * as views from "./views.js";
import { planner } from "/app/js/planner.js";
import * as cloud from "./cloud.js";
import { Trips } from "./trips-store.js";

// أبواب سوفينير الأربعة كما رتبها طارق (2026-08-30): بيتٌ يستقبل، وبحثٌ
// يرشّح، وقادمٌ يُخطَّط — قسم كبير قائم بذاته — وماضٍ يُحفظ.
const TABS = [
  { hash: "#/home",     label: t("الرئيسية"),        icon: "icons/TabHome.svg"  },
  { hash: "#/next",     label: t("١ ابحث في الوجهات السياحية"), icon: "icons/TabFind.svg"  },
  { hash: "#/upcoming", label: t("٢ رحلاتك القادمة"),  icon: "icons/TabFav.svg"   },
  { hash: "#/trips",    label: t("٣ تاريخ رحلاتك"),  icon: "icons/TabTrips.svg" },
];

let ctx = null;      // { store, prefs, shortlist, papers, filter } — one soul

function currentRoute(){
  const h = location.hash || "#/home";
  const [path, arg] = h.slice(2).split("/");
  return { path: path || "home", arg };
}

function drawTabs(){
  const { path } = currentRoute();
  // كل طريق يضيء بابه: الوجهة والمفضلة والبحث أبناء «وجهاتك القادمة»،
  // والتفضيلات والأوراق والبيانات أبناء البيت.
  const on = { d: "next", find: "next", map: "next", fav: "next",
               plan: "upcoming",
               prefs: "home", papers: "home", mydata: "home",
               admin: "home" }[path] || path;
  const tripsGuard = e => guardNav(e, "#/trips",
    t("رحلاتك تُحفظ في حسابك لتجدها على كل أجهزتك."));
  const upcomingGuard = e => guardNav(e, "#/upcoming",
    t("رحلاتك القادمة وخططها تُحفظ في حسابك لتجدها على كل أجهزتك."));
  const nav = document.getElementById("tabs");
  nav.replaceChildren(el("div.pill", {},
    TABS.map(t => el("a", { href: t.hash, class: ("#/" + on === t.hash) ? "on" : "",
      ...(t.hash === "#/trips" ? { onclick: tripsGuard }
        : t.hash === "#/upcoming" ? { onclick: upcomingGuard } : {}) },
      el("img", { src: t.icon, alt: "" }),
      t.label))));
  // The desktop wears a brand bar instead of a thumb pill.
  // الصورة في أقصى اليسار — بعيدًا عن الشعار الذي يفتتح الصف.
  const bar = document.getElementById("topbar");
  if (bar) bar.replaceChildren(
    el("a.brand", { href: "#/home" },
      el("img", { src: "/icon.png", alt: "" }), t("سوفينير")),
    el("div.links", {},
      el("a", { href: "#/home",  class: on === "home"  ? "on" : "" }, t("الرئيسية")),
      el("a", { href: "#/next",  class: on === "next"  ? "on" : "" }, t("١ ابحث في الوجهات السياحية")),
      el("a", { href: "#/upcoming", class: on === "upcoming" ? "on" : "",
        onclick: upcomingGuard }, t("٢ رحلاتك القادمة")),
      el("a", { href: "#/trips", class: on === "trips" ? "on" : "",
        onclick: tripsGuard }, t("٣ تاريخ رحلاتك"))),
    langPill(),
    avatarFace());
}

const SIGNIN_MSG = t("بحساب واحد تُحفظ مفضلتك ورحلاتك وأوراقك — وتجدها على كل أجهزتك.");

// حارس الوجهات المحمية: الضيف يرى نافذة الدخول، ومن دخل يمضي —
// والوجهة المطلوبة تُعلَّق فيهبط عليها فور عودته.
function guardNav(e, hash, msg){
  if (cloud.user) return;
  e.preventDefault();
  askSignIn(msg || SIGNIN_MSG, { type: "nav", hash });
}

// وجه الترويسة: صورة من عنده صورة، وحرفه الأول لمن دخل بلا صورة
// (أبل لا تمنح صورًا)، و«تسجيل الدخول» صريحةً للضيف.
function avatarFace(){
  const u = cloud.user;
  const base = { onclick: openSettings, title: t("الإعدادات"), "aria-label": t("الإعدادات") };
  if (u?.photoURL)
    return el("button.avatar.real", base,
      el("img", { src: u.photoURL, alt: "", referrerpolicy: "no-referrer" }));
  if (u){
    const letter = (u.displayName || u.email || "•").trim()[0];
    return el("button.avatar.letter", base, letter);
  }
  return el("button.signin", { onclick: () => askSignIn(SIGNIN_MSG) },
    t("تسجيل الدخول"));
}

// زر اللغة: ظاهر دائمًا — للضيف قبل صاحب الحساب.
function langPill(){
  return el("button.langpill", {
    onclick: () => setLang(isEN ? "ar" : "en"),
    title: isEN ? "العربية" : "English",
    "aria-label": isEN ? "العربية" : "English",
  }, isEN ? "ع" : "EN");
}

// الإعدادات تنبثق كما في التطبيق: لوحة من جهة الصورة، تحمل التفضيلات
// ومداخل رحلاتك وأوراقي، وتغلق بلمسة الخلفية.
// بوابة الحساب: تُستدعى عند فعلٍ قرّر طارق أنه يحتاج حسابًا (القلب، الأوراق)
// أو اقتراحًا (الرحلة). الفعل المُعلق يُحفظ ويكتمل وحده بعد الدخول.
export function askSignIn(message, pending = null){
  if (document.querySelector(".sheetback")) return;
  const back = el("div.sheetback", { onclick: close });
  const card = el("div.gate", {},
    el("h3", {}, t("بحساب واحد — على كل أجهزتك")),
    el("p", {}, message),
    el("button.gsign", { onclick: async () => {
      if (pending) localStorage.setItem("sv.pending", JSON.stringify(pending));
      try { await cloud.signIn(); }
      catch (e){
        localStorage.removeItem("sv.pending");
        if (e?.code !== "auth/popup-closed-by-user") alert(t("تعذر الدخول — أعد المحاولة."));
      }
    } }, el("span.g", {}, "G"), t("الدخول بحساب جوجل")),
    el("button.gsign.apple", { onclick: async () => {
      if (pending) localStorage.setItem("sv.pending", JSON.stringify(pending));
      try { await cloud.signInApple(); }
      catch (e){
        localStorage.removeItem("sv.pending");
        if (e?.code !== "auth/popup-closed-by-user") alert(t("تعذر الدخول — أعد المحاولة."));
      }
    } }, el("span.g", {}, "\uF8FF"), t("الدخول بحساب أبل")),
    el("button.later", { onclick: close }, t("ليس الآن")));
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
        el("h2", {}, t("الإعدادات")),
        el("button.x", { onclick: close, "aria-label": t("إغلاق") }, "✕")),
      account(),
      // أزرار صفوف تغطي كل الإعدادات — قرار طارق: لا تفضيلات مبعثرة هنا؛
      // كلٌ خلف زره، كقائمة إعدادات التطبيق.
      el("div.sheetrows", {},
        langRow(),
        row(t("تفضيلات السفر"), t("جوازك وما يعجبك وأجواؤك ومطاراتك"), "#/prefs"),
        row(t("أوراقي"), t("تأشيراتك وإقاماتك بتواريخها"), "#/papers",
          t("أوراق السفر تُحفظ في حسابك وتتبعك بتواريخ انتهائها.")),
        row(t("بياناتي"), t("كل ما في حسابك، وباب المحو"), "#/mydata", ""),
        row(t("سياسة الخصوصية"), t("ما يُحفظ وكيف تتحقق بنفسك"), "/privacy/"),
        row(t("شروط الاستخدام"), t("استخدامك الشخصي وحدوده"), "/terms/"),
        // رأيك قبل البريد: الباب الأقرب أولى بمن جاء للتوّ من تيكتوك.
        el("a.srow", { href: "#", onclick: e => {
            e.preventDefault(); close(); views.feedbackSheet();
          } },
          el("div", {},
            el("div.t", {}, t("رأيك يهمّنا")),
            el("div.s", {}, t("أرسل ملاحظتك مباشرة إلينا"))),
          el("span.ch", {}, "‹")),
        row(t("تواصل معنا"), "support@souvenirtravel.app",
            "mailto:support@souvenirtravel.app"),
        cloud.isAdmin()
          ? row(t("لوحة الإدارة"), t("المسجّلون وملاحظاتهم"), "#/admin") : null,
        // الخروج آخر الأبواب لا جار الصورة — وبتأكيد، فالخروج قرار لا زلة إصبع.
        cloud.user ? el("a.srow", { href: "#", onclick: (e) => {
            e.preventDefault();
            if (confirm(t("تريد الخروج من حسابك؟ مفضلتك ورحلاتك تبقى محفوظة في الحساب وتعود بعودتك.")))
              { cloud.signOutNow(); close(); }
          } },
          el("div", {},
            el("div.t", { style: "color:var(--deep)" }, t("خروج")),
            el("div.s", {}, t("من حسابك على هذا الجهاز")))) : null)];
  }
  // صف إعدادات: عنوان وسطر شارح وسهم — يغلق اللوحة ويمضي، ويحرس ما يحتاج حسابًا.
  // صف اللغة: يقلب الواجهة بين العربية والإنجليزية ويعيد التحميل.
  function langRow() {
    const r = el("a.srow", { href: "#" });
    const other = isEN ? "العربية" : "English";
    const sub = isEN ? "Switch the interface language" : "بدّل لغة الواجهة";
    r.append(el("div", {}, el("div.t", {}, other), el("div.s", {}, sub)));
    r.onclick = (e) => { e.preventDefault(); setLang(isEN ? "ar" : "en"); };
    return r;
  }
  function row(title, sub, href, guardMsg){
    return el("a.srow", { href,
      onclick: e => { close();
        if (guardMsg !== undefined) guardNav(e, href, guardMsg || undefined); } },
      el("div", {},
        el("div.t", {}, title),
        el("div.s", {}, sub)),
      el("span.ch", {}, "‹"));
  }

  // حسابه: دخول جوجل للضيف، وبطاقته مع «خروج» لمن دخل.
  function account(){
    if (!cloud.user){
      const attempt = fn => async () => {
        try { await fn(); }
        catch (e){ if (e?.code !== "auth/popup-closed-by-user") alert(t("تعذر الدخول — أعد المحاولة.")); }
      };
      return el("div", {},
        el("button.gsign", { onclick: attempt(cloud.signIn) },
          el("span.g", {}, "G"),
          t("الدخول بحساب جوجل — لتُحفظ مفضلتك ورحلاتك في حسابك")),
        el("button.gsign.apple", { onclick: attempt(cloud.signInApple) },
          el("span.g", {}, "\uF8FF"), t("الدخول بحساب أبل")));
    }
    const provs = cloud.providers();
    const linkBtn = (name, label) => el("button.linkacct", { onclick: async () => {
      try { await cloud.linkProvider(name); }
      catch (e){
        if (e?.code === "auth/credential-already-in-use")
          alert(t("هذا الحساب مستعمل عندنا كهوية مستقلة — احذف بياناته من صفحة «بياناتي» وهو داخل، ثم اربطه من هنا."));
        else if (e?.code !== "auth/popup-closed-by-user")
          alert(t("تعذر الربط — أعد المحاولة."));
      } } }, t`اربط حساب ${label}`);
    return el("div", {},
      el("div.account", {},
        cloud.user.photoURL ? el("img", { src: cloud.user.photoURL, alt: "",
          referrerpolicy: "no-referrer" })
          : el("span.letter", {}, (cloud.user.displayName || cloud.user.email || "•").trim()[0]),
        el("div.who", {},
          el("div.n", {}, cloud.user.displayName || ""),
          el("div.e", {}, cloud.user.email || ""))),
      // باب ناقص؟ اربطه فيصير الحساب واحدًا بمدخلين.
      !provs.includes("apple.com") ? linkBtn("apple", t("أبل ")) : null,
      !provs.includes("google.com") ? linkBtn("google", t("جوجل")) : null);
  }
  sheet.replaceChildren(...content());
  document.body.append(back, sheet);
}

let lastRoute = null;

export function render(){
  const { path, arg } = currentRoute();
  // إعادة الرسم داخل الصفحة نفسها ليست انتقالًا: من يضيف فعالية وهو في
  // منتصف القائمة يجب أن يبقى حيث هو، ولا يُقذف به إلى أعلى الصفحة.
  const key = path + "/" + (arg ?? "");
  const sameRoute = key === lastRoute;
  const keepY = window.scrollY;
  lastRoute = key;
  const view = document.getElementById("view");
  view.replaceChildren();
  const draw = {
    home:   () => views.home(ctx),
    next:   () => views.finder(ctx),
    find:   () => views.finder(ctx),   // عناوين قديمة محفوظة تهبط في البيت الجديد
    map:    () => { ctx.filter.presentation = "map"; return views.finder(ctx); },
    d:      () => views.destination(ctx, arg),
    prefs:  () => views.prefs(ctx),
    papers: () => views.papers(ctx),
    trips:  () => views.trips(ctx),
    upcoming: () => views.upcoming(ctx),
    plan:   () => planner(ctx, arg, render),
    fav:    () => views.favorites(ctx),
    mydata: () => views.mydata(ctx),
    admin:  () => views.admin(ctx),
  }[path] || (() => views.home(ctx));
  view.append(draw());
  drawTabs();
  if (sameRoute){
    window.scrollTo(0, keepY);
    // الصور والخرائط تُطوّل الصفحة بعد الرسم، فنثبّت الموضع مرة ثانية.
    requestAnimationFrame(() => window.scrollTo(0, keepY));
  } else window.scrollTo(0, 0);
  cloud.schedulePush();
}

async function boot(){
  // السحابة رفاهية لا شريان: تعثر استرجاع الحساب (مانع إضافات، تقطع شبكة،
  // خوادم جوجل) يجب ألا يُسقط الموقع — نواصل ضيفًا والمزامنة تلحق.
  try { await cloud.restore(); }
  catch (e) { console.warn("cloud restore failed — continuing offline:", e); }
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
    if (pending.type === "nav") location.hash = pending.hash;
    localStorage.removeItem("sv.pending");
  }
  window.addEventListener("hashchange", render);
  render();
}

boot().catch(e => {
  document.getElementById("view").replaceChildren(
    el("div.empty", {}, t("تعذر تحميل البيانات — أعد المحاولة. "), String(e)));
});
