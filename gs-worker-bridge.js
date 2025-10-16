/* GoldSignals → Worker bridge (إرسال تلغرام بأسعار مطلقة) */
(function () {
  // ⚠️ ضع رابط الوركر الخاص فيك (مسار /alert):
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  // ——— أدوات مساعدة ———
  function num(v) {
    if (v == null) return null;
    const x = (typeof v === 'string') ? Number(v.replace(/[^\d.-]/g,'')) : Number(v);
    return Number.isFinite(x) ? x : null;
  }
  function tfFromDom() {
    try {
      // جرّب المتغيّرات/الدوال إن كانت متوفرة من app.js
      if (typeof currentTF !== "undefined" && currentTF) {
        // أرقام → حوّلها لنص قصير
        if (typeof currentTF === 'number') {
          if (currentTF === 60) return '1h';
          if (currentTF >= 120 && currentTF % 60 === 0) return (currentTF/60)+'h';
          return currentTF + 'm';
        }
        return String(currentTF);
      }
      if (typeof tfShort === "function") {
        const t = tfShort();
        if (t) return t;
      }
      // كـ fallback من الأزرار
      const el5 = document.getElementById('tf5');
      const el30= document.getElementById('tf30');
      const el60= document.getElementById('tf60');
      const elD = document.getElementById('tfD');
      if (el5?.checked)  return '5m';
      if (el30?.checked) return '30m';
      if (el60?.checked) return '1h';
      if (elD?.checked)  return '1d';
    } catch (_) {}
    return '30m';
  }

  // ——— دالة الإرسال الوحيدة ———
  async function send(side, entry) {
    try {
      const L = (typeof window.__lastLinesForChart !== "undefined" && window.__lastLinesForChart) || null;
      // حمولة صريحة بأسعار مطلقة
      const payload = {
        side,
        tf: tfFromDom(),                                    // مضمون دائمًا
        entry: (Number.isFinite(entry) ? entry : (L && Number.isFinite(L.entry) ? L.entry : null)),
        tp1:   L && Number.isFinite(L.tp1) ? L.tp1 : null,
        tp2:   L && Number.isFinite(L.tp2) ? L.tp2 : null,
        sl:    L && Number.isFinite(L.sl)  ? L.sl  : null,
        price: (Number.isFinite(entry) ? entry : (typeof window.__livePrice !== "undefined" ? window.__livePrice : (L && Number.isFinite(L.entry) ? L.entry : null))),
        filtersRejected: false
      };

      const r = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const resp = await r.json().catch(() => ({}));
      console.log("[GS] sent:", payload, "| worker:", resp);
      return resp;
    } catch (err) {
      console.error("[GS] notify failed:", err);
      return { ok:false, error:String(err) };
    }
  }

  // ——— ربط الأزرار/الأحداث الموجودة لديك (بدون تغيير IDs) ———
  // إذا كان عندك زر إرسال يدوي أو حدث، تأكد أنّه ينادي send(side, entry)
  // أمثلة (اتركها كما هي إن كانت عندك نسخة مشابهة):
  window.gsNotifyIfRealSignal = function (advice) {
    try {
      if (!advice) return;
      const side = advice.side || (advice.signal === 'شراء' ? 'BUY' : advice.signal === 'بيع' ? 'SELL' : '');
      if (side !== 'BUY' && side !== 'SELL') return;
      // entry يُمرّر؛ والـ TP/SL سيؤخذ من __lastLinesForChart تلقائيًا
      return send(side, advice.entry);
    } catch (e) { console.error(e); }
  };

  // لو عندك أزرار مخصّصة، اربطها:
  const btnBuy  = document.getElementById('btnSendBuy');
  const btnSell = document.getElementById('btnSendSell');
  btnBuy  && btnBuy.addEventListener('click',  () => send('BUY',  window.__livePrice ?? null));
  btnSell && btnSell.addEventListener('click', () => send('SELL', window.__livePrice ?? null));
  // ——— زر الإرسال اليدوي أسفل النصيحة ———
  function detectSideFromAdvice(){
    try{
      const el = document.getElementById('adviceText');
      if(!el) return '';
      const t = (el.textContent || el.innerText || '').trim();
      if (t.includes(' الإشارة: شراء') || t.includes('الملخص: شراء')) return 'BUY';
      if (t.includes(' الإشارة: بيع')  || t.includes('الملخص: بيع'))  return 'SELL';
    }catch(_){}
    return '';
  }
  (function setupManualBtn(){
    const btn = document.getElementById('sendAlertBtn');
    if(!btn) return;
    btn.style.display = 'inline-block'; // دايمًا ظاهر
    btn.addEventListener('click', async () => {
      const side = detectSideFromAdvice();
      const L = window.__lastLinesForChart || null;
      const entry = (L && Number.isFinite(L.entry)) ? L.entry :
                    (typeof window.__livePrice !== 'undefined' ? window.__livePrice : null);
      if (!side) { alert('لا يوجد اتجاه واضح (شراء/بيع) في النصيحة.'); return; }
      if (!L || !Number.isFinite(L.tp1) || !Number.isFinite(L.tp2) || !Number.isFinite(L.sl)) {
        alert('الأهداف/الوقف غير جاهزة بعد. شغّل المؤشر ليحسبها.'); return;
      }
      const resp = await send(side, entry);
      if (!resp?.ok) alert('فشل الإرسال إلى الووركر. افحص Network/Console.');
      else alert('تم إرسال التنبيه إلى تلغرام ✔️');
    });
  })();

}
  // ======== Auto-send once per candle when advice becomes REAL (no app.js changes) ========
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
  function detectPreviewOnly(){
    try{
      const el = document.getElementById('adviceText');
      const t = (el?.textContent || el?.innerText || '').trim();
      return t.includes('(إطلاع فقط)');
    }catch(_){}
    return false;
  }
  const __AUTO_SENT = new Map(); // key=tf -> { candleStart, side }

  async function maybeAutoSend(){
    const side = detectSideFromAdvice();
    if (!side) return;
    if (detectPreviewOnly()) return; // لا نرسل إذا "إطلاع فقط"

    const L = window.__lastLinesForChart || null;
    if (!L || !Number.isFinite(L.entry) || !Number.isFinite(L.tp1) || !Number.isFinite(L.tp2) || !Number.isFinite(L.sl)) {
      return; // بدنا TP/SL كاملة
    }

    const tf = tfFromDom();
    const tfMs = tfToMs(tf); if (!tfMs) return;
    const candleStart = Math.floor(Date.now()/tfMs)*tfMs;

    const last = __AUTO_SENT.get(tf);
    if (last && last.candleStart === candleStart && last.side === side) {
      return; // تم الإرسال بهالشمعة لنفس الاتجاه
    }

    try {
      const r = await send(side, L.entry);
      console.log('[GS][AUTO]', { tf, side, entry:L.entry, resp:r });
      if (r?.ok) __AUTO_SENT.set(tf, { candleStart, side });
    } catch (e) {
      console.warn('[GS][AUTO] failed:', e);
    }
  }

  (function observeAdvice(){
    const el = document.getElementById('adviceText');
    if (!el || typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(() => { maybeAutoSend(); });
    obs.observe(el, { childList:true, characterData:true, subtree:true });
    setTimeout(maybeAutoSend, 800); // محاولة أولى بعد التحميل
  })();

})();
