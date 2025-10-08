
/* indicators-bridge-plus.js
   - Extends indicators-bridge with:
     1) Regime badge: shows Trend / Range live
     2) "Force auto detect" button to recalc & apply
   - Zero-HTML-changes: injects a tiny floating widget.
*/

(function(){
  const $ = (id)=>document.getElementById(id);

  // ---- grab UI els (support both ids used in your app) ----
  const elAuto = $('autoInd') || $('autoIndicators');
  const elRSI  = $('useRSI');
  const elMACD = $('useMACD');
  const elEMA  = $('useEMA');
  const elSTO  = $('useStoch');
  const elBB   = $('useBB');

  // ---- helpers ----
  function lock(el,on){ if(!el) return; el.disabled=!!on; el.style.opacity=on?.7:1; el.style.cursor=on?'not-allowed':'pointer'; }
  function rerun(){ (window.runAnalysis||window.run||function(){})(); }

  // ---- create floating widget ----
  function createWidget(){
    if (document.getElementById('bridgeAutoWidget')) return;
    const box = document.createElement('div');
    box.id='bridgeAutoWidget';
    box.style.cssText = 'position:fixed;right:14px;bottom:92px;z-index:9999;background:#0b1220d9;border:1px solid #1f2a44;border-radius:10px;padding:10px 12px;font:12px system-ui,Segoe UI,Arial;color:#dbeafe;box-shadow:0 6px 18px rgba(0,0,0,.35);backdrop-filter:blur(4px)';
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span id="regimeBadge" style="display:inline-block;padding:2px 8px;border-radius:999px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;">—</span>
        <button id="forceAutoBtn" style="padding:4px 8px;border-radius:8px;border:1px solid #334155;background:#0ea5e9;color:white;">تحديد تلقائي</button>
      </div>
    `;
    document.body.appendChild(box);
    // wire button
    const btn = document.getElementById('forceAutoBtn');
    btn.addEventListener('click', ()=>{
      applyAuto(); // compute & apply
      updateBadge();
      rerun();
    });
  }

  // ---- flags I/O ----
  function syncFlagsFromUI(){
    if (elAuto && elAuto.checked) return;
    if (elRSI)  window.USE_RSI = !!elRSI.checked;
    if (elMACD) window.USE_MACD = !!elMACD.checked;
    if (elEMA)  window.USE_EMA_TREND = !!elEMA.checked;
    if (elSTO)  window.USE_STOCH = !!elSTO.checked;
    if (elBB)   window.USE_BB = !!elBB.checked;
  }
  function syncUI(){
    if (elRSI)  elRSI.checked  = !!window.USE_RSI;
    if (elMACD) elMACD.checked = !!window.USE_MACD;
    if (elEMA)  elEMA.checked  = !!window.USE_EMA_TREND;
    if (elSTO)  elSTO.checked  = !!window.USE_STOCH;
    if (elBB)   elBB.checked   = !!window.USE_BB;
  }

  // ---- regime detection (safe & generic) ----
  function computeRegime(){
    const s = (window.__cache && (window.__cache.tf || window.__cache.series)) || window.seriesTF || window.series5 || [];
    if (!Array.isArray(s) || s.length<30) return {mode:'range'};
    try {
      const closes = s.map(x=>x.close);
      const mac = (window.macdFromCloses || window.macd)(closes, window.EMA_FAST||12, window.EMA_SLOW||26, 9);
      const i=s.length-1, ef=mac.emaF[i], es=mac.emaS[i];
      const trending = Number.isFinite(ef)&&Number.isFinite(es) && Math.abs(ef-es) > (s[i].close*0.0005);
      // add ATR check to avoid micro-trends
      const a = (window.atr ? window.atr(s, window.ATR_PERIOD||14) : []);
      const ap = (a[i] && s[i].close) ? (a[i]/s[i].close) : 0;
      const mode = (trending && ap>0.0008) ? 'trend' : 'range';
      return {mode, ap, ef, es};
    }catch(e){ return {mode:'range'}; }
  }

  function applyAuto(){
    const {mode} = computeRegime();
    if (mode==='trend'){ window.USE_EMA_TREND=true; window.USE_MACD=true; window.USE_RSI=true; window.USE_STOCH=false; window.USE_BB=false; }
    else { window.USE_EMA_TREND=false; window.USE_MACD=false; window.USE_RSI=true; window.USE_STOCH=true; window.USE_BB=true; }
    syncUI();
    [elRSI,elMACD,elEMA,elSTO,elBB].forEach(el=>lock(el,true));
  }

  function unlockManual(){ [elRSI,elMACD,elEMA,elSTO,elBB].forEach(el=>lock(el,false)); }

  // ---- badge ----
  function updateBadge(){
    const b = document.getElementById('regimeBadge');
    if (!b) return;
    const {mode} = computeRegime();
    if (mode==='trend'){ b.textContent='Trend'; b.style.background='#064e3b'; b.style.borderColor='#10b981'; b.style.color='#d1fae5'; }
    else { b.textContent='Range'; b.style.background='#3f2d0c'; b.style.borderColor='#f59e0b'; b.style.color='#fffbeb'; }
  }

  // ---- wire UI events ----
  [elRSI,elMACD,elEMA,elSTO,elBB].forEach(el=> el && el.addEventListener('change', ()=>{
    if (!(elAuto && elAuto.checked)) { syncFlagsFromUI(); rerun(); updateBadge(); }
  }));
  if (elAuto){
    elAuto.addEventListener('change', ()=>{
      if (elAuto.checked){ applyAuto(); }
      else { unlockManual(); syncFlagsFromUI(); }
      rerun(); updateBadge();
    });
  }

  // ---- init ----
  window.addEventListener('load', ()=>{
    // ensure flags present
    window.USE_RSI  = typeof USE_RSI==='boolean' ? USE_RSI : !!(elRSI && elRSI.checked);
    window.USE_MACD = typeof USE_MACD==='boolean' ? USE_MACD : !!(elMACD && elMACD.checked);
    window.USE_EMA_TREND = typeof USE_EMA_TREND==='boolean' ? USE_EMA_TREND : !!(elEMA && elEMA.checked);
    window.USE_STOCH = typeof USE_STOCH==='boolean' ? USE_STOCH : !!(elSTO && elSTO.checked);
    window.USE_BB    = typeof USE_BB==='boolean'    ? USE_BB    : !!(elBB && elBB.checked);

    createWidget();
    updateBadge();
  });

  // expose manual trigger if needed
  window.forceAutoDetect = function(){ applyAuto(); updateBadge(); rerun(); };
})();
