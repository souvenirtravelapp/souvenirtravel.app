// أيقونات سوفينير للفعاليات — مرسومة على هوية التطبيق لا مستوردة:
// خط واحد بسماكة 1.6، أطراف مستديرة، تأخذ لون النص المحيط (currentColor)،
// وشبكة 24×24. الرمز يقول ما هو النشاط قبل أن يُقرأ اسمه: الكارتينج مقود
// وعجلات، والزيبلاين حبل وبكرة، والمضيق صخرتان بينهما ماء.
const P = {
  kart: "M3 15h18M5 15l1.5-4h11L19 15M8 11l1-2h6l1 2M6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM10 12.5h4",
  zipline: "M3 5l18 4M9 7.5l1.5 2M10.5 9.5a2 2 0 002 2M12.5 11.5v2.5M11 14h3l-1.5 5",
  coaster: "M3 18V9a4 4 0 018 0v6a3 3 0 006 0V7M3 18h18M6 18v-3M18 18v-2",
  gorge: "M4 3l3 9-3 9M20 3l-3 9 3 9M9 20c1.5-2 4.5-2 6 0M9.5 12c1-1.2 4-1.2 5 0",
  lake: "M3 14c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 18c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M8 9l3-4 3 4",
  waterfall: "M6 3v10M10 3v12M14 3v10M18 3v13M4 19c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 4 0",
  cable: "M3 5l18 5M9 7.5v2.5M15 9v2.5M7 10h8v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6zM7 13h8",
  mountain: "M3 19l6-11 4 7 2-3 6 7H3zM9 8l2 3.5",
  beach: "M3 19c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0M12 19V9M12 9c-3-2-6-1-7 1 3-1 5 0 7-1zM12 9c3-2 6-1 7 1-3-1-5 0-7-1z",
  museum: "M3 20h18M5 20V10M9 20V10M15 20V10M19 20V10M3 10l9-6 9 6H3z",
  food: "M6 3v8a2 2 0 004 0V3M8 11v10M17 3c-1.5 1.5-2 3.5-2 5.5 0 1.5.7 2.5 2 2.5V3zM17 11v10",
  cafe: "M4 9h12v5a4 4 0 01-4 4H8a4 4 0 01-4-4V9zM16 10h2a2 2 0 010 4h-2M7 6c0-1 1-1.5 1-2.5M11 6c0-1 1-1.5 1-2.5",
  market: "M4 9h16l-1 10H5L4 9zM8 9V6a4 4 0 018 0v3",
  playground: "M5 20V6M19 20V6M5 9h14M9 9v5M15 9v5M7 20l2-6M17 20l-2-6",
  spa: "M12 20c0-4 2-7 6-8-1 4-3 6-6 8zM12 20c0-4-2-7-6-8 1 4 3 6 6 8zM12 20V9",
  place: "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
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
  hotel: "M3 20V7l9-3 9 3v13M3 20h18M9 20v-5h6v5M7 10h2M15 10h2M7 13h2M15 13h2",
  land: "M3 19h18M5 12l2-1 4 1 3-6 2 .6-1.4 5.9 4.4 1.2-1 2.3L5 13z",
  fly: "M3 19h18M4 9.5l2-.6 3.5 2.4 5.6-3.6 1.6 1.4-3.6 5.2 4.4 1.4-.9 2.2L4 12.5z",
  car: "M4 16h16M6 16v2M18 16v2M5 16l1.5-5h11L19 16M7.5 14a1 1 0 100-2 1 1 0 000 2zM16.5 14a1 1 0 100-2 1 1 0 000 2z",
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
