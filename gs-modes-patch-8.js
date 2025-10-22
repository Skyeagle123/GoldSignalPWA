// GoldSignals - Modes Patch (drop-in)
// 1) Guard for missing writeExportsNth (prevents crash)
// 2) Lock Auto Indicators ON when mode = 'smart' (ذكّي تلقائي), unlock otherwise
// 3) Keep the existing UI text in sync without touching app.js
(function(){
  try {
    if (typeof window.writeExportsNth !== "function") {
      window.writeExportsNth = function(){ /* no-op guard */ };
    }

    function $(sel){ return document.querySelector(sel); }
    function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

    const elAuto = $('#autoIndicators') || $('[name="autoIndicators"]') || (function(){
      const label = $all('label,div,span').find(el => /Auto indicators/i.test(el.textContent||''));
      if (!label) return null;
      const box = label.closest('*')?.querySelector('input[type="checkbox"]');
      return box || null;
    })();

    function byText(t){
      return $all('button,div[role="button"]').find(el => (el.textContent||'').trim() === t);
    }
    const btnFast  = $('[data-mode="fast"]')  || byText('سريع') || null;
    const btnSafe  = $('[data-mode="safe"]')  || byText('حذر')  || null;
    const btnSmart = $('[data-mode="smart"]') || byText('ذكي (تلقائي)') || byText('ذكي') || null;

    if (!elAuto || !btnFast || !btnSafe || !btnSmart) return;

    function currentMode(){
      const m = document.body.getAttribute('data-gs-mode');
      if (m) return m;
      if (btnSmart.classList.contains('active') || btnSmart.ariaPressed === 'true') return 'smart';
      if (btnSafe.classList.contains('active')  || btnSafe.ariaPressed  === 'true') return 'safe';
      if (btnFast.classList.contains('active')  || btnFast.ariaPressed  === 'true') return 'fast';
      return 'fast';
    }

    function applyAutoLock(mode){
      const isSmart = (mode === 'smart');
      if (isSmart){
        elAuto.checked = true;
        elAuto.disabled = true;
        elAuto.setAttribute('data-locked','1');
        elAuto.title = 'في وضع ذكي (تلقائي)، يتم اختيار المؤشرات تلقائيًا.';
      } else {
        elAuto.disabled = false;
        elAuto.removeAttribute('data-locked');
        elAuto.title = '';
      }
    }

    function init(){
      applyAutoLock(currentMode());
      [btnFast, btnSafe, btnSmart].forEach(btn => {
        btn.addEventListener('click', () => {
          const m = (btn === btnSmart) ? 'smart' : (btn === btnSafe ? 'safe' : 'fast');
          document.body.setAttribute('data-gs-mode', m);
          applyAutoLock(m);
        }, { passive:true });
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once:true });
    } else {
      init();
    }

  } catch(e){
    console.warn('[gs-modes-patch] non-fatal:', e);
  }
})(); 
