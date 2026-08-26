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
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const KEYS = ["sv.prefs", "sv.shortlist", "sv.papers", "sv.trips"];
const STAMP = "sv.cloud.stamp";     // آخر لحظة تصالح فيها الجهاز مع السحابة

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
  const paperKey = d => d.bloc ? "bloc:" + d.bloc : (d.countryCode + ":" + (d.kind ?? ""));
  const sd = parse(cloudData["sv.papers"]), ld = parse(localData["sv.papers"]);
  if (sd || ld){
    const seen = new Map();
    for (const d of [...(sd ?? []), ...(ld ?? [])]) if (!seen.has(paperKey(d))) seen.set(paperKey(d), d);
    merged["sv.papers"] = JSON.stringify([...seen.values()]);
  }
  const st = parse(cloudData["sv.trips"]), lt = parse(localData["sv.trips"]);
  if (st || lt){
    const seen = new Map();
    for (const t of [...(st ?? []), ...(lt ?? [])]) if (!seen.has(t.id)) seen.set(t.id, t);
    merged["sv.trips"] = JSON.stringify([...seen.values()]);
  }

  merged.passport = cloudData.passport ?? localData.passport ?? null;
  if (!merged.passport) delete merged.passport;
  return merged;
}

async function push(){
  if (!user) return;
  // الدفع الآمن: من كتب بعدنا تُضم كتابته أولًا — لا محو بالتقادم.
  const snap = await getDoc(stateDoc(user.uid));
  const cloud = snap.exists() ? snap.data() : null;
  const localStamp = +(localStorage.getItem(STAMP) ?? 0);
  if (cloud && cloud.updatedAt > localStamp){
    writeLocal(union(cloud.data ?? {}, readLocal()));
  }
  const data = readLocal();
  const now = Date.now();
  await setDoc(stateDoc(user.uid), { data, updatedAt: now }, { merge: false });
  localStorage.setItem(STAMP, String(now));
}

/* التصالح عند فتح الصفحة أو أول دخول. يعيد true إن تغيّر المحلي. */
async function reconcile(firstLogin){
  const snap = await getDoc(stateDoc(user.uid));
  const cloud = snap.exists() ? snap.data() : null;
  const localStamp = +(localStorage.getItem(STAMP) ?? 0);

  if (firstLogin || !cloud){
    const merged = union(cloud?.data ?? {}, readLocal());
    writeLocal(merged);
    await push();
    return true;
  }
  if (cloud.updatedAt > localStamp){
    writeLocal(cloud.data ?? {});
    localStorage.setItem(STAMP, String(cloud.updatedAt));
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
        try { await reconcile(false); await reconcileMemory(false); }
        catch (e) { console.warn("sync:", e); }
      }
      resolve();
    }, () => resolve());
  });
}

async function signInWith(provider){
  const cred = await signInWithPopup(auth, provider);
  user = cred.user;
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
  await deleteDoc(stateDoc(user.uid));
  await deleteDoc(memoryDoc(user.uid));
  for (const k of KEYS) localStorage.removeItem(k);
  localStorage.removeItem(STAMP);
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
