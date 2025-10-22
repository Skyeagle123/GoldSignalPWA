
// GoldSignals - Modes Add-On (non-invasive) — v2 (with tooltips)
// This file does NOT modify core logic; it only wires UI modes to indicators and sets policies.

(function(){
  const $ = id => document.getElementById(id);

  // ===== Utilities =====
  const CBOX = ['useRSI','useMACD','useEMA','useBB','useStoch'];
  const INPUTS = ['rsiPeriod','emaFast','emaSlow','bbPeriod','bbStd','stochK','stochD'];

  function setManualIndicatorsEnabled(enabled){
    CBOX.forEach(id=>{ const el=$(id); if(el) el.disabled = !enabled; });
    INPUTS.forEach(id=>{ const el=$(id); if(el) el.disabled = !enabled; });
  }

  function applyPolicyForMode(mode){
    try{
      if (mode==='fast'){ window.PRO_MODE=false; window.MTF_CONFIRM=false; window.gsEntryPolicy='2of3'; }
      else { window.PRO_MODE=true; window.MTF_CONFIRM=true; window.gsEntryPolicy='all'; }
    }catch(_){}
  }

  function setBox(id,val){ const el=$(id); if(el){ el.checked=!!val; el.dispatchEvent(new Event('change',{bubbles:true})); } }
  function applyPresetForMode(mode){
    if (mode==='fast'){
      setBox('useEMA',1); setBox('useMACD',1); setBox('useRSI',1);
      setBox('useBB',0);  setBox('useStoch',0);
    } else if (mode==='safe'){
      setBox('useEMA',1); setBox('useMACD',1); setBox('useRSI',1);
      setBox('useBB',1);  setBox('useStoch',0);
    }
  }

  function detectMarketState(metrics){
    const active  = (Number.isFinite(metrics?.atrPct) && metrics.atrPct >= 0.35) ||
                    (Number.isFinite(metrics?.bbWidthPct)&& metrics.bbWidthPct>= 0.90);
    const ranging = (Number.isFinite(metrics?.bbWidthPct)&& metrics.bbWidthPct< 0.80) &&
                    (Number.isFinite(metrics?.atrPct)    && metrics.atrPct    <  0.35);
    return {active, ranging};
  }
  function applyMarketAwarePreset(metrics, {strict}={strict:false}){
    const ms = detectMarketState(metrics);
    if (ms.ranging){
      setBox('useEMA',0); setBox('useMACD',0); setBox('useRSI',1);
      setBox('useBB',1);  setBox('useStoch',1);
    } else {
      setBox('useEMA',1); setBox('useMACD',1); setBox('useRSI',1);
      setBox('useBB',!!strict); setBox('useStoch',0);
    }
    return ms;
  }

  // Track manual edits in Auto (so we don't override)
  window.__autoUserEdited = false;
  function wireEditTracking(){
    [...CBOX, ...INPUTS].forEach(id=>{
      const el=$(id); if(!el || el.__wiredAutoFlag) return;
      const mark=()=>{ if(window.GS_MODE==='auto') window.__autoUserEdited = true; };
      el.addEventListener('change', mark); el.addEventListener('input', mark);
      el.__wiredAutoFlag = true;
    });
  }
  wireEditTracking();

  // ===== Mode Buttons (existing) =====
  const modeBar = document.getElementById('gs-mode-toggle') || document;
  modeBar.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button[data-mode]'); if(!btn) return;
    window.GS_MODE = btn.dataset.mode;
    localStorage.setItem('GS_MODE', window.GS_MODE);
    if (GS_MODE==='fast' || GS_MODE==='safe') applyPresetForMode(GS_MODE);
    if (GS_MODE==='auto') window.__autoUserEdited = false;
    setManualIndicatorsEnabled(GS_MODE!=='safe');
    try{ window.updateModeUI && window.updateModeUI(GS_MODE,''); }catch(_){}
  });

  // ===== Runtime hook after analysis functions =====
  function runtimeApply(series, atrArr){
    try{
      const i = series.length-1, px=series?.[i]?.close;
      const atr=Array.isArray(atrArr)? atrArr[i]:NaN;
      const atrPct = (Number.isFinite(atr)&&Number.isFinite(px)&&px>0)? (100*atr/px) : NaN;
      const bbWidthPct = window.__lastBBWpct; // إن كان حساب BB موجود سيملأ هذه القيمة
      const metrics = { atrPct, bbWidthPct };
      if (window.GS_MODE==='auto'){
        const act = (typeof computeActiveModeNow==='function') ? computeActiveModeNow(metrics) : {mode:'fast',reason:''};
        applyPolicyForMode(act.mode);
        if (!window.__autoUserEdited) applyMarketAwarePreset(metrics, {strict:false});
        setManualIndicatorsEnabled(true);
      } else if (window.GS_MODE==='safe'){
        applyPolicyForMode('safe');
        applyMarketAwarePreset(metrics, {strict:true});
        setManualIndicatorsEnabled(false);
      } else {
        applyPolicyForMode('fast');
        applyPresetForMode('fast');
        setManualIndicatorsEnabled(true);
      }
    }catch(e){ console.warn('[modes add-on]', e); }
  }

  ['runAnalysis','reprojectWithLive'].forEach(fn=>{
    if (typeof window[fn]==='function'){
      const orig = window[fn];
      window[fn] = function(...args){
        const ret = orig.apply(this, args);
        try{
          const series = args[0] || window.series || [];
          const atrArr = window.atrArr || [];
          runtimeApply(series, atrArr);
        }catch(e){ console.warn('[modes add-on hook]', e); }
        wireEditTracking();
        return ret;
      };
    }
  });

  // ===== Help UI: tooltips/legend =====
  function injectHelp(){
    const host = document.getElementById('gs-mode-toggle') || document.querySelector('[data-mode]')?.parentElement || document.body;
    if (!host || document.getElementById('gs-mode-legend')) return;
    const css = document.createElement('style');
    css.textContent = `
      .gs-help{font-size:12px;color:#9ca3af;margin-top:6px}
      .gs-help code{background:#111827;border:1px solid #334155;color:#e5e7eb;padding:2px 6px;border-radius:8px}
      .gs-tip{position:relative;display:inline-block;margin-inline-start:8px}
      .gs-tip .b{background:#1f2937;border:1px solid #334155;border-radius:10px;padding:2px 8px;color:#e5e7eb;cursor:default}
      .gs-tip .t{visibility:hidden;opacity:0;transition:opacity .2s;position:absolute;z-index:40;bottom:125%;right:0;min-width:220px;background:#0b1220;color:#e5e7eb;border:1px solid #334155;border-radius:10px;padding:8px;box-shadow:0 6px 24px rgba(0,0,0,.35)}
      .gs-tip:hover .t{visibility:visible;opacity:1}
    `;
    document.head.appendChild(css);
    const wrap = document.createElement('div');
    wrap.id = 'gs-mode-legend';
    wrap.className = 'gs-help';
    wrap.innerHTML = `
      <div class="gs-tip">
        <span class="b">شرح الأوضاع</span>
        <div class="t">
          <div><strong>سريع</strong>: <code>EMA + MACD + RSI</code> (تعديل يدوي مسموح)</div>
          <div><strong>حذر</strong>: تلقائي حسب السوق كل مرة — ترند ⇒ <code>EMA + MACD + RSI + BB</code>، رينج ⇒ <code>BB + Stoch + RSI</code> (التعديل معطّل)</div>
          <div><strong>ذكي</strong>: يقترح مرة حسب السوق ثم تقدر تعدّل بحرّية</div>
        </div>
      </div>`;
    host.parentElement.insertBefore(wrap, host.nextSibling);
  }
  injectHelp();

  // ===== Initial state =====
  window.GS_MODE = localStorage.getItem('GS_MODE') || window.GS_MODE || 'auto';
  setManualIndicatorsEnabled(GS_MODE!=='safe');
  if (GS_MODE==='fast' || GS_MODE==='safe') applyPresetForMode(GS_MODE);
})();
