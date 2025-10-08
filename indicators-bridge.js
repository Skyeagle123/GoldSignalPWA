
/* indicators-bridge.js  — drop-in fix
   Works with both ids: autoInd / autoIndicators and useRSI/useMACD/useEMA/useStoch/useBB
   Forces USE_* flags and patches classify* + re-run. Safe to include after your main app script.
*/
(function(){
  const $ = (id)=>document.getElementById(id);
  // try both ids
  const elAuto = $('autoInd') || $('autoIndicators');
  const elRSI  = $('useRSI');
  const elMACD = $('useMACD');
  const elEMA  = $('useEMA');
  const elSTO  = $('useStoch');
  const elBB   = $('useBB');

  // ensure globals exist
  window.USE_RSI = typeof USE_RSI==='boolean' ? USE_RSI : !!(elRSI && elRSI.checked);
  window.USE_MACD = typeof USE_MACD==='boolean' ? USE_MACD : !!(elMACD && elMACD.checked);
  window.USE_EMA_TREND = typeof USE_EMA_TREND==='boolean' ? USE_EMA_TREND : !!(elEMA && elEMA.checked);
  window.USE_STOCH = typeof USE_STOCH==='boolean' ? USE_STOCH : !!(elSTO && elSTO.checked);
  window.USE_BB    = typeof USE_BB==='boolean'    ? USE_BB    : !!(elBB && elBB.checked);

  function lock(el,on){ if(!el)return; el.disabled=!!on; el.style.opacity=on?.7:1; el.style.cursor=on?'not-allowed':'pointer'; }
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

  // regime detection using app arrays if available
  function computeRegime(){
    const s = (window.__cache && window.__cache.series) || window.seriesTF || window.series5 || [];
    if (!Array.isArray(s) || s.length<30) return 'range';
    try {
      const closes = s.map(x=>x.close);
      const m = (window.macdFromCloses || window.macd || function(){ return {emaF:[],emaS:[],macd:[],signal:[]}; })(closes, window.EMA_FAST||12, window.EMA_SLOW||26, 9);
      const i=s.length-1, ef=m.emaF[i], es=m.emaS[i];
      const trending = Number.isFinite(ef)&&Number.isFinite(es) && Math.abs(ef-es) > (s[i].close*0.0005);
      return trending ? 'trend' : 'range';
    }catch(e){ return 'range'; }
  }

  function applyAuto(){
    const mode = computeRegime();
    if (mode==='trend'){ window.USE_EMA_TREND=true; window.USE_MACD=true; window.USE_RSI=true; window.USE_STOCH=false; window.USE_BB=false; }
    else { window.USE_EMA_TREND=false; window.USE_MACD=false; window.USE_RSI=true; window.USE_STOCH=true; window.USE_BB=true; }
    syncUI(); [elRSI,elMACD,elEMA,elSTO,elBB].forEach(el=>lock(el,true));
  }
  function unlock(){ [elRSI,elMACD,elEMA,elSTO,elBB].forEach(el=>lock(el,false)); }

  // Patch classifiers to respect flags (non-destructive)
  if (typeof window.classifyFinal==='function' && !window.classifyFinal.__flagsPatched){
    const orig = window.classifyFinal;
    window.classifyFinal = function(ctx){
      const anyOn = (window.USE_RSI||window.USE_MACD||window.USE_EMA_TREND||window.USE_STOCH||window.USE_BB);
      if (!anyOn) return 'حيادي';
      return orig.call(this, ctx);
    };
    window.classifyFinal.__flagsPatched = true;
  }

  function rerun(){ (window.runAnalysis||window.run||function(){})(); }

  // Wire UI
  [elRSI,elMACD,elEMA,elSTO,elBB].forEach(el=> el && el.addEventListener('change', ()=>{ if (!(elAuto && elAuto.checked)) { syncFlagsFromUI(); rerun(); } }));
  if (elAuto){
    elAuto.addEventListener('change', ()=>{
      if (elAuto.checked){ applyAuto(); rerun(); }
      else { unlock(); syncFlagsFromUI(); rerun(); }
    });
  }

  // Initial
  syncFlagsFromUI(); syncUI();
})();
