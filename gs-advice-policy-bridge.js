
/* gs-advice-policy-bridge.js
   سياسة عرض النصيحة:
   - "دخول افتراضي" فقط إذا كان السبب "مرفوض بالفلاتر".
   - "دخول" إذا وُجدت إشارة مؤكدة (وليس افتراضية).
   - "لا توجد نصيحة." إذا لا هذه ولا تلك.
   الاستعمال: أضفه بعد app.js وقبل </body>.
*/
(function(){
  'use strict';

  // أدوات مساعدة
  const $ = (s, r=document) => r.querySelector(s);
  const byId = (id) => document.getElementById(id);

  // الالتقاط المرن لعناصر النصيحة
  function getAdviceRoot(){
    return byId('adviceCard') ||
           byId('adviceBox')  ||
           $('[data-role="advice"]') ||
           $('.advice-card, .advice-box, #advice') ||
           $('section#advice') ||
           $('#advice') ||
           null;
  }
  function getAdviceSummaryEl(root){
    if (!root) root = document;
    return byId('adviceSummary') ||
           $('[data-role="advice-summary"]', root) ||
           $('.advice-summary', root) ||
           root.querySelector('p, .text, .content, .body') ||
           root; // fallback
  }

  // قراءة حالة فلاتر المستخدم (اختياري للتطابق مع بيئتك)
  function filtersDisabledNow(){
    const ny = byId('disableNyFilter') || byId('toggleNyHours') || byId('nyFilterToggle');
    const pv = byId('disablePivotFilter') || byId('togglePivotFilter') || byId('pivotFilterToggle');
    return !!((ny && ny.checked) || (pv && pv.checked));
  }

  // مصطلحات دالّة
  const rxRejection   = /(مرفوض\s*بالفلاتر|كانت\s*ستُرفض\s*بالفلاتر)/i;
  const rxHypo        = /(إطلاع\s*فقط|افتراضي|hypothetical|no\s*signal|بدون\s*إشارة)/i;
  const rxAction      = /(شراء|بيع)/; // وجود فعل تداول داخل الملخص
  const rxParensBlock = /\(.*?\)/;     // أول قوسين نعالجهما كتصنيف

  function normalize(t){ return (t||'').replace(/\s+/g,' ').trim(); }

  function rewrite(){
    const root = getAdviceRoot();
    if (!root) return;
    const el   = getAdviceSummaryEl(root);
    if (!el) return;

    let text = normalize(el.textContent);

    const hasRejection = rxRejection.test(text);
    const isHypo       = rxHypo.test(text);
    const hasAction    = rxAction.test(text);

    // منطق السياسة
    if (hasRejection || (isHypo && filtersDisabledNow())) {
      // دخول افتراضي بسبب الفلاتر
      if (rxParensBlock.test(text)) {
        text = text.replace(rxParensBlock, '(دخول افتراضي)');
      } else {
        text = `دخول افتراضي — ${text}`;
      }
    } else if (!isHypo && hasAction) {
      // إشارة مؤكدة => دخول
      if (rxParensBlock.test(text)) {
        text = text.replace(rxParensBlock, '(دخول)');
      } else {
        text = `دخول — ${text}`;
      }
    } else {
      // لا افتراضي مرتبط بالفلاتر ولا إشارة مؤكدة
      text = 'لا توجد نصيحة.';
    }

    el.textContent = text;
  }

  function start(){
    rewrite();
    const mo = new MutationObserver(() => rewrite());
    mo.observe(document.body, {subtree:true, childList:true, characterData:true});
    ['disableNyFilter','toggleNyHours','nyFilterToggle',
     'disablePivotFilter','togglePivotFilter','pivotFilterToggle']
     .forEach(id => {
       const n = byId(id);
       if (n) n.addEventListener('change', rewrite);
     });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }
})();
