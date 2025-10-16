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
})();