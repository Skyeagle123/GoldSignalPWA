
/* gs-advice-policy-bridge.js v2
   سياسة عرض النصيحة + تفصيل الفلاتر المسبِّبة للرفض:
   - إن وُجدت "أسباب رفض بالفلاتر" نعرض أسماء الفلاتر.
   - إذا كانت الفلاتر مُعطّلة => "دخول افتراضي — أسباب: ..."
   - إذا كانت الفلاتر مُفعّلة => "لا توجد نصيحة. أسباب: ..."
   - إذا لا رفض ولا افتراضي، ومع وجود (شراء/بيع) => "دخول"
   - خلاف ذلك => "لا توجد نصيحة."
   الاستعمال: ضعه بعد app.js وقبل </body>.
*/
(function(){
  'use strict';

  // === أدوات مساعدة ===
  const $ = (s, r=document) => r.querySelector(s);
  const byId = (id) => document.getElementById(id);
  const norm = (t)=> (t||'').replace(/\s+/g,' ').trim();

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
           root.querySelector('p, .text, .content, .body, .summary, .desc') ||
           root; // fallback
  }

  function filtersDisabledNow(){
    const ny = byId('disableNyFilter') || byId('toggleNyHours') || byId('nyFilterToggle');
    const pv = byId('disablePivotFilter') || byId('togglePivotFilter') || byId('pivotFilterToggle');
    return !!((ny && ny.checked) || (pv && pv.checked));
  }

  // استخراج أسباب الرفض من النص مثل: "(مرفوض بالفلاتر: ....)"
  function extractFilterReasons(text){
    const t = norm(text);
    // التقط ما بعد "مرفوض بالفلاتر:" أو "ستُرفض بالفلاتر:" وحتى أول قوس إغلاق
    const m = t.match(/(?:مرفوض\s*بالفلاتر|ستُرفض\s*بالفلاتر)\s*:\s*([^)]*)\)/);
    if (!m) return [];
    const raw = m[1] || '';
    // افصل بـ • أو + أو , أو ،
    return raw.split(/[\u2022•\+\.,،]+/).map(s=>s.trim()).filter(Boolean);
  }

  // تصنيف صديق للمستخدم: حوّل الأسباب لعبارات موجزة وموحّدة
  function prettifyReasons(list){
    if (!list || !list.length) return [];
    return list.map(r=>{
      const x = r.toLowerCase();
      if (x.includes('نيويورك')) return 'ساعات نيويورك';
      if (x.includes('pivot') || x.includes('بيفوت')) return 'قرب Pivot';
      if (x.includes('atr')) return 'ATR% خارج النطاق';
      if (x.includes('mtf')) return 'فشل تأكيد MTF';
      return r;
    });
  }

  const rxHypo  = /(إطلاع\s*فقط|افتراضي|hypothetical|no\s*signal|بدون\s*إشارة)/i;
  const rxAct   = /(شراء|بيع)/;
  const rxParen = /\(.*?\)/; // أول قوسين

  function rewrite(){
    const root = getAdviceRoot();
    if (!root) return;
    const el   = getAdviceSummaryEl(root);
    if (!el) return;

    const original = el.textContent;
    let text = norm(original);

    const reasonsRaw = extractFilterReasons(text);
    const reasons = prettifyReasons(reasonsRaw);
    const hasReasons = reasons.length > 0;
    const isHypo = rxHypo.test(text);
    const hasAction = rxAct.test(text);
    const disabled = filtersDisabledNow();

    if (hasReasons){
      if (disabled){
        // الفلاتر معطّلة لكن الأسباب موجودة => دخول افتراضي مع ذكر الفلاتر
        const tag = ` (دخول افتراضي — أسباب: ${reasons.join(' + ')})`;
        if (rxParen.test(text)) {
          text = text.replace(rxParen, tag);
        } else {
          text = text + tag;
        }
      } else {
        // الفلاتر مفعّلة => لا توجد نصيحة مع ذكر الأسباب
        text = `لا توجد نصيحة. أسباب: ${reasons.join(' + ')}`;
      }
    } else if (!isHypo && hasAction) {
      // إشارة مؤكدة
      if (rxParen.test(text)) {
        text = text.replace(rxParen, '(دخول)');
      } else {
        text = `دخول — ${text}`;
      }
    } else {
      // لا أسباب فلتر ولا إشارة مؤكدة => لا توجد نصيحة
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
