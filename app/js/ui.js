// Shared display vocabulary — the app's words, and only the app's words.
import { t, isEN } from "/app/js/i18n.js";

export const MONTHS_AR = [t("يناير"),t("فبراير"),t("مارس"),t("أبريل"),t("مايو"),t("يونيو"),
                          t("يوليو"),t("أغسطس"),t("سبتمبر"),t("أكتوبر"),t("نوفمبر"),t("ديسمبر")];

export const WARMTH_AR = {cold:t("باردة"), mild:t("معتدلة"), warm:t("دافئة"), hot:t("حارة")};
export const RAIN_AR   = {r0:t("بلا مطر"), r1:t("مطر خفيف"), r2:t("مطر متوسط"), r3:t("مطر غزير")};

export const REQUIREMENT_AR = {
  visa_free: t("لا تتطلب تأشيرة"),
  visa_waiver: t("إعفاء من التأشيرة"),
  freedom_of_movement: t("حرية تنقّل"),
  visa_on_arrival: t("تأشيرة عند الوصول"),
  evisa: t("تأشيرة إلكترونية"),
  eta: t("تصريح سفر إلكتروني"),
  embassy_visa: t("تأشيرة من السفارة"),
  restricted: t("دخول مقيّد"),
  unclear: t("المتطلب غير مؤكد — راجع الجهة الرسمية"),
};

export const PASSPORT_AR = {SA:t("السعودية"), AE:t("الإمارات"), KW:t("الكويت"),
                            QA:t("قطر"), BH:t("البحرين"), OM:t("عُمان")};

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

export function cityName(c){ return isEN ? (c.name_en || c.name_ar) : (c.name_ar || c.name_en); }
export function countryName(c){ return isEN ? (c.country_name_en || c.country_name_ar) : (c.country_name_ar || c.country_name_en); }

// The affiliate handoff — website channel, disclosed. Mirrors the pages.
const MARKER = "768560";
export function kiwiLink(fromIata, toIata, sub){
  const deep = `https://www.kiwi.com/deep?from=${fromIata}&to=${toIata}`;
  return "https://c111.travelpayouts.com/click?shmarker=" + MARKER + "." + sub +
         "&promo_id=3791&source_type=customlink&type=click&custom_url=" +
         encodeURIComponent(deep);
}
