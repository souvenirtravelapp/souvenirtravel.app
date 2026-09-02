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
import { getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup, signOut,
         onAuthStateChanged, deleteUser, linkWithPopup } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, addDoc, collection,
         getDocs, query, orderBy, limit, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const KEYS = ["sv.prefs", "sv.shortlist", "sv.papers", "sv.trips", "sv.tripsDel"];
const STAMP = "sv.cloud.stamp";     // آخر لحظة تصالح فيها الجهاز مع السحابة
const STATEIDS = "sv.cloud.stateids";    // آخر هويات معلومة وقت آخر مزامنة
const STATETOMBS = "sv.cloud.statetombs"; // شواهد حذف القلوب والأوراق

const paperKey = d => d.bloc ? "bloc:" + d.bloc : (d.countryCode + ":" + (d.kind ?? ""));

/* هويات ما يقبل الحذف في وثيقة التخطيط: قلب = h:معرف المدينة، ورقة = p:هويتها.
   الهوية هنا ثابتة (بخلاف رحلات الذاكرة ذات UUID)، فمن أعاد قلبًا محذوفًا
   أعاده بنفس الهوية — لذا الحضور المحلي لحظة الدفع يُسقط الشاهد: عودة مقصودة. */
function stateIdents(){
  const parse = s => { try { return JSON.parse(s); } catch { return null; } };
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
  const parse = s => { try { return JSON.parse(s); } catch { return null; } };
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
  const parse = s => { try { return JSON.parse(s); } catch { return null; } };

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

/* يُنتظر قبل بناء المخازن: يهيئ Firebase ويستعيد جلسة سابقة إن وُجدت. */
export function restore(){
  return new Promise(resolve => {
    try {
      const app = initializeApp(firebaseConfig);
      auth = getAuth(app);
      db = getFirestore(app);
    } catch (e){ resolve(); return; }
    const stop = onAuthStateChanged(auth, async u => {
      stop();
      user = u;
      if (u){
        try { await markSignup(false); await reconcile(false); await reconcileMemory(false); }
        catch (e) { console.warn("sync:", e); }
      }
      resolve();
    }, () => resolve());
  });
}

async function signInWith(provider){
  const cred = await signInWithPopup(auth, provider);
  user = cred.user;
  await markSignup(true);
  await reconcile(true);
  await reconcileMemory(true);
  location.reload();     // المخازن تُبنى من جديد على المحلي المتصالح
}

export function signIn(){ return signInWith(new GoogleAuthProvider()); }

export function signInApple(){
  const p = new OAuthProvider("apple.com");
  p.addScope("name"); p.addScope("email");
  return signInWith(p);
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
  const card = {
    name: user.displayName ?? "", email: user.email ?? "",
    photo: user.photoURL ?? "",
    providers: (user.providerData ?? []).map(p => p.providerId),
    lang: document.documentElement.lang || "ar",
    lastSeen: serverTimestamp(),
  };
  // أول مرة تُكتب مرة واحدة ولا تُلمس بعدها — وإلا صار «متى جاء» هو «متى عاد».
  if (firstLogin) card.firstSeen = serverTimestamp();
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
  await deleteDoc(stateDoc(user.uid));
  await deleteDoc(memoryDoc(user.uid));
  for (const k of KEYS) localStorage.removeItem(k);
  localStorage.removeItem(STAMP);
  localStorage.removeItem(STATEIDS);
  localStorage.removeItem(STATETOMBS);
  localStorage.removeItem(MEMKEY);
  localStorage.removeItem(MEMSTAMP);
  const f = JSON.parse(localStorage.getItem("sv.filter") ?? "{}");
  delete f.passport;
  localStorage.setItem("sv.filter", JSON.stringify(f));
  try { await deleteUser(user); }        // قد يطلب دخولًا حديثًا —
  catch { await signOut(auth); }         // فيكفي الخروج، والوثيقة قد مُحيت
  user = null;
  location.reload();
}

export async function signOutNow(){
  await signOut(auth);
  user = null;
  localStorage.removeItem(STAMP);   // نسخة الجهاز تبقى له؛ توقف المزامنة فقط
  localStorage.removeItem(MEMSTAMP);
  localStorage.removeItem(STATEIDS);
  localStorage.removeItem(STATETOMBS);
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
