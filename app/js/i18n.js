// لغتا سوفينير — العربية أصلًا والإنجليزية ترجمة.
// المفتاح هو النص العربي ذاته: t('نص') أو وسم القوالب t`نص ${x} نص`
// (مفاتيح القوالب تُجمع بالفاصل ␟ وقيمها الإنجليزية تستعمل {0} {1}…).
import { EN } from "/app/js/i18n-en.js";

const KEY = "sv.lang";
export function lang() {
  try { return localStorage.getItem(KEY) === "en" ? "en" : "ar"; }
  catch { return "ar"; }
}
export function setLang(l) {
  try { localStorage.setItem(KEY, l === "en" ? "en" : "ar"); } catch {}
  location.reload();
}
export const isEN = lang() === "en";

export function t(s, ...vals) {
  if (Array.isArray(s)) {                    // t`قالب ${x}`
    const key = s.raw ? s.raw.join("␟") : s.join("␟");
    if (!isEN) return s.reduce((a, p, i) => a + p + (i < vals.length ? vals[i] : ""), "");
    const en = EN[key];
    if (en === undefined) return s.reduce((a, p, i) => a + p + (i < vals.length ? vals[i] : ""), "");
    return en.replace(/\{(\d+)\}/g, (_, n) => vals[+n] ?? "");
  }
  if (!isEN) return s;
  return EN[s] !== undefined ? EN[s] : s;
}

// يضبط اتجاه الوثيقة مبكرًا (يُستدعى من app.js عند الإقلاع أيضًا)
export function applyDir() {
  const l = lang();
  document.documentElement.lang = l;
  document.documentElement.dir = l === "en" ? "ltr" : "rtl";
}
