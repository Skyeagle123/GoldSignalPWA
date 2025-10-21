/* ======= In-App Mobile Debug Overlay (full, with Day High/Low/Open, Prev Day, latency, copy, drag, persistence) ======= */
(function(){
  const st = {
    csvRows: 0, lastTs: null, lastLocal: '',
    autoChecked: false,
    USE_RSI: undefined, USE_MACD: undefined, USE_EMA_TREND: undefined, USE_STOCH: undefined, USE_BB: undefined,
    ui_useRSI: undefined, ui_useMACD: undefined, ui_useEMA: undefined, ui_useStoch: undefined, ui_useBB: undefined,
    livePrice: null, liveAgeMs: null, lastNote: '',
    dayOpen: null, dayHigh: null, dayLow: null, dayMode: 'local', // 'local' | 'ny'
    prev: { high:null, low:null, close:null },
    latArr: [], // rolling latency
  };

  /* ---------- CSS ---------- */
  const css = `
  #dbgBtn{
    position:fixed;right:14px;bottom:16px;width:52px;height:52px;border-radius:50%;
    background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;
    font:700 12px system-ui;box-shadow:0 6px 16px rgba(0,0,0,.35);z-index:2147483647;
  }
  #dbgPane{
    position:fixed;right:12px;bottom:78px;min-width:290px;max-width:96vw;max-height:80vh;overflow:auto;
    background:#0b1324;color:#e5e7eb;border:1px solid #1f2a44;border-radius:12px;padding:10px 12px;
    font:12px/1.4 system-ui;z-index:2147483646;-webkit-overflow-scrolling:touch;
    box-shadow:0 8px 30px rgba(0,0,0,.35);
  }
  #dbgPane.full{top:10px;right:10px;bottom:10px;left:10px;max-height:none;width:auto;max-width:none;}
  #dbgPane table{width:100%;border-collapse:collapse;}
  #dbgPane td{padding:4px 5px;border-bottom:1px solid #1d2540;vertical-align:middle}
  #dbgPane .k{opacity:.75}
  #dbgPane .v{font-weight:600}
  #dbgPane .ok{color:#22c55e} #dbgPane .bad{color:#ef4444}
  #dbgHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
  #dbgHead .title{font-weight:800}
  #dbgHead button{background:#1f2a44;color:#fff;border:0;border-radius:8px;padding:4px 8px}
  #dbgTog{
    display:inline-flex;gap:6px;align-items:center;font:600 11px system-ui;margin-bottom:6px
  }
  #dbgTog button{border:1px solid #1f2a44;background:#0f172a;color:#cbd5e1;padding:2px 8px;border-radius:8px}
  #dbgTog button.on{background:#1f2a44;color:#fff}
  #dbgPane .pill{display:inline-block;border:1px solid #1f2a44;background:#0f172a;border-radius:8px;padding:2px 6px;margin-left:6px}
  #dbgFootBtns button{flex:1;padding:6px;border-radius:8px}
  #dbgCopy{margin-left:6px;padding:0 6px;border-radius:6px;border:1px solid #1f2a44;background:#0f172a;color:#cbd5e1}
  `;
  const style=document.createElement('style'); style.textContent=css; document.head.appendChild(style);

  /* ---------- UI skeleton ---------- */
  const btn=document.createElement('button'); btn.id='dbgBtn'; btn.type='button'; btn.textContent='DBG';
  const pane=document.createElement('div'); pane.id='dbgPane'; pane.style.display='none';
  document.body.appendChild(btn); document.body.appendChild(pane);
  const togglePane = () => {
    pane.style.display = (pane.style.display==='none'?'block':'none');
    try{ localStorage.setItem('dbg.open', String(pane.style.display!=='none')); }catch(_){}
  };
  btn.onclick=togglePane;

  /* ---------- helpers ---------- */
  const $ = id=>document.getElementById(id);
  const toNum=v=>typeof v==='number'?v:parseFloat(String(v??'').replace(',','.'));
  function loc(ts){ if(!ts) return ''; try{ const d=new Date(ts); return d.toLocaleDateString()+' '+d.toLocaleTimeString(); }catch(e){ return ''; } }

  // يوم محلي أو يوم نيويورك (تقريب صيفي UTC-4 شائع للتداول)
  function dayStartTs(now=Date.now(), mode='local'){
    const d = new Date(now);
    if (mode==='ny'){
      const nyOffset = 4; // DST approximation
      const utcMs = now + d.getTimezoneOffset()*60*1000;
      const nyMs  = utcMs - nyOffset*60*60*1000;
      const ny = new Date(nyMs);
      ny.setHours(0,0,0,0);
      const startUtc = ny.getTime() + nyOffset*60*60*1000;
      return startUtc - d.getTimezoneOffset()*60*1000;
    } else {
      d.setHours(0,0,0,0);
      return d.getTime();
    }
  }

  function render(){
    const ageOkMs = window.__liveAgeOkMs || 5000;
    const ageCls  = (st.liveAgeMs!=null && st.liveAgeMs < ageOkMs) ? 'ok':'bad';
    const rowsOk  = st.csvRows>0;
    const avg = st.latArr.length ? Math.round(st.latArr.reduce((a,b)=>a+b,0)/st.latArr.length) : null;

    // Border color alert if delayed
    pane.style.borderColor = (st.liveAgeMs!=null && st.liveAgeMs>ageOkMs) ? '#ef4444' : '#1f2a44';

    pane.innerHTML = `
      <div id="dbgHead">
        <div class="title">Mobile Debug</div>
        <div>
          <button id="dbgExpand">⤢</button>
          <button id="dbgClose">×</button>
        </div>
      </div>

      <div id="dbgTog">
        <span>Day mode:</span>
        <button id="togLocal" class="${st.dayMode==='local'?'on':''}">Local</button>
        <button id="togNY"    class="${st.dayMode==='ny'?'on':''}">NY</button>
        ${(st.liveAgeMs!=null)?`<span class="pill">Avg: ${avg!=null?avg+' ms':'—'}</span>`:''}
      </div>

      <table id="dbgTable1">
        <tr><td class="k">CSV rows</td><td class="v ${rowsOk?'ok':'bad'}">${st.csvRows||0}</td></tr>
        <tr><td class="k">Last bar (local)</td><td class="v">${st.lastLocal || '—'}</td></tr>
        <tr><td class="k">Auto checked</td><td class="v">${st.autoChecked}</td></tr>
        <tr><td class="k">Live price</td>
            <td class="v">${(typeof st.livePrice==='number'&&isFinite(st.livePrice))?st.livePrice.toFixed(2):'—'}
              <button id="dbgCopy">Copy</button>
            </td></tr>
        <tr><td class="k">Live age</td><td class="v ${ageCls}">${(st.liveAgeMs!=null)?(Math.round(st.liveAgeMs)+' ms'):'—'} (thr: ${Math.round(ageOkMs/1000)}s)</td></tr>
      </table>

      <div style="margin:6px 0 2px;font-weight:700">Day Range (${st.dayMode.toUpperCase()})</div>
      <table id="dbgDay">
        <tr><td class="k">Open</td><td class="v">${st.dayOpen!=null?st.dayOpen.toFixed(2):'—'}</td></tr>
        <tr><td class="k">High</td><td class="v">${st.dayHigh!=null?st.dayHigh.toFixed(2):'—'}</td></tr>
        <tr><td class="k">Low</td><td class="v">${st.dayLow!=null?st.dayLow.toFixed(2):'—'}</td></tr>
      </table>

      ${st.prev && st.prev.high!=null ? `
      <div style="margin:6px 0 2px;font-weight:700">Prev Day</div>
      <table>
        <tr><td class="k">High</td><td class="v">${st.prev.high.toFixed(2)}</td></tr>
        <tr><td class="k">Low</td><td class="v">${st.prev.low.toFixed(2)}</td></tr>
        <tr><td class="k">Close</td><td class="v">${st.prev.close.toFixed(2)}</td></tr>
      </table>` : ''}

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
      <div id="dbgFootBtns" style="margin-top:8px;display:flex;gap:6px">
        <button id="dbgTest"  style="background:#0ea5e9;color:#fff">Test alert</button>
        <button id="dbgSync"  style="background:#1f2a44;color:#fff">Force sync</button>
        <button id="dbgRun"   style="background:#334155;color:#fff">Re-run</button>
      </div>
    `;

    // Header buttons
    pane.querySelector('#dbgExpand').onclick = () => pane.classList.toggle('full');
    pane.querySelector('#dbgClose').onclick  = togglePane;

    // Day mode toggle + persistence
    pane.querySelector('#togLocal').onclick = ()=>{ st.dayMode='local'; try{localStorage.setItem('dbg.dayMode',st.dayMode);}catch(_){}
      tick(); };
    pane.querySelector('#togNY').onclick    = ()=>{ st.dayMode='ny';    try{localStorage.setItem('dbg.dayMode',st.dayMode);}catch(_){}
      tick(); };

    // Copy live price
    const c = pane.querySelector('#dbgCopy');
    if (c) c.onclick = () => { if (typeof st.livePrice==='number' && isFinite(st.livePrice)) navigator.clipboard?.writeText(st.livePrice.toFixed(2)); };

    // Actions
    pane.querySelector('#dbgSync').onclick = () => { try{ if (typeof loadSettings==='function') loadSettings(); }catch(e){}; st.lastNote='loadSettings() called'; setTimeout(tick,120); };
    pane.querySelector('#dbgRun').onclick  = () => { try{ if (typeof runAnalysis==='function') runAnalysis(); else if (typeof run==='function') run(); }catch(e){}; st.lastNote='run() called'; setTimeout(tick,200); };
    pane.querySelector('#dbgTest').onclick = () => {
      const msg = `🔔 Test\nPrice: ${(typeof st.livePrice==='number'&&isFinite(st.livePrice))?st.livePrice.toFixed(2):'—'}`;
      if (window.TELEGRAM_WEBHOOK_URL) fetch(window.TELEGRAM_WEBHOOK_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: msg})});
      st.lastNote = 'Test alert sent';
      setTimeout(tick,200);
    };
  }

  /* ---------- snapshot ---------- */
  function snapshot(){
    const series = (window.__lastSeriesForChart || window.__lastBaseSeries || null);
    st.csvRows = Array.isArray(series) ? series.length : 0;
    if (st.csvRows){
      const last = series[series.length-1];
      st.lastTs = last?.ts || last?.timestamp || last?.t || null;
      st.lastLocal = st.lastTs ? loc(st.lastTs) : '';
    }

    st.autoChecked = !!($('autoInd') && $('autoInd').checked);
    st.USE_RSI = window.USE_RSI; st.USE_MACD=window.USE_MACD; st.USE_EMA_TREND=window.USE_EMA_TREND;
    st.USE_STOCH = window.USE_STOCH; st.USE_BB = window.USE_BB;
    st.ui_useRSI = !!($('useRSI') && $('useRSI').checked);
    st.ui_useMACD = !!($('useMACD') && $('useMACD').checked);
    st.ui_useEMA  = !!($('useEMA') && $('useEMA').checked);
    st.ui_useStoch= !!($('useStoch') && $('useStoch').checked);
    st.ui_useBB   = !!($('useBB') && $('useBB').checked);

    // Live info
    st.livePrice = (typeof window.__livePrice === 'number' && isFinite(window.__livePrice)) ? window.__livePrice : null;
    st.liveAgeMs = (typeof window.__liveTimeMs === 'number' && isFinite(window.__liveTimeMs)) ? (Date.now() - window.__liveTimeMs) : null;
    if (st.liveAgeMs!=null) { st.latArr.push(st.liveAgeMs); if (st.latArr.length>10) st.latArr.shift(); }

    // --- Day High/Low/Open + Prev Day ---
    st.dayOpen = st.dayHigh = st.dayLow = null;
    st.prev = { high:null, low:null, close:null };
    const now = Date.now();
    const startTs = dayStartTs(now, st.dayMode);
    const prevStart = dayStartTs(now - 24*3600*1000, st.dayMode);
    if (Array.isArray(series) && series.length){
      for (let i=0;i<series.length;i++){
        const r = series[i];
        const ts = r.ts || r.timestamp || r.t;
        const p  = toNum(r.c || r.price || r.close || r[4] || r.v);
        if (!Number.isFinite(ts) || !Number.isFinite(p)) continue;
        if (ts >= startTs){
          if (st.dayOpen==null) st.dayOpen = p;
          if (st.dayHigh==null || p>st.dayHigh) st.dayHigh = p;
          if (st.dayLow ==null || p<st.dayLow ) st.dayLow  = p;
        } else if (ts >= prevStart && ts < startTs){
          if (st.prev.high==null||p>st.prev.high) st.prev.high=p;
          if (st.prev.low ==null||p<st.prev.low)  st.prev.low =p;
          st.prev.close=p;
        }
      }
    }
    // دمج السعر الحي في المدى إذا موجود
    if (Number.isFinite(st.livePrice)){
      if (st.dayOpen==null) st.dayOpen = st.livePrice;
      if (st.dayHigh==null || st.livePrice>st.dayHigh) st.dayHigh = st.livePrice;
      if (st.dayLow ==null  || st.livePrice<st.dayLow ) st.dayLow  = st.livePrice;
    }
  }

  function tick(){ snapshot(); render(); }
  setInterval(tick, 1000);

  // Hook CSV to cache series & show counts
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

  // Hotkeys: Shift+D و hash #dbg + persistence
  window.addEventListener('keydown', (e)=>{ if (e.shiftKey && (e.key==='d'||e.key==='D')) { togglePane(); } });
  try{
    const savedOpen = localStorage.getItem('dbg.open');
    if (savedOpen==='true' || location.hash.toLowerCase().includes('dbg')) pane.style.display='block';
    const savedMode = localStorage.getItem('dbg.dayMode'); if (savedMode) st.dayMode = savedMode;
  }catch(_){}

  // --- Drag support (touch & mouse) ---
  let dragging=false, sx=0, sy=0, ox=null, oy=null;
  function startDrag(x,y){ if (pane.classList.contains('full')) return; dragging=true; sx=x; sy=y;
    const rect = pane.getBoundingClientRect(); ox = rect.left; oy = rect.top; }
  function moveDrag(x,y){ if(!dragging) return;
    const dx=x-sx, dy=y-sy; pane.style.left=(ox+dx)+'px'; pane.style.top=(oy+dy)+'px';
    pane.style.right='auto'; pane.style.bottom='auto'; }
  function endDrag(){ dragging=false; try{ localStorage.setItem('dbg.pos', JSON.stringify({left:pane.style.left, top:pane.style.top})); }catch(_){ } }

  pane.addEventListener('touchstart', e=>{ const t=e.touches[0]; startDrag(t.clientX,t.clientY); }, {passive:true});
  pane.addEventListener('touchmove',  e=>{ const t=e.touches[0]; moveDrag(t.clientX,t.clientY); }, {passive:true});
  pane.addEventListener('touchend',   endDrag, {passive:true});
  pane.addEventListener('mousedown',  e=>{ startDrag(e.clientX,e.clientY); });
  window.addEventListener('mousemove',e=>{ moveDrag(e.clientX,e.clientY); });
  window.addEventListener('mouseup',  endDrag);

  // restore saved pos
  try{
    const pos = JSON.parse(localStorage.getItem('dbg.pos')||'null');
    if (pos && pos.left && pos.top){ pane.style.left=pos.left; pane.style.top=pos.top; pane.style.right='auto'; pane.style.bottom='auto'; }
  }catch(_){}
})();


/* === PATCH: Make 'Test alert' do local beep + browser notification === */
try {
  const btn = document.getElementById('dbgTest');
  if (btn && !btn.__patched) {
    btn.__patched = true;
    btn.addEventListener('click', () => {
      try { if (typeof beep === 'function') beep(); } catch(_) {}
      try { if (typeof webNotify === 'function') webNotify('تنبيه تجريبي', 'هذا اختبار للتنبيه المحلي'); } catch(_) {}
    });
  }
} catch (e) {
  console.warn('Test alert patch failed', e);
}

