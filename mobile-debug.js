
/* ======= In-App Mobile Debug Overlay (no console needed) ======= */
(function(){
  const st = {
    csvRows: 0,
    lastTs: null,
    lastLocal: '',
    autoChecked: false,
    USE_RSI: undefined,
    USE_MACD: undefined,
    USE_EMA_TREND: undefined,
    USE_STOCH: undefined,
    USE_BB: undefined,
    ui_useRSI: undefined,
    ui_useMACD: undefined,
    ui_useEMA: undefined,
    ui_useStoch: undefined,
    ui_useBB: undefined,
    lastNote: ''
  };

  const css = `
  #dbgBtn{
    position:fixed;right:10px;bottom:12px;width:46px;height:46px;border-radius:50%;
    background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;
    font:600 12px system-ui;box-shadow:0 6px 16px rgba(0,0,0,.35);z-index:999999999;
  }
  #dbgPane{
    position:fixed;right:10px;bottom:64px;min-width:260px;max-width:92vw;max-height:60vh;overflow:auto;
    background:#0b1324;color:#e5e7eb;border:1px solid #1f2a44;border-radius:12px;padding:10px 12px;
    font:12px/1.4 system-ui;z-index:999999999;
  }
  #dbgPane table{width:100%;border-collapse:collapse;}
  #dbgPane td{padding:3px 4px;border-bottom:1px solid #1d2540;}
  #dbgPane .k{opacity:.75}
  #dbgPane .v{font-weight:600}
  #dbgPane .ok{color:#22c55e} #dbgPane .bad{color:#ef4444}
  `;
  const style=document.createElement('style'); style.textContent=css; document.head.appendChild(style);

  const btn=document.createElement('button'); btn.id='dbgBtn'; btn.type='button'; btn.textContent='DBG';
  const pane=document.createElement('div'); pane.id='dbgPane'; pane.style.display='none';
  document.body.appendChild(btn); document.body.appendChild(pane);
  btn.onclick=()=>{ pane.style.display = (pane.style.display==='none'?'block':'none'); };

  function loc(ts){
    if(!ts) return '';
    try{ const d=new Date(ts); return d.toLocaleDateString()+' '+d.toLocaleTimeString(); }catch(e){ return ''; }
  }

  function render(){
    const ok = st.csvRows>0;
    pane.innerHTML = `
      <div style="margin-bottom:6px;font-weight:700">Mobile Debug</div>
      <table>
        <tr><td class="k">CSV rows</td><td class="v ${ok?'ok':'bad'}">${st.csvRows || 0}</td></tr>
        <tr><td class="k">Last bar (local)</td><td class="v">${st.lastLocal || '—'}</td></tr>
        <tr><td class="k">Auto checked</td><td class="v">${st.autoChecked}</td></tr>
      </table>
      <div style="margin:6px 0 2px;font-weight:700">State</div>
      <table>
        <tr><td class="k">USE_RSI</td><td class="v">${String(st.USE_RSI)}</td></tr>
        <tr><td class="k">USE_MACD</td><td class="v">${String(st.USE_MACD)}</td></tr>
        <tr><td class="k">USE_EMA_TREND</td><td class="v">${String(st.USE_EMA_TREND)}</td></tr>
        <tr><td class="k">USE_STOCH</td><td class="v">${String(st.USE_STOCH)}</td></tr>
        <tr><td class="k">USE_BB</td><td class="v">${String(st.USE_BB)}</td></tr>
      </table>
      <div style="margin:6px 0 2px;font-weight:700">UI Checkboxes</div>
      <table>
        <tr><td class="k">useRSI</td><td class="v">${String(st.ui_useRSI)}</td></tr>
        <tr><td class="k">useMACD</td><td class="v">${String(st.ui_useMACD)}</td></tr>
        <tr><td class="k">useEMA</td><td class="v">${String(st.ui_useEMA)}</td></tr>
        <tr><td class="k">useStoch</td><td class="v">${String(st.ui_useStoch)}</td></tr>
        <tr><td class="k">useBB</td><td class="v">${String(st.ui_useBB)}</td></tr>
      </table>
      <div style="margin-top:6px;opacity:.8">${st.lastNote||''}</div>
      <div style="margin-top:8px;display:flex;gap:6px">
        <button id="dbgSync" style="flex:1;padding:6px;border-radius:8px;background:#1f2a44;color:#fff">Force sync</button>
        <button id="dbgRun" style="flex:1;padding:6px;border-radius:8px;background:#334155;color:#fff">Re-run</button>
      </div>
    `;
    const b1 = document.getElementById('dbgSync');
    const b2 = document.getElementById('dbgRun');
    b1.onclick=()=>{ try{ if (typeof loadSettings==='function') loadSettings(); }catch(e){}; st.lastNote='loadSettings() called'; setTimeout(tick,50); };
    b2.onclick=()=>{ try{ if (typeof runAnalysis==='function') runAnalysis(); else if (typeof run==='function') run(); }catch(e){}; st.lastNote='run() called'; setTimeout(tick,200); };
  

// injected: add live price & age rows to first debug table if present
try {
  var tbl = document.querySelector('#mobile-debug table');
  if (tbl) {
    var r1 = document.createElement('tr');
    var c11 = document.createElement('td'); c11.className='k'; c11.textContent='Live price';
    var c12 = document.createElement('td'); c12.className='v'; 
    c12.textContent = (typeof st.livePrice==='number' && isFinite(st.livePrice)) ? st.livePrice.toFixed(2) : '—';
    r1.appendChild(c11); r1.appendChild(c12);
    var r2 = document.createElement('tr');
    var c21 = document.createElement('td'); c21.className='k'; c21.textContent='Live age';
    var c22 = document.createElement('td'); c22.className=('v ' + ((st.liveAgeMs!=null && st.liveAgeMs < (window.__liveAgeOkMs||5000))?'ok':'bad'));
    c22.textContent = (st.liveAgeMs!=null) ? (Math.round(st.liveAgeMs)+' ms') : '—';
    r2.appendChild(c21); r2.appendChild(c22);
    // append if not already appended (avoid duplicates)
    var exists = false;
    tbl.querySelectorAll('tr').forEach(tr => {
      if (tr.textContent.includes('Live price') || tr.textContent.includes('Live age')) exists = true;
    });
    if (!exists) { tbl.appendChild(r1); tbl.appendChild(r2); }
  }
} catch(e) { /* ignore */ }

}

  function snapshot(){
    const series = (window.__lastSeriesForChart || window.__lastBaseSeries || null);
    st.csvRows = Array.isArray(series) ? series.length : 0;
    if (st.csvRows){
      const last = series[series.length-1];
      st.lastTs = last?.ts || last?.timestamp || null;
      st.lastLocal = st.lastTs ? loc(st.lastTs) : '';
    }
    const $ = id=>document.getElementById(id);
    st.autoChecked = !!($('autoInd') && $('autoInd').checked);
    st.USE_RSI = window.USE_RSI; st.USE_MACD=window.USE_MACD; st.USE_EMA_TREND=window.USE_EMA_TREND;
    st.USE_STOCH = window.USE_STOCH; st.USE_BB = window.USE_BB;
    st.ui_useRSI = !!($('useRSI') && $('useRSI').checked);
    st.ui_useMACD = !!($('useMACD') && $('useMACD').checked);
    st.ui_useEMA  = !!($('useEMA') && $('useEMA').checked);
    st.ui_useStoch= !!($('useStoch') && $('useStoch').checked);
    st.ui_useBB   = !!($('useBB') && $('useBB').checked);
  

// injected: capture live price & age
st.livePrice = (typeof window.__livePrice === 'number' && isFinite(window.__livePrice)) ? window.__livePrice : null;
st.liveAgeMs = (typeof window.__liveTimeMs === 'number' && isFinite(window.__liveTimeMs)) ? (Date.now() - window.__liveTimeMs) : null;
}

  function tick(){ snapshot(); render(); }
  setInterval(tick, 1000);

  // Hook CSV to be sure series cached
  const __old_fetchCsv = (typeof fetchCsv==='function') ? fetchCsv : null;
  if (__old_fetchCsv){
    window.fetchCsv = async function(url){
      const rows = await __old_fetchCsv(url);
      try{ if (Array.isArray(rows) && rows.length) window.__lastSeriesForChart = rows; }catch(e){}
      st.lastNote = 'CSV loaded: '+(Array.isArray(rows)?rows.length:0);
      tick();
      return rows;
    };
  }
})();
