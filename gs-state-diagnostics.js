
/* gs-state-diagnostics.js
 * Shows BB% and ATR% below the market state chips (Auto / Trend / Range).
 * - Auto-pulls from DOM if possible.
 * - Or accept pushed values via window.gsPushStateMetrics(...) or 'gs:state-metrics' event.
 */
(function () {
  const byId = (id)=>document.getElementById(id);

  function ensureRow(){
    const chipsRow = document.querySelector('[data-gs="market-state-row"]')
                   || document.querySelector('.gs-market-state-row')
                   || [...document.querySelectorAll('div')].find(d => /حالة السوق|ترند|رينج|تلقائي/.test((d.textContent||'').trim()));
    if (!chipsRow || !chipsRow.parentNode) return null;
    let diag = document.getElementById('gsDiagRow');
    if (diag) return diag;
    diag = document.createElement('div');
    diag.id = 'gsDiagRow';
    diag.style.cssText = 'margin-top:6px;font-size:12px;opacity:0.9';
    diag.innerHTML = 'BB%: <b id="gsDiagBb">—</b> • ATR%: <b id="gsDiagAtr">—</b> <span id="gsDiagNote" style="opacity:.6"></span>';
    chipsRow.parentNode.insertBefore(diag, chipsRow.nextSibling);
    return diag;
  }

  function setVals(atrPct, bbPct, note){
    ensureRow();
    const b = byId('gsDiagBb'), a = byId('gsDiagAtr'), n = byId('gsDiagNote');
    if (b) b.textContent = (bbPct!=null && isFinite(bbPct)) ? (+bbPct).toFixed(2) : '—';
    if (a) a.textContent = (atrPct!=null && isFinite(atrPct)) ? (+atrPct).toFixed(2) : '—';
    if (n && note) n.textContent = ' '+note;
  }

  // Listen for explicit pushes from app.js
  window.addEventListener('gs:state-metrics', (e)=>{
    const d = e.detail||{};
    setVals(d.atrPct, d.bbPct, d.note||'');
  });
  window.gsPushStateMetrics = function({atrPct=null, bbPct=null, note=''}){
    setVals(atrPct, bbPct, note);
  };

  // Fallback sampler from DOM every second
  setInterval(()=>{
    ensureRow();
    // Try to derive BB% from a text like "BB: upper / middle / lower"
    const bbEl = [...document.querySelectorAll('span,div')].find(el => /\bBB\b/.test(el.textContent||''));
    let bbPct = null, atrPct = null;
    if (bbEl){
      const txt = (bbEl.textContent||'').replace(/\s+/g,' ').trim();
      const nums = (txt.match(/[-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?/g)||[]).map(s=>+s.replace(/,/g,''));
      if (nums.length>=3){
        const [upper, middle, lower] = nums;
        if (middle>0) bbPct = ((upper - lower)/middle)*100;
      }
    }
    const atrEl = [...document.querySelectorAll('span,div')].find(el => /ATR%/i.test(el.textContent||''));
    if (atrEl){
      const m = (atrEl.textContent||'').match(/ATR%[^0-9\-+]*([-+]?\d+(?:\.\d+)?)/i);
      if (m) atrPct = parseFloat(m[1]);
    }
    if (bbPct!=null || atrPct!=null){
      setVals(atrPct, bbPct, '(auto)');
    }
  }, 1000);
})();
