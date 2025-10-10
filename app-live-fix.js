
/* === app-live-fix.js ===
   رقعة صغيرة تضيف:
   - window.LIVE_SOURCES  (قائمة مصادر السعر الحي)
   - window.gsDebug       (بديل آمن لـ console.debug)
   أضِف هذا الملف بعد <script src="app.js"> في index.html
*/
(function(){
  'use strict';

  if (!window.gsDebug) {
    window.gsDebug = (...args) => { try { console.debug(...args); } catch(e) {} };
  }

  if (!window.LIVE_SOURCES) {
    window.LIVE_SOURCES = [
      // استخدم الـ Worker كوكيل سريع
      "https://workerjs.samer-mourtada.workers.dev/price",
      // مصدر احتياطي
      "https://api.metals.live/v1/spot/gold"
    ];
  }
})();
