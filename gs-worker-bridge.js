/* ======================================================================
   GoldSignals → Worker Bridge (manual + auto) • v4
   - إرسال يدوي يعمل حتى بحالة (إطلاع فقط)
   - إرسال تلقائي مرّة لكل شمعة عندما تصبح النصيحة فعلية
   - send() نفسها تُكمّل القيم من نص "نصيحة الدخول/الخروج" إذا ناقصة
   ====================================================================== */



// --- GoldSignals: local notification after successful /alert (added) ---
async function notifyLocalAfterSuccess(title, body, url) {
  try {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title || 'GoldSignals', {
      body: body || '',
      icon: './icon.svg',
      data: { url: url || (location.origin + location.pathname) }
    });
  } catch {}
}
// --- end additions ---

(function(){
  const NOTIFY_URL = "https://goldsignalsx-worker.samer-mourtada.workers.dev/notify";
  const LEGACY_ALERT_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  // ---------- Helpers ----------
  function toNum(v){
    if (v == null) return null;
    const x = Number(String(v).replace(/[^\d.-]/g,''));
    return Number.isFinite(x) ? x : null;
  }
  function num(v){ return toNum(v); }

  function tfFromDom(){
    try{
      if (typeof currentTF !== "undefined" && currentTF){
        if (typeof currentTF === 'number'){
          if (currentTF === 60) return '1h';
          if (currentTF >= 120 && currentTF % 60 === 0) return (currentTF/60)+'h';
          return currentTF + 'm';
        }
        return String(currentTF);
      }
      if (typeof tfShort === "function"){
        const t = tfShort(); if (t) return t;
      }
      const el5=document.getElementById('tf5'), el30=document.getElementById('tf30'),
            el60=document.getElementById('tf60'), elD=document.getElementById('tfD');
      if (el5?.checked)  return '5m';
      if (el30?.checked) return '30m';
      if (el60?.checked) return '1h';
      if (elD?.checked)  return '1d';
    }catch(_){}
    return '30m';
  }

  function tfToMs(tf){
    if(!tf) return null;
    const m = String(tf).trim().toLowerCase().match(/^(\d+)\s*([mhd])$/);
    if(!m) return null;
    const n = Number(m[1]); const u = m[2];
    if(u==='m') return n*60*1000;
    if(u==='h') return n*60*60*1000;
    if(u==='d') return n*24*60*60*1000;
    return null;
  }

  // Detect side + preview flag from advice text
  function detectSideFromAdvice(){
    const el = document.getElementById('adviceText');
    if (!el) return '';
    const t = (el.textContent || el.innerText || '').trim();
    if (t.includes(' الإشارة: شراء') || t.includes('الملخص: شراء')) return 'BUY';
    if (t.includes(' الإشارة: بيع')  || t.includes('الملخص: بيع'))  return 'SELL';
    return '';
  }
  function detectSideFromAdviceText(){
    const side = detectSideFromAdvice();
    const el = document.getElementById('adviceText');
    const t = (el?.textContent || el?.innerText || '').trim();
    const previewOnly = t.includes('(إطلاع فقط)');
    return { side, previewOnly };
  }

  // Parse levels from advice text (robust)
  function parseAdviceLevels(){
    const el = document.getElementById('adviceText');
    const t0 = (el?.textContent || el?.innerText || '').replace(/\s+/g,' ').trim();
    if (!t0) return { entry:null, tp1:null, tp2:null, sl:null };
    const t = t0
      .replace(/[٫٬،]/g, ',')   // Arabic commas/decimal separators → comma
      .replace(/[：:]/g, ':')
      .replace(/\u200f|\u200e/g, ''); // RTL marks

    // Try explicit TP1/TP2 fields
    const mTP1 = t.match(/TP1\s*:\s*([0-9,.\-]+)/i);
    const mTP2 = t.match(/TP2\s*:\s*([0-9,.\-]+)/i);
    // Combined "TP1/TP2: X , Y" pattern
    const mTPs = t.match(/TP1\/TP2\s*:\s*[^0-9\-]*([0-9,.\-]+)\s*[,/]\s*([0-9,.\-]+)/i);

    const mSL  = t.match(/\bSL\s*:\s*([0-9,.\-]+)/i);
    const mEntry = (
      t.match(/(?:سعر الدخول|Entry)\s*:\s*([0-9,.\-]+)/i)
      || t.match(/آخر سعر\s*:\s*([0-9,.\-]+)/i)
    );

    let tp1 = null, tp2 = null;
    if (mTP1 && mTP2){ tp1 = toNum(mTP1[1]); tp2 = toNum(mTP2[1]); }
    else if (mTPs){ tp1 = toNum(mTPs[1]); tp2 = toNum(mTPs[2]); }

    const entry = toNum(mEntry && mEntry[1]);
    const sl    = toNum(mSL && mSL[1]);

    // Sanity: ignore tiny numbers (e.g., "2.00") that are obviously not prices
    const sane = v => (v!=null && v>=100 ? v : null);
    return {
      entry: sane(entry) ?? entry,
      tp1:   sane(tp1)   ?? tp1,
      tp2:   sane(tp2)   ?? tp2,
      sl:    sane(sl)    ?? sl
    };
  }

  // ---------- Core send() ----------
  async function send(side, entry){
    try{
      const L = (typeof window.__lastLinesForChart !== "undefined" && window.__lastLinesForChart) || null;
      // start with values from JS state
      let payload = {
        side,
        tf: tfFromDom(),
        entry: num(entry) ?? (L ? num(L.entry) : null),
        tp1:   L ? num(L.tp1) : null,
        tp2:   L ? num(L.tp2) : null,
        sl:    L ? num(L.sl)  : null,
        price: num(entry) ?? (typeof window.__livePrice !== "undefined" ? num(window.__livePrice) : (L ? num(L.entry) : null)),
        filtersRejected: false
      };

      // override from advice text if any are missing
      const P = parseAdviceLevels();
      if (!Number.isFinite(payload.entry) && Number.isFinite(P.entry)) payload.entry = P.entry;
      if (!Number.isFinite(payload.tp1)   && Number.isFinite(P.tp1))   payload.tp1   = P.tp1;
      if (!Number.isFinite(payload.tp2)   && Number.isFinite(P.tp2))   payload.tp2   = P.tp2;
      if (!Number.isFinite(payload.sl)    && Number.isFinite(P.sl))    payload.sl    = P.sl;

      const text = [
        `GoldSignals ${payload.side || ''} • ${payload.tf || ''}`,
        `Entry: ${payload.entry ?? '—'}`,
        `TP1: ${payload.tp1 ?? '—'} • TP2: ${payload.tp2 ?? '—'}`,
        `SL: ${payload.sl ?? '—'}`
      ].join('\n');

      let r = await fetch(NOTIFY_URL, {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ text })
      });
      let resp = await r.json().catch(()=>({}));
      if (!r.ok || !resp?.ok) {
        r = await fetch(LEGACY_ALERT_URL, {
          method:'POST', headers:{'content-type':'application/json'},
          body: JSON.stringify(payload)
        });
        resp = await r.json().catch(()=>({}));
      }
      console.log('[GS] sent:', payload, '| worker:', resp);
      return resp;
    }catch(err){
      console.error('[GS] notify failed:', err);
      return { ok:false, error:String(err) };
    }
  }

  // ---------- Manual button ----------
  function wireManualButton(){
    const btn = document.getElementById('sendAlertBtn');
    if (!btn) return;
    btn.style.display = 'inline-block';
    btn.addEventListener('click', async () => {
      if (window.__marketDataFresh === false) {
        alert('السعر متأخر أو منقطع. تم منع إرسال التنبيه حفاظاً على السلامة.');
        return;
      }
      const side = detectSideFromAdvice();
      if (!side){ alert('لا يوجد اتجاه واضح (شراء/بيع) في النصيحة.'); return; }

      const L = window.__lastLinesForChart || null;
      let entry = L && Number.isFinite(L.entry) ? L.entry :
                  (typeof window.__livePrice !== 'undefined' ? toNum(window.__livePrice) : null);

      const resp = await send(side, entry);
      console.log('[GS][MANUAL]', { side, entry, resp });
      if (!resp?.ok) alert('فشل الإرسال إلى الووركر. افحص Network/Console.');
      else { await notifyLocalAfterSuccess('GoldSignals', `${side} ${typeof tfFromDom==='function'?tfFromDom():''} • Entry ${entry ?? ''}`, location.href); alert('تم إرسال التنبيه إلى تلغرام ✔️'); }
    });
  }

  // ---------- Auto send per candle ----------
  const __AUTO_SENT = new Map(); // key=tf -> { candleStart, side }

  async function maybeAutoSend(){
    const { side, previewOnly } = detectSideFromAdviceText();
    if (!side || previewOnly || window.__marketDataFresh === false) return;

    const tf = tfFromDom();
    const tfMs = tfToMs(tf); if (!tfMs) return;
    const candleStart = Math.floor(Date.now()/tfMs)*tfMs;
    const last = __AUTO_SENT.get(tf);
    if (last && last.candleStart === candleStart && last.side === side) return;

    // Use send() which now fills from text if missing
    const L = window.__lastLinesForChart || null;
    const entry = L?.entry ?? (typeof window.__livePrice !== 'undefined' ? toNum(window.__livePrice) : null);

    try {
      const r = await send(side, entry);
      console.log('[GS][AUTO] sent', { tf, side, entry, r });
      if (r?.ok) __AUTO_SENT.set(tf, { candleStart, side });
    } catch (e) {
      console.warn('[GS][AUTO] failed:', e);
    }
  }

  function observeAdvice(){
    const el = document.getElementById('adviceText');
    if (!el || typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(() => { maybeAutoSend(); });
    obs.observe(el, { childList:true, characterData:true, subtree:true });
    setTimeout(maybeAutoSend, 800);
  }

  // Boot
  window.addEventListener('DOMContentLoaded', () => {
    wireManualButton();
    observeAdvice();
  });
})();
