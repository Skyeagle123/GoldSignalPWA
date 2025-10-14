
/* ==== GS HARD LOCK (worker-only) v1 ==== */
(function(){
  if (window.__GS_HARD_LOCK__) return; window.__GS_HARD_LOCK__ = true;

  const WORKER_URL = 'https://workerjs.samer-mourtada.workers.dev/price';

  function num(x){ const n = Number(x); return Number.isFinite(n) ? n : null; }
  function fmt(v){ try{ return (Math.round(v*100)/100).toFixed(2); }catch(_){ return String(v); } }

  async function fetchWorkerPrice(){
    const u = WORKER_URL + (WORKER_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
    const r = await fetch(u, { cache:'no-store', headers:{'cache-control':'no-cache, no-store','accept':'application/json'} });
    const ct = (r.headers.get('content-type')||'').toLowerCase();
    const text = await r.text();
    try{
      if (ct.includes('json') || text.trim().startsWith('{')){
        const j = JSON.parse(text);
        return { price: num(j.price ?? j.close), ts: num(j.ts ?? j.timeMs ?? j.timestamp) || Date.now() };
      }
    }catch(_){}
    const m = text.match(/[+-]?\d+(?:\.\d+)?/g);
    return { price: (m && m.length ? num(m.pop()) : null), ts: Date.now() };
  }

  function setKpi(p, tms){
    try{
      const el = document.getElementById('livePrice');
      if (el) el.textContent = fmt(p);
    }catch(_){}
    try{
      const lt = document.getElementById('liveTime');
      if (lt){ const d = new Date(tms); lt.textContent = d.toISOString().replace('T',' ').replace('Z',''); }
    }catch(_){}
  }

  async function tick(){
    try{
      const { price, ts } = await fetchWorkerPrice();
      if (price == null) return;
      // unify globals
      window.__livePrice  = price;
      window.__liveTimeMs = ts;
      window.LAST_LIVE    = { price, timeMs: ts };
      // update KPI
      setKpi(price, ts);
      // paint chart
      try{ if (typeof paintLive === 'function') paintLive(price, ts); }catch(_){}
      try{ if (typeof reprojectWithLive === 'function') reprojectWithLive(); }catch(_){}
    }catch(_){}
  }

  // keep repairing KPI node if DOM rebuilt
  const mo = new MutationObserver(()=>{
    // re-apply current value if exists
    if (typeof window.__livePrice === 'number' && isFinite(window.__livePrice)){
      setKpi(window.__livePrice, window.__liveTimeMs || Date.now());
    }
  });
  try{ mo.observe(document.documentElement, { childList:true, subtree:true }); }catch(_){}

  // small badge once to confirm load
  try{
    const b = document.createElement('div');
    Object.assign(b.style, {position:'fixed',right:'10px',bottom:'10px',background:'#0b5',color:'#fff',padding:'6px 10px',borderRadius:'8px',font:'12px/1.2 sans-serif',zIndex:999999});
    b.textContent='GS lock active'; document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(b)); setTimeout(()=>{try{b.remove()}catch(_){}} , 3500);
  }catch(_){}

  clearInterval(window.__GS_HARD_TIMER__);
  window.__GS_HARD_TIMER__ = setInterval(tick, 1000);
  tick();
})();
