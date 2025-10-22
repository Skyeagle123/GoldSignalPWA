/* =====================================================
   GoldSignals • gs-modes-patch.js (v6.1)
   - أزرار الأوضاع (سريع / حذر / ذكي) تعمل فوق الكود الأصلي
   - كشف حالة السوق بإجماع (Badge + ATR% + BB%)
   - ودجت تشخيص + خيار فرض الحالة يدويًا
   - وصف ديناميكي يتبدّل حسب الوضع المفعّل
   ===================================================== */
(function(){
  "use strict";

  const $id = (id)=> document.getElementById(id);
  const onReady = (fn)=> (document.readyState !== "loading")
      ? fn() : document.addEventListener("DOMContentLoaded", fn);

  // عتبات قابلة للضبط
  const THRESH = { BB_RANGE_MAX:0.8, ATR_RANGE_MAX:0.35, BB_ACTIVE_MIN:1.0 };

  // LocalStorage keys
  const LS_MODE = "GS_MODE";                 // fast | safe | auto
  const LS_OVERRIDE = "GS_MARKET_OVERRIDE";  // auto | range | trend

  // مساعدات انتقاء عناصر
  function resolveEl(...cands){
    for(const c of cands){
      if(!c) continue;
      if(typeof c==="string"){ const el = document.querySelector(c); if(el) return el; }
      else if(c instanceof HTMLElement){ return c; }
    }
    return null;
  }
  // محاولات مرنة للعثور على تشك بوكس المؤشرات حتى لو تغيّرت IDs
  function resolveIndicatorCheckbox(names, extraSel=null){
    const byId = names.map(n=>`#${n}`).join(", ");
    let el = resolveEl(byId);
    if(el) return el;
    if(extraSel){
      const all = document.querySelectorAll(extraSel);
      for(const x of all){
        const label = (x.closest("label")?.textContent || x.parentElement?.textContent || "").toLowerCase();
        for(const n of names){ if(label.includes(n.toLowerCase())) return x; }
      }
    }
    return null;
  }

  /* ---------------- إشارات خام من البيانات ---------------- */
  function getAtrPct(){
    try{
      const s = window.series, a = window.atrArr;
      if(Array.isArray(s)&&Array.isArray(a)&&s.length&&a.length){
        const i = Math.min(s.length,a.length)-1;
        const c = +s[i].close, atr = +a[i];
        if(isFinite(c)&&c>0&&isFinite(atr)) return 100*atr/c;
      }
    }catch(_){}
    try{
      const el = document.querySelector("[data-atr-pct], #atrPct");
      if(el){
        const v = parseFloat((el.getAttribute("data-atr-pct")||el.textContent||"").replace(/[^\d.]/g,""));
        if(isFinite(v)) return v;
      }
    }catch(_){}
    return NaN;
  }
  function getBbWidthPct(){
    try{
      const s=window.series, up=window.bbUpper, lo=window.bbLower;
      if(Array.isArray(s)&&Array.isArray(up)&&Array.isArray(lo)&&s.length&&up.length&&lo.length){
        const i = Math.min(s.length,up.length,lo.length)-1;
        const c=+s[i].close, w=(+up[i])-(+lo[i]);
        if(isFinite(c)&&c>0&&isFinite(w)) return 100*w/c;
      }
    }catch(_){}
    try{
      const el = document.querySelector("[data-bb-pct], #bbPct");
      if(el){
        const v = parseFloat((el.getAttribute("data-bb-pct")||el.textContent||"").replace(/[^\d.]/g,""));
        if(isFinite(v)) return v;
      }
    }catch(_){}
    return NaN;
  }
  // قراءة البادج إن وجد
  function detectFromBadge(){
    const el = document.querySelector('[data-market-state], .market-badge, #marketBadge');
    if(!el) return null;
    const t = (el.getAttribute("data-market-state")||el.textContent||"").toLowerCase();
    if(t.includes("range")||t.includes("رينج")||t.includes("تذبذب")) return "range";
    if(t.includes("trend")||t.includes("ترند")||t.includes("اتجاه")) return "trend";
    return null;
  }
  // استدلال الحالة من ATR% و BB%
  function detectFromMetrics(){
    const atrPct = getAtrPct();
    const bbPct  = getBbWidthPct();
    const isRange = (isFinite(bbPct)  && bbPct  < THRESH.BB_RANGE_MAX) &&
                    (isFinite(atrPct) && atrPct < THRESH.ATR_RANGE_MAX);
    const isTrend = (isFinite(bbPct)  && bbPct  >= THRESH.BB_ACTIVE_MIN) ||
                    (isFinite(atrPct) && atrPct >= THRESH.ATR_RANGE_MAX);
    const state   = isRange ? "range" : (isTrend ? "trend" : "unknown");
    // ثقة تقريبية
    let conf = 0;
    if(state==="range"){
      const m1 = (THRESH.BB_RANGE_MAX - bbPct) / THRESH.BB_RANGE_MAX;
      const m2 = (THRESH.ATR_RANGE_MAX - atrPct) / THRESH.ATR_RANGE_MAX;
      conf = Math.max(0, (m1+m2)/2);
    }else if(state==="trend"){
      const m1 = isFinite(bbPct)  ? (bbPct/THRESH.BB_ACTIVE_MIN)  : 0;
      const m2 = isFinite(atrPct) ? (atrPct/THRESH.ATR_RANGE_MAX) : 0;
      conf = Math.max(0, (m1+m2)/2 - 1);
    }
    return { state, atrPct, bbPct, confidence: +conf.toFixed(2) };
  }
  // إجماع نهائي مع التعامل مع التعارض/الفرض اليدوي
  function consensus(){
    const override = (localStorage.getItem(LS_OVERRIDE) || "auto");
    if(override==="range"||override==="trend"){ return { final:override, from:"override", badge:detectFromBadge(), metrics:detectFromMetrics() }; }

    const badge   = detectFromBadge();
    const metrics = detectFromMetrics();
    if(badge && (badge===metrics.state || metrics.state==="unknown")){
      return { final:badge, from:"badge", badge, metrics };
    }
    if(metrics.state!=="unknown"){
      if(badge && badge!==metrics.state){
        if(metrics.confidence >= 0.25){
          return { final:metrics.state, from:"metrics-strong", badge, metrics };
        }else{
          return { final:badge, from:"badge-weak-metrics", badge, metrics };
        }
      }
      return { final:metrics.state, from:"metrics", badge, metrics };
    }
    return { final: (badge || "range"), from:(badge?"badge":"default-range"), badge, metrics };
  }

  /* ---------------- ربط الحالة بالمؤشرات ---------------- */
  function setIndicatorsByState(state, {strict=false, els}){
    const {useRSI,useMACD,useEMA,useStoch,useBB} = els;
    if(state==="range"){
      if(useRSI)   useRSI.checked   = true;
      if(useBB)    useBB.checked    = true;
      if(useStoch) useStoch.checked = true;
      if(useEMA)   useEMA.checked   = false;
      if(useMACD)  useMACD.checked  = false;
    }else{ // trend
      if(useRSI)   useRSI.checked   = true;
      if(useEMA)   useEMA.checked   = true;
      if(useMACD)  useMACD.checked  = true;
      if(useStoch) useStoch.checked = false;
      if(useBB)    useBB.checked    = !!strict; // بالحذر ممكن نفعل BB كفلتر إضافي
    }
  }

  onReady(function init(){
    const elAuto = resolveEl("#autoInd","[name='autoInd']");
    const elPro  = resolveEl("#proMode","[name='proMode']");
    const elMTF  = resolveEl("#mtfConfirm","[name='mtfConfirm']");

    const els = {
      useRSI  : resolveIndicatorCheckbox(["useRSI","rsiEnable","rsiOn"], "input[type=checkbox]"),
      useMACD : resolveIndicatorCheckbox(["useMACD","macdEnable","macdOn"], "input[type=checkbox]"),
      useEMA  : resolveIndicatorCheckbox(["useEMA","emaEnable","emaOn"], "input[type=checkbox]"),
      useStoch: resolveIndicatorCheckbox(["useStoch","stochEnable","stochOn"], "input[type=checkbox]"),
      useBB   : resolveIndicatorCheckbox(["useBB","bbEnable","bbOn","useBoll"], "input[type=checkbox]"),
    };
    if(!els.useRSI || !els.useMACD || !els.useEMA) return; // نطلع بهدوء إذا الواجهة مختلفة

    const runBtn = resolveEl("#runBtn","#btnRun","button[data-run]");

    /* ---------------- أزرار الوضع فوق Auto Indicators ---------------- */
    const autoAnchor = resolveEl("#autoInd","[name='autoInd']")?.closest("label") ||
                       resolveEl("#autoInd","[name='autoInd']")?.parentElement ||
                       document.querySelector("label[for='autoInd']") ||
                       document.querySelector(".auto-indicators") ||
                       document.body;

    const wrap = document.createElement("div");
    wrap.id = "gs-mode-toggle";
    wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 6px;align-items:center";
    wrap.innerHTML = `
      <style>
        .gs-pill{padding:8px 12px;border-radius:10px;border:1px solid #334155;background:#1f2937;color:#e5e7eb;cursor:pointer}
        .gs-pill[aria-pressed="true"]{background:#2563eb;border-color:#2563eb;color:#fff;box-shadow:0 0 0 2px rgba(37,99,235,.25) inset}
        .gs-hint{font-size:12px;color:#9ca3af;flex-basis:100%}
      </style>
      <button type="button" class="gs-pill" data-mode="fast" aria-pressed="false">سريع</button>
      <button type="button" class="gs-pill" data-mode="safe" aria-pressed="false">حذر</button>
      <button type="button" class="gs-pill" data-mode="auto" aria-pressed="false">ذكي (تلقائي)</button>
      <div class="gs-hint"></div>
    `;
    autoAnchor.parentElement.insertBefore(wrap, autoAnchor);

    // الوصف الديناميكي
    const hintEl = wrap.querySelector('.gs-hint');
    const HINTS = {
      fast: 'الوضع الحالي: <b>سريع</b> — يفعِّل EMA + MACD + RSI ويتركك تعدّل بحرّية.',
      safe: 'الوضع الحالي: <b>حذر</b> — يحدِّد المؤشرات تلقائيًا بحسب حالة السوق ويقفلها (تبقى Precise و MTF قابلة للتغيير).',
      auto: 'الوضع الحالي: <b>ذكي (تلقائي)</b> — يقترح المؤشرات مرّة واحدة حسب السوق ثم يتركك تعدّل بحرّية.'
    };
    function setHint(mode){ if (hintEl) hintEl.innerHTML = HINTS[mode] || ''; }

    const btnFast = wrap.querySelector('[data-mode="fast"]');
    const btnSafe = wrap.querySelector('[data-mode="safe"]');
    const btnAuto = wrap.querySelector('[data-mode="auto"]');
    const buttons = [btnFast, btnSafe, btnAuto];
    const setPressed = (m)=> buttons.forEach(b=> b.setAttribute("aria-pressed", String(b.dataset.mode===m)));

    function setLocked(disabled){
      const root = document.querySelector(".indicators, #indicators, [data-section='indicators']") || document;
      root.querySelectorAll("input, select, textarea").forEach(el=>{
        const isPrecise = (el===elPro) || /precise|pro/i.test(el.name||el.id||"");
        const isMTF     = (el===elMTF) || /mtf/i.test(el.name||el.id||"");
        if (isPrecise || isMTF) return; // هدول دايمًا قابلين للتغيير
        el.disabled = !!disabled;
      });
    }
    function presetFast(){
      if (elAuto && elAuto.checked) elAuto.checked = false;
      els.useRSI.checked = true; els.useMACD.checked = true; els.useEMA.checked = true;
      if (els.useBB) els.useBB.checked = false;
      if (els.useStoch) els.useStoch.checked = false;
    }
    function clickRun(){ try{ runBtn && runBtn.click(); }catch(_){ /* no-op */ } }

    /* ---------------- ودجت التشخيص + فرض يدوي ---------------- */
    const diag = document.createElement("div");
    diag.id = "gs-market-diag";
    diag.style.cssText = "font-size:12px;color:#9ca3af;margin:6px 0 12px;line-height:1.6";
    diag.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span>حالة السوق:</span>
        <button type="button" class="gs-pill" data-ovr="auto"  aria-pressed="true">تلقائي</button>
        <button type="button" class="gs-pill" data-ovr="trend" aria-pressed="false">ترند</button>
        <button type="button" class="gs-pill" data-ovr="range" aria-pressed="false">رينج</button>
        <span id="gsDiagVals"></span>
      </div>`;
    wrap.after(diag);
    const ovrBtns = diag.querySelectorAll(".gs-pill[data-ovr]");
    const setOvrPressed = (ovr)=> ovrBtns.forEach(b=> b.setAttribute("aria-pressed", String(b.dataset.ovr===ovr)));
    function refreshDiag(){
      const {final, from, badge, metrics} = consensus();
      const text = `ATR%: ${isFinite(metrics.atrPct)?metrics.atrPct.toFixed(2):"—"} • BB%: ${isFinite(metrics.bbPct)?metrics.bbPct.toFixed(2):"—"} • محسوب: ${metrics.state} (${metrics.confidence}) • بادج: ${badge||"—"} • نهائي: ${final} (${from})`;
      const span = $id("gsDiagVals"); if(span) span.textContent = text;
      setOvrPressed(localStorage.getItem(LS_OVERRIDE) || "auto");
      return final;
    }
    ovrBtns.forEach(b=> b.addEventListener("click", ()=>{
      localStorage.setItem(LS_OVERRIDE, b.dataset.ovr);
      const mode = localStorage.getItem(LS_MODE) || "auto";
      const state = refreshDiag();
      if(mode!=="fast"){
        setIndicatorsByState(state, {strict: mode==="safe", els});
        clickRun();
      }
    }));

    /* ---------------- التطبيق حسب الوضع ---------------- */
    window.__gs_autoUserEdited = false;
    const edits = ["useRSI","useMACD","useEMA","useStoch","useBB","rsiPeriod","emaFast","emaSlow","bbPeriod","bbStd","stochK","stochD"]
      .map($id).filter(Boolean);
    edits.forEach(el=>{
      const mark=()=>{ if(localStorage.getItem(LS_MODE)==="auto") window.__gs_autoUserEdited = true; };
      el.addEventListener("change", mark); el.addEventListener("input", mark);
    });

    function applyMarketPresetForMode(mode){
      const finalState = refreshDiag();
      if (elAuto && !elAuto.checked) elAuto.checked = true;
      setIndicatorsByState(finalState, {strict: mode==="safe", els});
    }

    function applyMode(mode, {triggerRun=true}={}){
      localStorage.setItem(LS_MODE, mode);
      setPressed(mode);
      setHint(mode); // وصف ديناميكي

      if (mode==='fast'){
        if (elPro) elPro.checked = false;
        presetFast();
        setLocked(false);
      } else if (mode==='safe'){
        if (elPro) elPro.checked = true;
        applyMarketPresetForMode("safe");
        setLocked(true);
      } else { // auto
        if (elPro) elPro.checked = true;
        if (!window.__gs_autoSuggestedOnce){
          applyMarketPresetForMode("auto");
          window.__gs_autoSuggestedOnce = true;
        }
        setLocked(false);
      }
      if (triggerRun) clickRun();
    }

    wrap.addEventListener("click", (e)=>{
      const b = e.target.closest(".gs-pill[data-mode]");
      if(!b) return;
      applyMode(b.dataset.mode);
    });

    function afterAnalysisHook(){
      const mode = localStorage.getItem(LS_MODE) || "auto";
      if (mode==='safe'){
        applyMarketPresetForMode("safe");
        setLocked(true);
      } else if (mode==='auto' && !window.__gs_autoUserEdited){
        applyMarketPresetForMode("auto");
      }
      setPressed(mode);
      setHint(mode);
    }
    ["runAnalysis","reprojectWithLive","calcSignals","computeSignals"].forEach(fn=>{
      if(typeof window[fn]==="function"){
        const orig = window[fn];
        window[fn] = function(...args){
          const ret = orig.apply(this,args);
          try{ afterAnalysisHook(); }catch(_){}
          return ret;
        };
      }
    });
    window.addEventListener("gs:signals:done", afterAnalysisHook);

    // boot
    const saved = localStorage.getItem(LS_MODE) || "auto";
    setOvrPressed(localStorage.getItem(LS_OVERRIDE)||"auto");
    setHint(saved);
    applyMode(saved, {triggerRun:false});
    refreshDiag();
  });
})();
