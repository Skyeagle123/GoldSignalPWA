/* ======================================================================
   GoldSignals → Worker Bridge (manual + auto) • v3
   - يرسل تنبيه تلغرام يدويًا حتى لو الحالة (إطلاع فقط)
   - إرسال تلقائي مرّة واحدة لكل شمعة عندما تصبح النصيحة فعلية ويوجد TP/SL
   - يعتمد أولًا على __lastLinesForChart، وإذا ناقص → يقرأ من نص "نصيحة الدخول/الخروج"
   ====================================================================== */

(function(){
  // ✏️ عدّل مسار الوركر إذا لزم
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

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

  // يقرأ المستويات من نص "نصيحة الدخول/الخروج"
  function parseAdviceLevels(){
    const el = document.getElementById('adviceText');
    const t = (el?.textContent || el?.innerText || '').replace(/\s+/g,' ').trim();
    // أمثلة: "SL: 4,269.74 • TP1/TP2: • 4,289.98 , 4,295.87"
    const mSL  = t.match(/SL\s*[:：]\s*([0-9,.\-]+)/i);
    const mTPs = t.match(/TP1\/TP2\s*[:：][^0-9\-]*([0-9,.\-]+)\s*[,،]\s*([0-9,.\-]+)/i);
    const mEntry = t.match(/(?:سعر الدخول|Entry)\s*[:：]\s*([0-9,.\-]+)/i) || t.match(/آخر سعر\s*[:：]\s*([0-9,.\-]+)/i);
    return {
      entry: toNum(mEntry && (mEntry[1] || mEntry[2])),
      tp1:   toNum(mTPs && mTPs[1]),
      tp2:   toNum(mTPs && mTPs[2]),
      sl:    toNum(mSL  && mSL[1]),
    };
  }

  // ---------- Core send() ----------
  async function send(side, entry){
    try{
      const L = (typeof window.__lastLinesForChart !== "undefined" && window.__lastLinesForChart) || null;
      const payload = {
        side,
        tf: tfFromDom(),
        entry: num(entry) ?? (L ? num(L.entry) : null),
        tp1:   L ? num(L.tp1) : null,
        tp2:   L ? num(L.tp2) : null,
        sl:    L ? num(L.sl)  : null,
        price: num(entry) ?? (typeof window.__livePrice !== "undefined" ? num(window.__livePrice) : (L ? num(L.entry) : null)),
        filtersRejected: false
      };
      const r = await fetch(WORKER_URL, {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify(payload)
      });
      const resp = await r.json().catch(()=>({}));
      console.log('[GS] sent:', payload, '| worker:', resp);
      return resp;
    }catch(err){
      console.error('[GS] notify failed:', err);
      return { ok:false, error:String(err) };
    }
  }

  // ---------- Manual button (always visible) ----------
  function wireManualButton(){
    const btn = document.getElementById('sendAlertBtn');
    if (!btn) return;
    btn.style.display = 'inline-block';
    btn.addEventListener('click', async () => {
      const side = detectSideFromAdvice();
      if (!side){ alert('لا يوجد اتجاه واضح (شراء/بيع) في النصيحة.'); return; }

      // جرّب من __lastLinesForChart أولًا
      const L = window.__lastLinesForChart || null;
      let entry = L && Number.isFinite(L.entry) ? L.entry :
                  (typeof window.__livePrice !== 'undefined' ? toNum(window.__livePrice) : null);
      let tp1 = L && Number.isFinite(L.tp1) ? L.tp1 : null;
      let tp2 = L && Number.isFinite(L.tp2) ? L.tp2 : null;
      let sl  = L && Number.isFinite(L.sl)  ? L.sl  : null;

      // إن ناقص، خُد من النص
      if (!(Number.isFinite(tp1) && Number.isFinite(tp2) && Number.isFinite(sl))) {
        const P = parseAdviceLevels();
        entry = Number.isFinite(entry) ? entry : P.entry;
        tp1   = Number.isFinite(tp1)   ? tp1   : P.tp1;
        tp2   = Number.isFinite(tp2)   ? tp2   : P.tp2;
        sl    = Number.isFinite(sl)    ? sl    : P.sl;
      }

      const resp = await send(side, entry);
      console.log('[GS][MANUAL]', { side, entry, tp1, tp2, sl, resp });
      if (!resp?.ok) alert('فشل الإرسال إلى الووركر. افحص Network/Console.');
      else alert('تم إرسال التنبيه إلى تلغرام ✔️');
    });
  }

  // ---------- Auto send per candle ----------
  const __AUTO_SENT = new Map(); // key=tf -> { candleStart, side }

  async function maybeAutoSend(){
    const { side, previewOnly } = detectSideFromAdviceText();
    if (!side || previewOnly) return;

    // 1) من __lastLinesForChart
    const L = window.__lastLinesForChart || null;
    let entry = L?.entry, tp1 = L?.tp1, tp2 = L?.tp2, sl = L?.sl;

    // 2) إن ناقص → من النص
    if (!(Number.isFinite(entry) && Number.isFinite(tp1) && Number.isFinite(tp2) && Number.isFinite(sl))) {
      const P = parseAdviceLevels();
      if (!Number.isFinite(entry)) entry = P.entry;
      if (!Number.isFinite(tp1))   tp1   = P.tp1;
      if (!Number.isFinite(tp2))   tp2   = P.tp2;
      if (!Number.isFinite(sl))    sl    = P.sl;
    }
    if (!(Number.isFinite(entry) && Number.isFinite(tp1) && Number.isFinite(tp2) && Number.isFinite(sl))) {
      console.log('[GS][AUTO] missing levels → skip', { entry,tp1,tp2,sl });
      return;
    }

    const tf = tfFromDom();
    const tfMs = tfToMs(tf); if (!tfMs) return;
    const candleStart = Math.floor(Date.now()/tfMs)*tfMs;
    const last = __AUTO_SENT.get(tf);
    if (last && last.candleStart === candleStart && last.side === side) return;

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