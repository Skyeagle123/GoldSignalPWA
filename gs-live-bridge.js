
/*! GoldSignals Live Bridge (standalone)
 *  Drop-in file to be loaded AFTER your app.js.
 *  Goals:
 *   - Keep worker -> gold-ticks priority with freshness guard.
 *   - Ensure KPI and chart use the exact same number.
 *   - Restore the live line after reload/toggles without modifying your app.js.
 *  Safe: add-only, idempotent. Set window.GS_BRIDGE_DISABLE = true to disable.
 */
(function(){
  if (window.GS_BRIDGE_DISABLE) return;
  if (window.__GS_LIVE_BRIDGE__) return;
  window.__GS_LIVE_BRIDGE__ = "1.0.0";

  // ---- Config (edit if your domains differ) ----
  const WORKER_URL    = "https://workerjs.samer-mourtada.workers.dev/price";
  const GOLDTICKS_URL = "https://gold-ticks.samer-mourtada.workers.dev/price";
  const FRESH_S = 3;  // worker tick older than 3s => consider stale

  // ---- Utilities ----
  const N = v => (Number.isFinite(+v) ? +v : null);
  async function fetchJsonNoCache(url){
    const bust = (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    const r = await fetch(url + bust, {
      cache: "no-store",
      headers: { "cache-control": "no-cache, no-store" }
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  }

  async function getLiveWorkerFirst(){
    const now = Date.now();
    let w=null;
    try{ w = await fetchJsonNoCache(WORKER_URL); }catch(_){}
    const wp = N(w && (w.price ?? w.close));
    const wt = N(w && (w.ts ?? w.timeMs ?? w.timestamp));
    const wFresh = (wp!=null) && (wt==null || (now - wt) <= FRESH_S*1000);
    if (wFresh) return { price: wp, ts: wt ?? now, source: "worker" };

    let g=null;
    try{ g = await fetchJsonNoCache(GOLDTICKS_URL); }catch(_){}
    const gp = N(g && (g.price ?? g.close));
    const gt = N(g && (g.ts ?? g.timeMs ?? g.timestamp));
    if (gp!=null) return { price: gp, ts: gt ?? now, source: "gold-ticks" };

    if (wp!=null) return { price: wp, ts: wt ?? now, source: "worker(stale)" };
    throw new Error("no_live_price");
  }

  function applyLive(price, ts){
    const p = N(price); if (p==null) return false;
    const t = N(ts) ?? Date.now();
    window.__livePrice  = p;
    window.__liveTimeMs = t;
    window.LAST_LIVE    = { price: p, timeMs: t };
    try{
      if (typeof window.reprojectWithLive === 'function'){
        window.reprojectWithLive();
      }
      if (typeof window.updateLiveLabel === 'function'){
        window.updateLiveLabel(p);
      }
    }catch(_){}
    return true;
  }

  // ---- Hard unifier: hook paintLive so KPI drives the chart ----
  (function hookPaintLive(){
    try{
      if (typeof window.paintLive === 'function' && !window.__GS_BRIDGE_PAINT__){
        window.__GS_BRIDGE_PAINT__ = true;
        const orig = window.paintLive;
        window.paintLive = function(price, ts){
          applyLive(price, ts);
          try{ return orig.apply(this, arguments); }
          finally{
            try{
              if (typeof window.reprojectWithLive === 'function'){
                setTimeout(window.reprojectWithLive, 0);
                setTimeout(window.reprojectWithLive, 180);
              }
            }catch(_){}
          }
        };
      }
    }catch(_){}
  })();

  // ---- Soft unifier: override fetchLivePrice to reuse fresh __livePrice ----
  (function hookFetchLive(){
    try{
      if (typeof window.fetchLivePrice === 'function' && !window.__GS_BRIDGE_FETCH__){
        window.__GS_BRIDGE_FETCH__ = true;
        window.__origFetchLivePrice = window.fetchLivePrice;
        window.fetchLivePrice = async function(){
          const now = Date.now();
          if (Number.isFinite(window.__livePrice) && Number.isFinite(window.__liveTimeMs) && (now - window.__liveTimeMs) < 1200){
            return window.__livePrice;
          }
          try{
            const t = await getLiveWorkerFirst();
            applyLive(t.price, t.ts);
            return t.price;
          }catch(_){}
          return await window.__origFetchLivePrice();
        };
      }
    }catch(_){}
  })();

  // ---- Minimal poller to keep things moving if app loop stops ----
  (function smallLoop(){
    if (window.__GS_BRIDGE_LOOP__) return;
    window.__GS_BRIDGE_LOOP__ = true;
    (async function loop(){
      while(true){
        try{
          // If we've not updated recently, fetch once
          const now = Date.now();
          const stale = !Number.isFinite(window.__liveTimeMs) || (now - window.__liveTimeMs) > 1500;
          if (stale){
            const t = await getLiveWorkerFirst();
            applyLive(t.price, t.ts);
          }else if (window.LAST_LIVE && typeof window.reprojectWithLive === 'function'){
            // keep overlay sticky
            window.reprojectWithLive();
          }
        }catch(_){}
        await new Promise(r => setTimeout(r, 800));
      }
    })();
  })();

  // ---- Re-apply on UI events (reloads / toggles like "دقيق") ----
  (function reapplyOnEvents(){
    const reapply = ()=>{
      try{
        if (window.LAST_LIVE && typeof window.reprojectWithLive === 'function'){
          setTimeout(window.reprojectWithLive, 50);
          setTimeout(window.reprojectWithLive, 250);
        }
      }catch(_){}
    };
    ['visibilitychange','focus','resize','hashchange','pageshow','load'].forEach(ev => addEventListener(ev, reapply, { passive:true }));
    addEventListener('change', (e)=>{
      const t = e.target;
      if (!(t && (t.tagName==='INPUT' || t.tagName==='SELECT'))) return;
      reapply();
    }, true);
    document.addEventListener('click', (e)=>{
      const txt = (e.target && (e.target.innerText||e.target.textContent||'')).trim();
      if (/CSV|حساب الإشارات الآن|تحديث تلقائي/i.test(txt)) setTimeout(reapply, 600);
    }, true);
  })();
})();
