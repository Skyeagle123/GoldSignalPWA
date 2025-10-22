
/*! GoldSignals Modes Add‑On v3 (non-invasive) */
(function(){
  const $ = id => document.getElementById(id);
  const READY = (fn)=> (document.readyState!=='loading') ? fn() : document.addEventListener('DOMContentLoaded', fn);

  READY(()=>{
    const elAuto   = $('autoInd');
    const elPro    = $('proMode');
    const useRSI   = $('useRSI');
    const useMACD  = $('useMACD');
    const useEMA   = $('useEMA');
    const useStoch = $('useStoch');
    const useBB    = $('useBB');
    const runBtn   = $('runBtn') || $('btnRun') || document.querySelector('button[data-run]');
    if(!elAuto || !useRSI || !useMACD || !useEMA) return;

    const autoLabel = elAuto.closest('label') || elAuto.parentElement;
    const wrap = document.createElement('div');
    wrap.id = 'gs-mode-toggle';
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 6px 0;';
    wrap.innerHTML = `
      <style>
        .gs-pill{padding:8px 12px;border-radius:10px;border:1px solid #334155;background:#1f2937;color:#e5e7eb;cursor:pointer}
        .gs-pill[aria-pressed="true"]{background:#2563eb;border-color:#2563eb;color:#fff;box-shadow:0 0 0 2px rgba(37,99,235,.25) inset}
        .gs-hint{font-size:12px;color:#9ca3af;flex-basis:100%}
      </style>
      <button type="button" class="gs-pill" data-mode="fast" aria-pressed="false">سريع</button>
      <button type="button" class="gs-pill" data-mode="safe" aria-pressed="false">حذر</button>
      <button type="button" class="gs-pill" data-mode="auto" aria-pressed="false">ذكي (تلقائي)</button>
      <div class="gs-hint">
        <b>سريع:</b> EMA + MACD + RSI (تعديل مسموح) •
        <b>حذر:</b> يختار بحسب السوق في كل مرة ويعطّل التعديل •
        <b>ذكي:</b> يقترح مرة ثم يتركك تغيّر بحرّية
      </div>
    `;
    autoLabel.parentElement.insertBefore(wrap, autoLabel);

    const btnFast = wrap.querySelector('[data-mode="fast"]');
    const btnSafe = wrap.querySelector('[data-mode="safe"]');
    const btnAuto = wrap.querySelector('[data-mode="auto"]');
    const buttons = [btnFast, btnSafe, btnAuto];

    const setPressed = (mode)=>{ buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode===mode))); };
    const setLocked = (disabled)=>{
      [useRSI,useMACD,useEMA,useStoch,useBB].forEach(el=>{ if(el) el.disabled = !!disabled; });
      ['rsiPeriod','emaFast','emaSlow','bbPeriod','bbStd','stochK','stochD'].forEach(id=>{
        const el = $(id); if(el) el.disabled = !!disabled;
      });
    };
    const suggestByMarket = ()=>{
      if (!elAuto.checked) elAuto.checked = true;
      if (useRSI)   useRSI.checked = true;
      if (useMACD)  useMACD.checked = true;
      if (useEMA)   useEMA.checked = true;
      if (useBB)    useBB.checked  = true;
      if (useStoch) useStoch.checked = true;
    };
    const presetFast = ()=>{
      if (elAuto.checked) elAuto.checked = false;
      if (useRSI)   useRSI.checked = true;
      if (useMACD)  useMACD.checked = true;
      if (useEMA)   useEMA.checked = true;
      if (useBB)    useBB.checked  = false;
      if (useStoch) useStoch.checked = false;
    };

    function applyMode(mode, {triggerRun=true}={}){
      localStorage.setItem('GS_MODE', mode);
      setPressed(mode);
      if (mode==='fast'){
        if (elPro) elPro.checked = false;
        presetFast();
        setLocked(false);
      } else if (mode==='safe'){
        if (elPro) elPro.checked = true;
        suggestByMarket();
        setLocked(true);
      } else { // auto
        if (elPro) elPro.checked = true;
        if (!window.__autoSuggestedOnce){ suggestByMarket(); window.__autoSuggestedOnce = true; }
        setLocked(false);
      }
      if (triggerRun && runBtn) runBtn.click();
    }

    wrap.addEventListener('click', (e)=>{
      const b = e.target.closest('.gs-pill[data-mode]'); if(!b) return;
      applyMode(b.dataset.mode);
    });

    const saved = localStorage.getItem('GS_MODE') || 'auto';
    applyMode(saved, {triggerRun:false});
  });
})();
