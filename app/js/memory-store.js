// ذاكرة الرحلات على الويب — مرآة محلية لوثيقة `memory` في الحساب
// (docs/SyncContract.md §4). الرحلات السابقة والرفقاء؛ سجلات بلا صور.
//
// المرآة في localStorage تحت sv.memory؛ المزامنة شأن cloud.js — المخزن
// هنا يقرأ ويكتب المرآة ويطلب دفعة هادئة بعد كل حفظ.

import * as cloud from "./cloud.js";

const KEY = "sv.memory";

function read(){
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return { trips: raw?.trips ?? [], companions: raw?.companions ?? [],
             deleted: raw?.deleted ?? {} };
  } catch { return { trips: [], companions: [], deleted: {} }; }
}

function write(data){
  localStorage.setItem(KEY, JSON.stringify(
    { trips: data.trips ?? [], companions: data.companions ?? [],
      deleted: data.deleted ?? {} }));
  cloud.scheduleMemoryPush();
}

const uuid = () => crypto.randomUUID().toUpperCase();

export const Memory = {
  get data(){ return read(); },
  get trips(){
    return read().trips.slice()
      .sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  },
  get companions(){
    return read().companions.slice()
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  },

  companion(id){ return read().companions.find(c => c.id === id); },

  addTrip(trip){
    const data = read();
    data.trips.push({ id: uuid(), status: "confirmed", hiddenByUser: false,
                      source: "manual", notes: "", places: [],
                      companionIds: [], ...trip });
    write(data);
  },
  removeTrip(id){
    const data = read();
    data.trips = data.trips.filter(t => t.id !== id);
    data.deleted[id] = Date.now();   // شاهد حذف — الغياب مقصود لا سهو
    write(data);
  },

  addCompanion(name, relation = ""){
    const data = read();
    const made = { id: uuid(), name, emoji: "🙂", relation };
    data.companions.push(made);
    write(data);
    return made;
  },
  removeCompanion(id){
    const data = read();
    data.companions = data.companions.filter(c => c.id !== id);
    data.deleted[id] = Date.now();
    for (const t of data.trips)
      t.companionIds = (t.companionIds ?? []).filter(c => c !== id);
    write(data);
  },

  /// إحصاءات البيت الثلاث — كما في رئيسية التطبيق.
  get stats(){
    const trips = read().trips;
    const places = new Set(), countries = new Set();
    for (const t of trips){
      if (t.countryIso) countries.add(t.countryIso);
      for (const p of t.places ?? []){
        places.add(p.name + ":" + (p.countryIso ?? ""));
        if (p.countryIso) countries.add(p.countryIso);
      }
    }
    return { trips: trips.length, places: places.size, countries: countries.size };
  },
};
