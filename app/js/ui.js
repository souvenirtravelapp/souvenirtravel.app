// Shared display vocabulary — the app's words, and only the app's words.
export const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو",
                          "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export const WARMTH_AR = {cold:"باردة", mild:"معتدلة", warm:"دافئة", hot:"حارة"};
export const RAIN_AR   = {r0:"بلا مطر", r1:"مطر خفيف", r2:"مطر متوسط", r3:"مطر غزير"};

export const REQUIREMENT_AR = {
  visa_free: "لا تتطلب تأشيرة",
  visa_waiver: "إعفاء من التأشيرة",
  freedom_of_movement: "حرية تنقّل",
  visa_on_arrival: "تأشيرة عند الوصول",
  evisa: "تأشيرة إلكترونية",
  eta: "تصريح سفر إلكتروني",
  embassy_visa: "تأشيرة من السفارة",
  restricted: "دخول مقيّد",
  unclear: "المتطلب غير مؤكد — راجع الجهة الرسمية",
};

export const PASSPORT_AR = {SA:"السعودية", AE:"الإمارات", KW:"الكويت",
                            QA:"قطر", BH:"البحرين", OM:"عُمان"};

export function flag(cc){
  return [...cc.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
}

// Small DOM builder: el("div.card", {onclick}, children...) — enough, no more.
export function el(spec, attrs = {}, ...children){
  const [tag, ...classes] = spec.split(".");
  const node = document.createElement(tag || "div");
  if (classes.length) node.className = classes.join(" ");
  for (const [k, v] of Object.entries(attrs)){
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const ch of children.flat()){
    if (ch == null) continue;
    node.append(ch.nodeType ? ch : document.createTextNode(ch));
  }
  return node;
}

export function cityName(c){ return c.name_ar || c.name_en; }
export function countryName(c){ return c.country_name_ar || c.country_name_en; }

// The affiliate handoff — website channel, disclosed. Mirrors the pages.
const MARKER = "768560";
export function kiwiLink(fromIata, toIata, sub){
  const deep = `https://www.kiwi.com/deep?from=${fromIata}&to=${toIata}`;
  return "https://c111.travelpayouts.com/click?shmarker=" + MARKER + "." + sub +
         "&promo_id=3791&source_type=customlink&type=click&custom_url=" +
         encodeURIComponent(deep);
}
