// Upcoming trips, kept on this device. The iOS app's past trips and photo
// scanning deliberately do not exist here — Tariq's line for the web: all of
// Souvenir except reading trips out of photographs and the past. What remains
// is the forward half: trips you are planning, entered by hand.
const KEY = "sv.trips";

function read(){
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}
function write(list){ localStorage.setItem(KEY, JSON.stringify(list)); }

// شواهد الحذف: رحلة حُذفت هنا يجب ألا تعود من السحابة — كما في الذاكرة.
const DEL = "sv.tripsDel";
function readDel(){
  try { return JSON.parse(localStorage.getItem(DEL)) || {}; }
  catch { return {}; }
}
const stamp = () => new Date().toISOString();

export const Trips = {
  /// بالتاريخ، والرحلة بلا تاريخ في الآخر (حكم طارق 2026-09-02).
  /// السلسلة الفارغة تسبق كل تاريخ في المقارنة، فكانت رحلة لم تُؤرَّخ بعد
  /// تتصدّر رحلةً تسافر إليها الأسبوع القادم — والقائمة تسلسلٌ زمني، ومن لا
  /// تاريخ له لا موضع له فيه إلا آخره.
  all(){
    return read().sort((a, b) => {
      const x = a.start || "", y = b.start || "";
      if (x && y) return x.localeCompare(y);
      return x ? -1 : (y ? 1 : 0);
    });
  },
  /// القادمة: ما لم يمضِ آخر يوم فيها — والرحلة بلا تواريخ منها.
  /// زر «لدي رحلة قادمة لهذه المدينة» يُنشئ الرحلة بلا تاريخ، فكانت تسقط من
  /// «رحلاتك القادمة» ومن رفّ الرئيسية ومن قائمة الضمّ معًا: رحلةٌ بدأها
  /// صاحبها ولا يجدها إلا برابط خطتها. (حكم طارق 2026-09-02)
  upcoming(){
    const today = new Date().toISOString().slice(0, 10);
    return this.all().filter(t => {
      const last = t.end || t.start || "";
      return last ? last >= today : true;
    });
  },
  add(trip){
    const list = read();
    trip.id = "t" + Date.now();
    trip.updatedAt = stamp();
    list.push(trip);
    write(list);
    return trip.id;
  },
  remove(id){
    write(read().filter(t => t.id !== id));
    const del = readDel(); del[id] = stamp();
    localStorage.setItem(DEL, JSON.stringify(del));
  },
  /// تعديل رحلة في مكانها — المخطط يكتب خطته هنا فتُحفظ مع الرحلة.
  /// وختم الوقت ضروري: بلا ختم لا تعرف السحابة أي النسختين أحدث،
  /// فتضيع خطة كتبتها على جهاز لأن جهازًا آخر حمل نسخة أقدم.
  update(id, next){
    const list = read();
    const i = list.findIndex(t => t.id === id);
    if (i >= 0){ list[i] = { ...list[i], ...next, updatedAt: stamp() }; write(list); }
  },
};
