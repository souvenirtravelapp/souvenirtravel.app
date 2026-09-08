// إقلاع غلاف الهاتف — يُحقن قبل أي وحدة: هوية المنصة، ووعد الاعتماد
// الأصيل الذي تنتظره cloud.js قبل أن تقرر الضيافة. جسر Capacitor يزرع
// نفسه قبل هذا الملف، فالاستعادة الصامتة تُطلب فورًا وتحلّ الوعد
// باعتمادٍ أو بلا شيء — فلا سباق ولا تعليق.
(function(){
  var plat = (window.Capacitor && window.Capacitor.getPlatform)
    ? window.Capacitor.getPlatform() : "wrapper";
  window.__souvenirWrapper = { platform: plat, build: "spike-a2" };
  // منصة الغلاف على جذر الوثيقة — فتُفصَّل الواجهة بالـCSS لكل غلاف
  // (كإخفاء دخول أبل حيث لا يعمل مساره المنبثق).
  document.documentElement.classList.add("sv-" + plat);
  var resolve;
  window.__souvenirNativeAuthPromise = new Promise(function(r){ resolve = r; });
  window.__souvenirNativeAuthResolve = resolve;
  var p = window.Capacitor && window.Capacitor.Plugins
    && window.Capacitor.Plugins.SouvenirAuth;
  if (p && p.restore)
    p.restore().then(function(r){ resolve(r && r.idToken ? r : null); },
                     function(){ resolve(null); });
  else resolve(null);
})();
