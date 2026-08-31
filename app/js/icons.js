// أيقونات سوفينير للفعاليات — مرسومة على هوية التطبيق لا مستوردة:
// خط واحد بسماكة 1.6، أطراف مستديرة، تأخذ لون النص المحيط (currentColor)،
// وشبكة 24×24. الرمز يقول ما هو النشاط قبل أن يُقرأ اسمه: الكارتينج مقود
// وعجلات، والزيبلاين حبل وبكرة، والمضيق صخرتان بينهما ماء.
const P = {
  // كارتينج: هيكل منخفض، مقعد، مقود، وعجلتان — صورة جانبية تُعرف بلا شرح
  kart: "M4 16.5h13M5 16.5l1.5-3.5h8.5l2 3.5M12.5 13V9.5H9.5M9 9.5h2M6.5 19.5a2 2 0 100-4 2 2 0 000 4zM17.5 19.5a2 2 0 100-4 2 2 0 000 4z",
  // زيبلاين: حبل مائل، بكرة، وراكب معلّق بذراعيه
  zipline: "M2.5 4v5M21.5 8v5M2.5 5l19 4.4M11.2 7.6l2.8.7M12.6 8.3v1.5M12.6 12.8a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM12.6 12.8v3.2M12.6 16l-2.2 3.4M12.6 16l2.2 3.4M12.6 13.8l-2.6-1.7M12.6 13.8l2.6-1.7",
  // مزلقة جبلية: سكة منحنية وعربة عليها
  coaster: "M2 18c4 0 3.5-9 8-9s4.5 9 8 9M2 21h20M9 8.5h4.5l-.6 2.6H9.6zM10 13a1 1 0 100-2 1 1 0 000 2zM13 13a1 1 0 100-2 1 1 0 000 2z",
  // مضيق: جداران صخريان وممشى بينهما وماء
  gorge: "M2 3v18M6.5 3l1.8 7-1.8 6.5V21M17.5 3l-1.8 7 1.8 6.5V21M22 3v18M8.8 21c1.2-1.4 4.2-1.4 5.4 0M9.6 13.5c1-1 3.8-1 4.8 0",
  // بحيرة: قمم تنعكس على ماء
  lake: "M3 15.5h18M4.5 15.5l4.5-6.5 3 4.2 2-2.6 5.5 4.9M3 18.8c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0",
  // شلال: حافة صخرية وماء نازل إلى بركة
  waterfall: "M3 3.5h7v7h5v6.5h6M5.5 5v5.5M7.5 5v5.5M12 12v5M13.5 12v5M3 20.5c2.2-1.3 4.4-1.3 6.6 0s4.4 1.3 6.6 0 3.6-1 4.8-.3",
  // تلفريك: كابل وعربة معلّقة
  cable: "M2 6l20 4.5M12 8.8v2.2M8.5 11h7v6.5a1.6 1.6 0 01-1.6 1.6h-3.8A1.6 1.6 0 018.5 17.5V11zM8.5 14.2h7M11 11v8",
  // جبل بقمة مثلجة
  mountain: "M2.5 19.5h19M3.5 19.5l6.5-11 3.5 5.8L16 11l5.5 8.5M8.2 12l1.8-3 1.8 3c-1.2.8-2.4.8-3.6 0z",
  // شاطئ: مظلة وموج
  beach: "M12 20.5V11M12 11c-4.2 0-7.4 2-7.4 2C5.7 8.6 8.5 6 12 6s6.3 2.6 7.4 7c0 0-3.2-2-7.4-2zM3 20.5c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0",
  // متحف/معلم: أعمدة وسقف مثلث
  museum: "M2.5 20.5h19M5 20.5V10M9 20.5V10M15 20.5V10M19 20.5V10M3 10l9-6.5 9 6.5H3zM4 10h16",
  // مطعم: شوكة وسكين
  food: "M6 3v6.5a2 2 0 004 0V3M8 9.5V21M6 3v4.5M10 3v4.5M17.5 3c-1.6 1.4-2.5 3.4-2.5 5.5 0 1.7.9 2.8 2.5 2.8V3zM17.5 11.3V21",
  // مقهى: فنجان ببخار وصحن
  cafe: "M5 8.5h11v5.5a4 4 0 01-4 4h-3a4 4 0 01-4-4V8.5zM16 9.8h1.6a2.4 2.4 0 010 4.8H16M3.5 20.5h15M8.5 6c0-1.2.9-1.4.9-2.6M11.8 6c0-1.2.9-1.4.9-2.6",
  // سوق: كشك بمظلة مخططة
  market: "M4 9.5h16v11H4zM2.5 9.5l2-4.5h15l2 4.5M9 20.5v-6.5h4v6.5M8 9.5l1-4.5M16 9.5l-1-4.5",
  // ملعب: زحليقة وسلّم
  playground: "M2.5 20.5h19M19 5.5v15M15.5 5.5v15M15.5 5.5h3.5M15.5 9h3.5M15.5 12.5h3.5M15.5 16h3.5M15.5 9.5L5 20.5M5 20.5h3",
  // حمّام حراري: بركة وبخار
  spa: "M4 15.5c0 3 3.6 5 8 5s8-2 8-5H4zM9 12c0-1.6 1.4-2 1.4-3.6M15 12c0-1.6 1.4-2 1.4-3.6M12 12V8",
  // دبوس مكان — الافتراضي
  place: "M12 21.5s7-6.4 7-11.3A7 7 0 105 10.2c0 4.9 7 11.3 7 11.3zM12 12.7a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2z",
};

// المطابقة بالاسم أولًا — النشاط يُعرف من اسمه لا من تصنيفه العام.
const RULES = [
  [/gokart|go-kart|kart|بreak/i, "kart"],
  [/zipline|zip line|flying fox|زيبلاين/i, "zipline"],
  [/coaster|rodelbahn|toboggan|مزلقة/i, "coaster"],
  [/klamm|gorge|canyon|مضيق/i, "gorge"],
  [/see$|see\b|lake|بحيرة/i, "lake"],
  [/fall|wasserfall|waterfall|شلال/i, "waterfall"],
  [/bahn|cable|gondola|funicular|تلفريك|قطار/i, "cable"],
  [/berg|gipfel|peak|mountain|جبل|قمة/i, "mountain"],
  [/beach|strand|شاطئ/i, "beach"],
  [/museum|palace|castle|tower|متحف|قصر|قلعة|برج/i, "museum"],
  [/restaurant|stube|hof$|مطعم/i, "food"],
  [/caf|kaffee|مقهى/i, "cafe"],
  [/markt|market|bazaar|سوق/i, "market"],
  [/park|spiel|playground|حديقة|ملعب/i, "playground"],
  [/therme|spa|bad\b|حمام/i, "spa"],
];
const BY_KIND = {
  "طعام": "food", "مقهى": "cafe", "طبيعة": "mountain", "نشاط": "playground",
  "تجربة": "cable", "معلم": "museum", "سوق": "market", "ترفيه": "coaster",
  "حي قديم": "museum",
};

/// أيقونة الفعالية: من اسمها إن دلّ، وإلا من نوعها، وإلا دبوس مكان.
export function activityIcon(name = "", kind = ""){
  let key = null;
  for (const [re, k] of RULES) if (re.test(name)) { key = k; break; }
  if (!key) key = BY_KIND[kind] || "place";
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "22");
  svg.setAttribute("height", "22");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", P[key]);
  svg.append(path);
  return svg;
}

/// أيقونات أحداث اليوم بنفس اليد: الفندق، الطائرة، السيارة.
const EVENT_P = {
  // فندق: مبنى بنوافذ وباب ولافتة
  hotel: "M3.5 20.5V7.5l8.5-3.5 8.5 3.5v13M2.5 20.5h19M9.5 20.5v-5h5v5M6.5 10h2.5M15 10h2.5M6.5 13.5h2.5M15 13.5h2.5M11 10h2",
  // طائرة تهبط: مسار نازل وخط أرض
  land: "M2.5 20.5h19M4 12.5l2-.8 4.2 2.4 3-6.4 2.2.7-1.4 6.2 5 1.5-1 2.4L4 13.6z",
  // طائرة تقلع: مسار صاعد وخط أرض
  fly: "M2.5 20.5h19M3.5 10.5l2-.7 3.8 2.6 5.9-3.9 1.8 1.6-3.8 5.6 4.8 1.5-1 2.4-13.5-4z",
  // سيارة: هيكل ونافذتان وعجلتان
  car: "M3.5 16h17M5.5 16v2M18.5 16v2M4.5 16l2-5.5h11l2 5.5M7.5 10.5V8h9v2.5M7.5 14a1.1 1.1 0 100-2.2 1.1 1.1 0 000 2.2zM16.5 14a1.1 1.1 0 100-2.2 1.1 1.1 0 000 2.2z",
};
export function eventIcon(kind){
  const key = kind === "in" || kind === "out" ? "hotel"
    : kind === "land" ? "land" : kind === "fly" ? "fly" : "car";
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "22"); svg.setAttribute("height", "22");
  svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", EVENT_P[key]);
  svg.append(path);
  return svg;
}
