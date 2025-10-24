/* app-final2.js — sync UI with metrics + hide mid-page duplicates + ATR-from-advice */
(function(){
  const fmt = v => (v==null || Number.isNaN(v)) ? "—" : Number(v).toFixed(2);
  function apply(mode, bb, atr){
    document.querySelectorAll('.hint-stats, .bbatr-inline').forEach(n => n.remove());
    const lbl = document.getElementById('marketModeLabel') || document.getElementById('mtfBadge');
    if (lbl) lbl.textContent = (mode==='trend')?'ترند':(mode==='range')?'رينج':'غير معلوم';
  }
  function onMetrics(e){
    const d = e.detail || {};
    const bb  = d.bbPerc ?? d.bbPct;
    const atr = d.atrPerc ?? d.atrPct;
    const mode = d.mode ?? ((atr!=null && bb!=null && atr<0.25 && bb>35 && bb<65) ? 'range' : 'trend');
    try { (window.gs = window.gs || {}).market = Object.assign((window.gs.market||{}), {mode, bbPct:bb, atrPct:atr}); } catch {}
    apply(mode, bb, atr);
  }
  window.addEventListener('gs:market:metrics', onMetrics, {passive:true});
  (function(){
    function push(atr){
      try{
        const gs = (window.gs = window.gs || {});
        gs.market = gs.market || {};
        gs.market.atrPct = typeof atr === 'number' ? atr : Number(atr);
        const bb = gs.market.bbPct ?? gs.market.bbPerc ?? null;
        window.dispatchEvent(new CustomEvent('gs:market:metrics', {
          detail: { bbPct: bb, atrPct: gs.market.atrPct, bbPerc: bb, atrPerc: gs.market.atrPct }
        }));
      }catch(e){}
    }
    function scanAdvice(){
      const adv = document.getElementById('adviceText');
      if (!adv) return;
      const m = adv.textContent.match(/ATR%:\s*([0-9]+(?:\.[0-9]+)?)/);
      if (m) push(parseFloat(m[1]));
    }
    try{
      const adv = document.getElementById('adviceText');
      if (adv){
        new MutationObserver(() => scanAdvice())
          .observe(adv, { childList:true, subtree:true, characterData:true });
      }
    }catch(e){}
    document.addEventListener('DOMContentLoaded', () => { setTimeout(scanAdvice, 300); setTimeout(scanAdvice, 1200); });
    window.addEventListener('gs:state:changed', () => setTimeout(scanAdvice, 150), {passive:true});
  })();
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.hint-stats, .bbatr-inline').forEach(n => n.remove());
  });
})();
