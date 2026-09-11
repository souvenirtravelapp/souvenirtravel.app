// سحابة سوفينير: دخول جوجل ومزامنة Firestore.
//
// الفلسفة: الضيف كما هو — كل شيء على جهازه ولا سحابة أصلًا. من يدخل بحسابه
// تُحفظ مفضلته ورحلاته وأوراقه وتفضيلاته وجوازه في وثيقته هو
// (users/{uid}/sync/state) وتصله على أي جهاز.
//
// التوفيق بين جهازين: طابع updatedAt في السحابة مقابل طابع محلي لآخر
// مزامنة. أول دخول = اتحاد (لا يضيع شيء كان على الجهاز)؛ بعدها الأحدث
// كتابةً يغلب، فيسري حذف القلب من جهاز إلى بقية الأجهزة بدل أن يعود.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, initializeAuth, inMemoryPersistence, GoogleAuthProvider,
         OAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
         deleteUser, linkWithPopup, signInWithCredential }
  from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, initializeFirestore, doc, getDoc, setDoc, deleteDoc,
         addDoc, collection, getDocs, query, orderBy, limit, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const KEYS = ["sv.prefs", "sv.shortlist", "sv.papers", "sv.trips", "sv.tripsDel"];
const STAMP = "sv.cloud.stamp";     // آخر لحظة تصالح فيها الجهاز مع السحابة
const STATEIDS = "sv.cloud.stateids";    // آخر هويات معلومة وقت آخر مزامنة
const STATETOMBS = "sv.cloud.statetombs"; // شواهد حذف القلوب والأوراق

const paperKey = d => d.bloc ? "bloc:" + d.bloc : (d.countryCode + ":" + (d.kind ?? ""));

/* قراءة متسامحة: نصٌّ معطوب في التخزين يعود null لا استثناءً يوقف المصالحة. */
const parse = s => { try { return JSON.parse(s); } catch { return null; } };

/* هويات ما يقبل الحذف في وثيقة التخطيط: قلب = h:معرف المدينة، ورقة = p:هويتها.
   الهوية هنا ثابتة (بخلاف رحلات الذاكرة ذات UUID)، فمن أعاد قلبًا محذوفًا
   أعاده بنفس الهوية — لذا الحضور المحلي لحظة الدفع يُسقط الشاهد: عودة مقصودة. */
function stateIdents(){
  const ids = new Set();
  for (const id of parse(localStorage.getItem("sv.shortlist"))?.ids ?? []) ids.add("h:" + id);
  for (const d of parse(localStorage.getItem("sv.papers")) ?? []) ids.add("p:" + paperKey(d));
  return ids;
}

function stateTombs(){
  try { return JSON.parse(localStorage.getItem(STATETOMBS)) ?? {}; } catch { return {}; }
}

/* ما كان معلومًا آخر مزامنة وغاب الآن حُذف محليًا — يوسم قبل أي دفع. */
function harvestState(){
  let known; try { known = JSON.parse(localStorage.getItem(STATEIDS)) ?? []; } catch { known = []; }
  if (!known.length) return;
  const current = stateIdents(), tombs = stateTombs(), now = Date.now();
  let changed = false;
  for (const id of known) if (!current.has(id)){ tombs[id] = now; changed = true; }
  if (changed) localStorage.setItem(STATETOMBS, JSON.stringify(tombs));
}

/* يدفن محليًا كل قلب أو ورقة موسومة — الشواهد تنفذ مهما قالت الطوابع. */
function buryState(tombs){
  if (!Object.keys(tombs).length) return;
  const sl = parse(localStorage.getItem("sv.shortlist"));
  if (sl){
    sl.ids = (sl.ids ?? []).filter(id => !tombs["h:" + id]);
    sl.months = Object.fromEntries(
      Object.entries(sl.months ?? {}).filter(([id]) => !tombs["h:" + id]));
    localStorage.setItem("sv.shortlist", JSON.stringify(sl));
  }
  const papers = parse(localStorage.getItem("sv.papers"));
  if (papers) localStorage.setItem("sv.papers",
    JSON.stringify(papers.filter(d => !tombs["p:" + paperKey(d)])));
}

let auth = null, db = null;
export let user = null;

function stateDoc(uid){ return doc(db, "users", uid, "sync", "state"); }

function readLocal(){
  const data = {};
  for (const k of KEYS){
    const raw = localStorage.getItem(k);
    if (raw != null) data[k] = raw;
  }
  const filter = JSON.parse(localStorage.getItem("sv.filter") ?? "{}");
  if (filter.passport) data.passport = filter.passport;
  return data;
}

function writeLocal(data){
  for (const k of KEYS){
    if (data[k] != null) localStorage.setItem(k, data[k]);
  }
  if (data.passport){
    const filter = JSON.parse(localStorage.getItem("sv.filter") ?? "{}");
    filter.passport = data.passport;
    localStorage.setItem("sv.filter", JSON.stringify(filter));
  }
}

/* أول دخول: اتحادٌ لا استبدال — ما على الجهاز ينضم لما في السحابة. */
function union(cloudData, localData){
  const merged = { ...cloudData };

  const sl = parse(cloudData["sv.shortlist"]), ll = parse(localData["sv.shortlist"]);
  if (sl || ll){
    merged["sv.shortlist"] = JSON.stringify({
      ids: [...new Set([...(sl?.ids ?? []), ...(ll?.ids ?? [])])],
      months: { ...(ll?.months ?? {}), ...(sl?.months ?? {}) },
    });
  }

  const sp = parse(cloudData["sv.prefs"]), lp = parse(localData["sv.prefs"]);
  if (sp || lp){
    const u = k => [...new Set([...(sp?.[k] ?? []), ...(lp?.[k] ?? [])])].sort();
    merged["sv.prefs"] = JSON.stringify(
      { tags: u("tags"), bands: u("bands"), rain: u("rain"), airports: u("airports") });
  }

  // الأوراق والرحلات: قوائم — الاتحاد بهوية العنصر.
  const sd = parse(cloudData["sv.papers"]), ld = parse(localData["sv.papers"]);
  if (sd || ld){
    const seen = new Map();
    for (const d of [...(sd ?? []), ...(ld ?? [])]) if (!seen.has(paperKey(d))) seen.set(paperKey(d), d);
    merged["sv.papers"] = JSON.stringify([...seen.values()]);
  }
  // الرحلات: اتحادٌ ثم الأحدث يفوز، وشواهد الحذف تمنع عودة المحذوف.
  // الأول-يفوز كان يبتلع خطة كتبتها على جهاز إن حملت السحابة نسخة أقدم.
  const st = parse(cloudData["sv.trips"]), lt = parse(localData["sv.trips"]);
  const sdel = parse(cloudData["sv.tripsDel"]) ?? {};
  const ldel = parse(localData["sv.tripsDel"]) ?? {};
  const del = { ...sdel };
  for (const [id, at] of Object.entries(ldel))
    if (!del[id] || at > del[id]) del[id] = at;
  if (st || lt){
    const seen = new Map();
    for (const t of [...(st ?? []), ...(lt ?? [])]){
      const cur = seen.get(t.id);
      if (!cur || (t.updatedAt || "") > (cur.updatedAt || "")) seen.set(t.id, t);
    }
    const kept = [...seen.values()]
      .filter(t => !(del[t.id] && del[t.id] > (t.updatedAt || "")));
    merged["sv.trips"] = JSON.stringify(kept);
  }
  if (Object.keys(del).length) merged["sv.tripsDel"] = JSON.stringify(del);

  merged.passport = cloudData.passport ?? localData.passport ?? null;
  if (!merged.passport) delete merged.passport;
  return merged;
}

async function push(){
  if (!user) return;
  harvestState();
  // الدفع الآمن: من كتب بعدنا تُضم كتابته أولًا — لا محو بالتقادم.
  const snap = await getDoc(stateDoc(user.uid));
  const cloud = snap.exists() ? snap.data() : null;
  const tombs = { ...(cloud?.deleted ?? {}), ...stateTombs() };
  buryState(tombs);
  const localStamp = +(localStorage.getItem(STAMP) ?? 0);
  if (cloud && cloud.updatedAt > localStamp){
    writeLocal(union(cloud.data ?? {}, readLocal()));
    buryState(tombs);   // الاتحاد قد يعيد ما دُفن من نسخة السحابة
  }
  // الحاضر الآن رغم شاهده عاد بيد المستخدم — الشاهد يسقط ويعيش القلب.
  const present = stateIdents();
  for (const id of Object.keys(tombs)) if (present.has(id)) delete tombs[id];
  const data = readLocal();
  const now = Date.now();
  await setDoc(stateDoc(user.uid), { data, deleted: tombs, updatedAt: now }, { merge: false });
  localStorage.setItem(STAMP, String(now));
  localStorage.setItem(STATEIDS, JSON.stringify([...stateIdents()]));
  localStorage.setItem(STATETOMBS, JSON.stringify(tombs));
}

/* التصالح عند فتح الصفحة أو أول دخول. يعيد true إن تغيّر المحلي. */
async function reconcile(firstLogin){
  harvestState();
  const snap = await getDoc(stateDoc(user.uid));
  const cloud = snap.exists() ? snap.data() : null;
  const cloudDeleted = cloud?.deleted ?? {};
  const unpushed = Object.keys(stateTombs()).some(k => !cloudDeleted[k]);
  const tombs = { ...cloudDeleted, ...stateTombs() };
  localStorage.setItem(STATETOMBS, JSON.stringify(tombs));
  const localStamp = +(localStorage.getItem(STAMP) ?? 0);

  if (firstLogin || !cloud){
    const merged = union(cloud?.data ?? {}, readLocal());
    writeLocal(merged);
    buryState(tombs);
    await push();
    return true;
  }
  if (cloud.updatedAt > localStamp){
    writeLocal(cloud.data ?? {});
    buryState(tombs);   // شواهدنا التي لم تركب السحابة بعد تبقى نافذة
    localStorage.setItem(STAMP, String(cloud.updatedAt));
    localStorage.setItem(STATEIDS, JSON.stringify([...stateIdents()]));
    if (unpushed) await push();   // ليصل حذفنا بقية الأجهزة
    return true;
  }
  await push();          // المحلي أحدث — ارفعه
  return false;
}

/* جسر الغلاف: تطبيق الهاتف يدخل بجوجل أصيلًا (OAuth الويب محظور داخل
   WebView) ويسلّم اعتماده هنا. الدخول به يمر بنفس مسار المصالحة الأول
   للدخول العادي — فلا كتابة فوق بيانات السحابة بغير اتحاد. إن نجح أعيد
   تحميل الصفحة مرة واحدة لتُبنى المخازن على المحلي المتصالح؛ وعلامة
   sessionStorage تمنع أي دوران إن لم تنجُ الجلسة من الإعادة. */
let bridging = false;

/* أثرٌ يصل سجلَّ الغلاف وحده — لا شيء منه في المتصفح العادي. */
function svTrace(m){
  try { if (window.__souvenirWrapper) webkit.messageHandlers.svlog.postMessage("bridge: " + m); }
  catch (e) {}
}
/* سقفٌ لكل خطوة: وعدٌ لا يجيب في مهلته يُرفض — فلا يعلّق الإقلاع أبدًا. */
function bounded(p, ms, label){
  return Promise.race([p, new Promise((_, rej) =>
    setTimeout(() => rej(new Error("timeout: " + label)), ms))]);
}

async function signInNative(a){
  if (!auth || !a || !a.idToken || auth.currentUser) return;
  bridging = true;
  svTrace("credential…");
  const credential = a.provider === "apple"
    ? new OAuthProvider("apple.com").credential({ idToken: a.idToken, rawNonce: a.rawNonce })
    : GoogleAuthProvider.credential(a.idToken, a.accessToken || null);
  const cred = await bounded(signInWithCredential(auth, credential),
    10000, "signInWithCredential");
  user = cred.user;
  enterAccount(user.uid);
  svTrace("signed in, reconciling…");
  try {
    await bounded(markSignup(true), 10000, "markSignup");
    await bounded(reconcile(true), 25000, "reconcile");
    await bounded(reconcileMemory(true), 25000, "reconcileMemory");
    await pullProfile();
  } catch (e){
    // مزامنة أولى لم تكتمل: نتراجع ضيوفًا هذه الجلسة — لا كتابة على
    // السحابة بلا مصالحة أولى. الدخول يبقى محفوظًا للأصيل.
    user = null; bridging = false;
    svTrace("sync failed: " + e.message);
    throw e;
  }
  bridging = false;
  svTrace("done");
  if (!sessionStorage.getItem("sv.bridge.reloaded")){
    sessionStorage.setItem("sv.bridge.reloaded", "1");
    location.reload();
  }
}
if (typeof window !== "undefined")
  window.__souvenirNativeSignIn = a =>
    signInNative(a).then(
      () => { if (!user) return; },
      e => { bridging = false; console.warn("wrapper sign-in:", e); });

/* يُنتظر قبل بناء المخازن: يهيئ Firebase ويستعيد جلسة سابقة إن وُجدت. */
export async function restore(){
  try {
    const app = initializeApp(firebaseConfig);
    // ثبات جلسة Auth يقوم على indexedDB، وهو معطوب تحت مخطط الغلاف
    // فتعلّق كل عمليات Auth خلف تهيئةٍ لا تكتمل. ذاكرة صريحة هناك —
    // والجسر يعيد الدخول كل إقلاع فلا يُحتاج الثبات أصلًا.
    auth = (typeof window !== "undefined" && window.__souvenirWrapper)
      ? initializeAuth(app, { persistence: inMemoryPersistence })
      : getAuth(app);
    // قنوات Firestore البثية تعلّق داخل أغلفة WebView — الاستقصاء الطويل
    // بديلها المعتمد هناك، والمتصفح العادي على حاله.
    db = (typeof window !== "undefined" && window.__souvenirWrapper)
      ? initializeFirestore(app, { experimentalForceLongPolling: true })
      : getFirestore(app);
  } catch (e){ return; }

  // في الغلاف: الأصيل يسلّم اعتماده عبر وعدٍ يُزرع قبل أي وحدة — فننتظره
  // هنا (بسقف قصير) قبل أن نقرر أننا ضيوف. هذا يقطع سباق «التسليم قبل
  // ولادة الدالة» الذي يضيع فيه الاعتماد بصمت.
  let nat = typeof window !== "undefined" ? window.__souvenirNativeAuth : null;
  if (!nat && typeof window !== "undefined" && window.__souvenirWrapper
      && window.__souvenirNativeAuthPromise){
    nat = await Promise.race([
      window.__souvenirNativeAuthPromise,
      new Promise(r => setTimeout(() => r(null), 3000)),
    ]);
  }
  svTrace("restore: native=" + !!(nat && nat.idToken));
  if (nat && nat.idToken && !auth.currentUser){
    try {
      await signInNative(nat);
      // نجح بلا إعادة تحميل (الجلسة نجت أو العلامة قائمة): المصالحة تمت
      // داخل signInNative — لا حاجة لانتظار البث.
      if (user) return;
    } catch (e){ bridging = false; console.warn("wrapper sign-in:", e); }
  }

  // «رفاهية لا شريان» تشمل التعليق لا الفشل وحده: شبكة خانقة، مانع
  // إضافات، أو بيئة لا يجيب فيها onAuthStateChanged — خمس ثوانٍ ثم نمضي
  // ضيوفًا، والمستمع لا يُغلق عند المهلة: دخول متأخر يمرّ بمصالحته كاملة.
  return new Promise(resolve => {
    setTimeout(resolve, 5000);
    const stop = onAuthStateChanged(auth, async u => {
      if (!u && bridging) return;   // جسرٌ في الطريق — البث التالي يحمل صاحبه
      stop();
      user = u;
      if (u){
        enterAccount(u.uid);
        try { await markSignup(false); await reconcile(false); await reconcileMemory(false);
              await pullProfile(); }
        catch (e) { console.warn("sync:", e); }
      }
      resolve();
    }, () => resolve());
  });
}

async function signInWith(provider){
  const cred = await signInWithPopup(auth, provider);
  user = cred.user;
  enterAccount(user.uid);
  await markSignup(true);
  await reconcile(true);
  await reconcileMemory(true);
  await pullProfile();
  location.reload();     // المخازن تُبنى من جديد على المحلي المتصالح
}

/* جسر iOS: لا Capacitor هناك — التخاطب عبر webkit.messageHandlers.svauth
   بنداءٍ ذي معرّف يردّ عليه الأصيل بحلّ الوعد أو رفضه. الدخول التفاعلي
   والخروج كلاهما جولة ذهابٍ وإياب هنا، فيُخرج الأصيل جلسته لا Firebase
   وحده. */
function iosAuth(){
  return (typeof window !== "undefined" && window.webkit
    && window.webkit.messageHandlers && window.webkit.messageHandlers.svauth)
    ? window.webkit.messageHandlers.svauth : null;
}
if (typeof window !== "undefined"){
  window.__svAuthCbs = window.__svAuthCbs || {};
  window.__svAuthResolve = (id, payload) => {
    const c = window.__svAuthCbs[id];
    if (c){ delete window.__svAuthCbs[id]; c.resolve(payload); }
  };
  window.__svAuthReject = (id, msg) => {
    const c = window.__svAuthCbs[id];
    if (c){ delete window.__svAuthCbs[id]; c.reject(new Error(msg || "native auth failed")); }
  };
}
let svAuthSeq = 0;
function iosAuthCall(action){
  const h = iosAuth();
  return new Promise((resolve, reject) => {
    const id = "svauth" + (++svAuthSeq);
    window.__svAuthCbs[id] = { resolve, reject };
    h.postMessage({ action, id });
  });
}

export async function signIn(){
  // في الغلاف: النافذة المنبثقة محكوم عليها بانفصال التخزين — فيتولى
  // الأصيل جلب الاعتماد، ويمضي به نفس مسار الجسر المشترك بمصالحته.
  const p = typeof window !== "undefined" && window.__souvenirWrapper
    && window.Capacitor && window.Capacitor.Plugins
    && window.Capacitor.Plugins.SouvenirAuth;
  if (p || iosAuth()){
    const r = p ? await p.signIn() : await iosAuthCall("signIn");
    if (!r || !r.idToken) throw new Error("native sign-in returned no credential");
    // علامة «أُعيد الإقلاع» تحرس حلقة الإقلاع الصامت وحدها — الدخول
    // التفاعلي (وتبديل الحساب) يستحق إعادةَ بنائه دائمًا.
    try { sessionStorage.removeItem("sv.bridge.reloaded"); } catch (e) {}
    return window.__souvenirNativeSignIn(r);
  }
  return signInWith(new GoogleAuthProvider());
}

export async function signInApple(){
  // في الغلاف: المنبثق محجوب بانفصال التخزين — الأصيل يجلب اعتماد أبل
  // (idToken + rawNonce) ويمضي به نفس مسار الجسر المشترك بمصالحته.
  const p = typeof window !== "undefined" && window.__souvenirWrapper
    && window.Capacitor && window.Capacitor.Plugins
    && window.Capacitor.Plugins.SouvenirAuth;
  if (p && p.signInApple){
    const r = await p.signInApple();
    if (!r || !r.idToken) throw new Error("native apple sign-in returned no credential");
    try { sessionStorage.removeItem("sv.bridge.reloaded"); } catch (e) {}
    return window.__souvenirNativeSignIn({ ...r, provider: "apple" });
  }
  const prov = new OAuthProvider("apple.com");
  prov.addScope("name"); prov.addScope("email");
  return signInWith(prov);
}


/* ── سجل المسجّلين وبريد الملاحظات ──
   حتى الآن لم يكن للدخول أثر: وثيقة المزامنة تحمل رحلات صاحبها ولا تقول
   لطارق أن أحدًا جاء. صار للتيكتوك جمهور، فصار للوصول أثرٌ يُقرأ:
   signups/{uid} سطرٌ واحد لكل من دخل — أول مرة، وآخر مرة، وبأي حساب.
   لا يُكتب فيه ما لا يظهر لصاحبه في «بياناتي»، ويُمحى معها. */

const ADMINS = ["tariqmalki@gmail.com", "souvenirtravelapp@gmail.com"];
export function isAdmin(){ return !!user && ADMINS.includes(user.email || ""); }

function signupDoc(uid){ return doc(db, "signups", uid); }

async function markSignup(firstLogin){
  if (!user) return;
  // «أول مرة» ليست لحظة كتابة هذا السطر بل لحظة إنشاء الحساب، وفايربيس
  // يحملها منذ اليوم الأول (metadata.creationTime). نأخذها منه لا من ساعتنا،
  // فيصحّ سطر من سجّل قبل أن يوجد هذا السجل — بمجرد عودته.
  const ms = v => { const t = Date.parse(v ?? ""); return Number.isNaN(t) ? null : t; };
  const created = ms(user.metadata?.creationTime);
  const card = {
    name: user.displayName ?? "", email: user.email ?? "",
    photo: user.photoURL ?? "",
    providers: (user.providerData ?? []).map(p => p.providerId),
    lang: document.documentElement.lang || "ar",
    lastSeen: serverTimestamp(),
  };
  if (created) card.createdAt = created;
  // الطابع الخادمي يبقى للدخول الجديد وحده حين لا يعطينا فايربيس تاريخًا.
  if (firstLogin && !created) card.firstSeen = serverTimestamp();
  try { await setDoc(signupDoc(user.uid), card, { merge: true }); }
  catch (e){ console.warn("signup:", e); }
}

/* ملاحظة من مسجَّل: نصّه وهويته ولحظته. لا يقرؤها إلا هو وطارق. */
export async function sendFeedback(text){
  if (!user) throw new Error("no-user");
  const body = String(text ?? "").trim().slice(0, 4000);
  if (!body) throw new Error("empty");
  await addDoc(collection(db, "feedback"), {
    uid: user.uid, name: user.displayName ?? "", email: user.email ?? "",
    text: body, lang: document.documentElement.lang || "ar",
    page: location.hash || "#/home", when: serverTimestamp(),
  });
}

/* لوحة طارق: من سجّل وماذا قالوا. القواعد تحرسها، والواجهة تخفيها. */
export async function listSignups(max = 200){
  const snap = await getDocs(query(collection(db, "signups"),
                                   orderBy("lastSeen", "desc"), limit(max)));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function listFeedback(max = 200){
  const snap = await getDocs(query(collection(db, "feedback"),
                                   orderBy("when", "desc"), limit(max)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ── وثيقة الذاكرة (docs/SyncContract.md §4): رحلات سابقة ورفقاء ── */

const MEMKEY = "sv.memory";
const MEMSTAMP = "sv.cloud.memstamp";

function memoryDoc(uid){ return doc(db, "users", uid, "sync", "memory"); }

function readMem(){
  try {
    const raw = JSON.parse(localStorage.getItem(MEMKEY));
    return { trips: raw?.trips ?? [], companions: raw?.companions ?? [],
             deleted: raw?.deleted ?? {} };
  } catch { return { trips: [], companions: [], deleted: {} }; }
}

function writeMem(data){
  localStorage.setItem(MEMKEY, JSON.stringify(
    { trips: data?.trips ?? [], companions: data?.companions ?? [],
      deleted: data?.deleted ?? {} }));
}

function unionMem(cloudData, local){
  // شواهد الحذف أولًا: الغياب الموسوم مقصود، فلا يُبعث من الدمج.
  const deleted = { ...(cloudData?.deleted ?? {}), ...(local.deleted ?? {}) };
  const merge = key => {
    const seen = new Map();
    for (const item of [...(cloudData?.[key] ?? []), ...(local[key] ?? [])])
      if (item?.id && !deleted[item.id] && !seen.has(item.id))
        seen.set(item.id, item);
    return [...seen.values()];
  };
  return { trips: merge("trips"), companions: merge("companions"), deleted };
}

async function pushMemory(){
  if (!user) return;
  const snap = await getDoc(memoryDoc(user.uid));
  const cloudData = snap.exists() ? snap.data() : null;
  const localStamp = +(localStorage.getItem(MEMSTAMP) ?? 0);
  if (cloudData && cloudData.updatedAt > localStamp){
    writeMem(unionMem(cloudData, readMem()));
  } else if (cloudData?.deleted){
    // شواهد السحابة تنفذ مهما قالت الطوابع — ساعات الأجهزة تتسابق،
    // والحذف لا يُهزم بسباق: تُدمج الخريطتان ويُدفن الموسوم قبل الدفع.
    const local = readMem();
    const deleted = { ...cloudData.deleted, ...local.deleted };
    writeMem({ trips: local.trips.filter(t => !deleted[t.id]),
               companions: local.companions.filter(c => !deleted[c.id]),
               deleted });
  }
  const now = Date.now();
  await setDoc(memoryDoc(user.uid), { ...readMem(), updatedAt: now }, { merge: false });
  localStorage.setItem(MEMSTAMP, String(now));
}

/* ── وثيقة الصورة (اعتماد طارق 2026-09-11): الصورة المختارة في التطبيق
   تُرفع من iOS إلى `users/{uid}/sync/profile` ({photo, updatedAt} —
   ‏JPEG ‏~256px بسقف ~100KB يفرضه الرافع)، وتسبق صورة مزوّد الدخول في كل
   الطبقات؛ صورة Google احتياطٌ عند غيابها فقط. مرآتها المحلية sv.profile
   كي يرسم الوجه فورًا عند الإقلاع لا بعد جولة شبكة. */
const PROFILEKEY = "sv.profile";
function profileDoc(uid){ return doc(db, "users", uid, "sync", "profile"); }

/// صورة الحساب كما تُعرض: المختارة إن وُجدت، وإلا صورة مزوّد الدخول.
export function accountPhoto(){
  const p = parse(localStorage.getItem(PROFILEKEY));
  return p?.photo || user?.photoURL || null;
}

/// يجلب وثيقة الصورة ويحدّث المرآة — يعيد true إن تغيّرت.
async function pullProfile(){
  if (!user) return false;
  try {
    const snap = await bounded(getDoc(profileDoc(user.uid)), 10000, "profile");
    const data = snap.exists() ? snap.data() : null;
    const now = data?.photo
      ? JSON.stringify({ photo: data.photo, updatedAt: data.updatedAt ?? 0 })
      : null;
    const was = localStorage.getItem(PROFILEKEY);
    if (now === was) return false;
    if (now) localStorage.setItem(PROFILEKEY, now);
    else localStorage.removeItem(PROFILEKEY);
    return true;
  } catch (e){ console.warn("profile:", e); return false; }
}

/* سحبٌ عند العودة (اعتماد طارق 2026-09-11): المصالحة تجري عند الإقلاع
   وحده، فمن عاد للتبويب أو أعاد التطبيق للمقدمة كان يحتاج رفرشًا ليرى ما
   استجد من أجهزته الأخرى. تنادى من مستمع visibilitychange في app.js،
   وتعيد true إن تغيّر المحلي فيُعاد الرسم — وإلا فلا رسم تحت يد المستخدم.
   حارسان: لا سحب فوق سحب، ولا سحب قبل عشرين ثانية من سابقه. */
let pulling = false, lastPull = 0;
export async function pullOnReturn(){
  svTrace("pull: visible");
  if (!user || pulling || Date.now() - lastPull < 20000) return false;
  pulling = true;
  try {
    const memBefore = localStorage.getItem(MEMKEY) ?? "";
    const changed = await bounded(reconcile(false), 25000, "pull reconcile");
    await bounded(reconcileMemory(false), 25000, "pull memory");
    const photoChanged = await pullProfile();
    return changed || photoChanged
      || (localStorage.getItem(MEMKEY) ?? "") !== memBefore;
  } catch (e){
    console.warn("pull-on-return:", e);
    return false;
  } finally {
    pulling = false;
    lastPull = Date.now();
  }
}

async function reconcileMemory(firstLogin){
  const snap = await getDoc(memoryDoc(user.uid));
  const cloudData = snap.exists() ? snap.data() : null;
  const localStamp = +(localStorage.getItem(MEMSTAMP) ?? 0);
  if (firstLogin || !cloudData){
    writeMem(unionMem(cloudData, readMem()));
    await pushMemory();
  } else if (cloudData.updatedAt > localStamp){
    // السحابة مصدر المحتوى، وشواهد الحذف المحلية غير المدفوعة تبقى نافذة.
    writeMem(unionMem(cloudData, { trips: [], companions: [], deleted: readMem().deleted }));
    localStorage.setItem(MEMSTAMP, String(cloudData.updatedAt));
  } else {
    await pushMemory();
  }
}

let memTimer = null, lastMemPushed = "";
export function scheduleMemoryPush(){
  if (!user) return;
  clearTimeout(memTimer);
  memTimer = setTimeout(() => {
    const now = JSON.stringify(readMem());
    if (now === lastMemPushed) return;
    lastMemPushed = now;
    pushMemory().catch(e => console.warn("memory sync:", e));
  }, 2000);
}

/* أبواب الحساب: مزوّد واحد أو أكثر لنفس الهوية — جوجل وأبل معًا. */
export function providers(){
  return (user?.providerData ?? []).map(d => d.providerId);
}

export async function linkProvider(name){
  const p = name === "apple" ? new OAuthProvider("apple.com") : new GoogleAuthProvider();
  if (name === "apple"){ p.addScope("name"); p.addScope("email"); }
  await linkWithPopup(auth.currentUser, p);
  location.reload();
}

/* المحو الذاتي: وثيقته من السحابة، وآثارها من الجهاز، وحسابه إن أمكن. */
export async function eraseMyData(){
  if (!user) return;
  // سطر السجل يُمحى مع البيانات: من محا حسابه لا يبقى له أثر في لوحة الإدارة.
  try { await deleteDoc(signupDoc(user.uid)); } catch (e) { console.warn("signup:", e); }
  try { await deleteDoc(profileDoc(user.uid)); } catch (e) { console.warn("profile:", e); }
  await deleteDoc(stateDoc(user.uid));
  await deleteDoc(memoryDoc(user.uid));
  for (const k of KEYS) localStorage.removeItem(k);
  localStorage.removeItem(STAMP);
  localStorage.removeItem(STATEIDS);
  localStorage.removeItem(STATETOMBS);
  localStorage.removeItem(MEMKEY);
  localStorage.removeItem(MEMSTAMP);
  localStorage.removeItem(PROFILEKEY);
  const f = JSON.parse(localStorage.getItem("sv.filter") ?? "{}");
  delete f.passport;
  localStorage.setItem("sv.filter", JSON.stringify(f));
  try { await deleteUser(user); }        // قد يطلب دخولًا حديثًا —
  catch { await signOut(auth); }         // فيكفي الخروج، والوثيقة قد مُحيت
  user = null;
  location.reload();
}

/* خزائن الحسابات: عند الخروج تُنقل نسخة الجهاز إلى خزانة صاحبها
   (sv.vault.<uid>) وتُفرَّغ الساحة — فلا يرث حسابٌ بقايا سابقه ولا
   تُرفع رحلات أحد إلى سحابة غيره. عند عودته تُفتح خزانته وتُضم بالاتحاد
   إلى ما جمعه ضيفٌ بعده، ثم تمضي مصالحته المعتادة. نقلٌ لا حذف. */
const VAULT = "sv.vault.";
const VAULT_KEYS = [...KEYS, "sv.filter", MEMKEY];

function stashVault(uid){
  const blob = {};
  for (const k of VAULT_KEYS){
    const raw = localStorage.getItem(k);
    if (raw != null){ blob[k] = raw; localStorage.removeItem(k); }
  }
  if (Object.keys(blob).length)
    localStorage.setItem(VAULT + uid, JSON.stringify(blob));
}

const OWNER = "sv.owner";   // uid صاحب بيانات الساحة الآن — يمنع الميراث

/* يُنادى فور نجاح أي دخول وقبل أي مصالحة: إن كانت الساحة لمالك سابق
   لم يخرج (تبديل حساب أصيل بلا خروج) عُزلت ساحته إلى خزانته أولًا،
   فلا يرث الداخل رحلات غيره ولا تُرفع إلى سحابته. ثم تُفتح خزانة
   الداخل إن وُجدت. نقلٌ لا حذف. */
function enterAccount(uid){
  const prev = localStorage.getItem(OWNER);
  if (prev && prev !== uid) stashVault(prev);
  localStorage.setItem(OWNER, uid);
  restoreVault(uid);
}

function restoreVault(uid){
  let blob;
  try { blob = JSON.parse(localStorage.getItem(VAULT + uid)); } catch { return; }
  if (!blob) return;
  writeLocal(union(blob, readLocal()));
  // الذاكرة والفلتر خارج عهدة union: تعودان إن كانت الساحة خالية،
  // وما زامنته السحابة يلحق عبر مصالحتيهما على كل حال.
  for (const k of ["sv.filter", MEMKEY])
    if (blob[k] != null && localStorage.getItem(k) == null)
      localStorage.setItem(k, blob[k]);
  localStorage.removeItem(VAULT + uid);
}

export async function signOutNow(){
  // في الغلاف يُخرَج الأصيل أولًا — وفشلُه يوقفنا هنا صادقين: لا إعلان
  // خروج وجلسة Google حيّة تعيد صاحبها عند أول إقلاع.
  const p = typeof window !== "undefined" && window.__souvenirWrapper
    && window.Capacitor && window.Capacitor.Plugins
    && window.Capacitor.Plugins.SouvenirAuth;
  if (p && p.signOut) await p.signOut();
  else if (iosAuth()) await iosAuthCall("signOut");
  const uid = user && user.uid;
  await signOut(auth);
  user = null;
  if (uid) stashVault(uid);
  try { sessionStorage.removeItem("sv.bridge.reloaded"); } catch (e) {}
  localStorage.removeItem(OWNER);
  localStorage.removeItem(STAMP);
  localStorage.removeItem(MEMSTAMP);
  localStorage.removeItem(STATEIDS);
  localStorage.removeItem(STATETOMBS);
  localStorage.removeItem(PROFILEKEY);   // الصورة للحساب لا للجهاز
  location.reload();
}

/* يُستدعى بعد كل رسم — يدفع التغييرات بهدوء بعد سكونها. */
let timer = null, lastPushed = "";
export function schedulePush(){
  if (!user) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const now = JSON.stringify(readLocal());
    if (now === lastPushed) return;
    lastPushed = now;
    push().catch(e => console.warn("sync:", e));
  }, 2000);
}
