/* GoldSignals → Worker bridge (صغير وآمن) */
(function () {
  'use strict';

  // ⚠️ عدّل هذا لو تغيّر رابط الووركر الخاص بك
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  // ====== منع التكرار: مرّة واحدة لكل شمعة ======
  // key = `${side}-${tfMin}` → value = candleId
  const GS_LAST_SENT = Object.create(null);

  function candleId(tfMin, now = Date.now()) {
    const ms = tfMin * 60 * 1000;
    return Math.floor(now / ms);
  }

  // ====== أدوات مساعدة ======
  function toNumber(x) {
    if (x == null) return null;
    const n = Number(String(x).replace(/[^\d.+-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function tfToMin(tf) {
    if (!tf) return null;
    const m = String(tf).match(/(\d+)\s*(m|h|min)/i);
    if (!m) return toNumber(tf);
    const v = Number(m[1] || 0);
    return (m[2].toLowerCase() === 'h') ? v * 60 : v;
  }

  // يبني الرسالة النهائية
  function buildMessage(payload) {
    const lines = [
      "🔔 GoldSignals",
      `Side: ${payload.side}`,
      `TF: ${payload.tf}`,
      `Entry: ${payload.entry}`
    ];
    if (payload.tp1 != null) lines.push(`TP1: ${payload.tp1}`);
    if (payload.tp2 != null) lines.push(`TP2: ${payload.tp2}`);
    if (payload.sl  != null) lines.push(`SL: ${payload.sl}`);
    return lines.join("\n");
  }

  // يرسل للـ Worker
  async function sendToWorker(payload) {
    // استنتاج tf بالدقائق و منعه من التكرار لكل شمعة
    const tfMin = tfToMin(payload.tf) || tfToMin(window.currentTF) || 15;
    const key   = `${payload.side}-${tfMin}`;
    const cid   = candleId(tfMin);

    if (GS_LAST_SENT[key] === cid) {
      console.log("[GS] skipped (same candle)", key, cid);
      return { ok:false, skipped:true };
    }

    GS_LAST_SENT[key] = cid;

    try {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => ({}));
      console.log("[GS] worker response:", { ok: res.ok, status: res.status, body });
      return { ok: res.ok, status: res.status, body };
    } catch (err) {
      console.error("[GS] worker error:", err);
      return { ok:false, error: String(err) };
    }
  }

  // ====== API خارجي لإرسال إشارة جاهزة ======
  // نتركه عالمي ليقدر app.js يناديه مباشرة
  window.gsNotifyIfRealSignal = async function (advice) {
    try {
      if (!advice || !advice.side) {
        console.warn("[GS] نصيحة غير صالحة/غير موجودة (لن يتم الإرسال).");
        return;
      }
      const side = String(advice.side).toUpperCase();
      if (side !== 'BUY' && side !== 'SELL') {
        console.warn("[GS] side غير صالح:", advice.side);
        return;
      }
      // إذا كان مرفوض بالفلاتر لا ترسل
      if (advice.filtersRejected === true) {
        console.log("[GS] مرفوضة بالفلاتر (لن تُرسل).");
        return;
      }

      const payload = {
        side,
        tf: advice.tf || window.currentTF || "15m",
        entry: toNumber(advice.entry ?? advice.entryPrice ?? advice.price),
        tp1: toNumber(advice.tp1),
        tp2: toNumber(advice.tp2),
        sl:  toNumber(advice.sl),
        price: toNumber(advice.price),
        filtersRejected: !!advice.filtersRejected
      };

      console.log("[GS] sending:", payload);
      const r = await sendToWorker(payload);

      if (r.ok) {
        console.log("[GS] sent:", payload);
      } else if (r.skipped) {
        console.log("[GS] skipped (already sent this candle).");
      } else {
        console.warn("[GS] failed to send:", r);
      }
    } catch (e) {
      console.error("[GS] notify error:", e);
    }
  };

  // ====== اختيارية: مراقبة نصّ الإشارة من الصفحة نفسها ======
  // نحاول إيجاد عنصر يحتوي النصّ؛ إذا غير موجود نكتفي بالدالة أعلاه.
  function findAdviceBox() {
    return (
      document.getElementById('adviceText') ||
      window.elAdviceText ||
      document.querySelector('#adviceText, .advice, .signal, .wrap main') ||
      null
    );
  }

  function parseAdviceFromText(text) {
    // تجاهل الحالات غير الحقيقية
    if (!text) return null;
    if (text.includes("لا توجد نصيحة") || text.includes("مرفوض")) return null;

    // استخرج BUY/SELL
    const side = /شراء|BUY|بيع|SELL/i.test(text)
      ? (/(بيع|SELL)/i.test(text) ? "SELL" : "BUY")
      : null;

    if (!side) return null;

    // أرقام: TF, Entry, TP1, TP2, SL
    const tfm  = text.match(/(\d+)\s*(?:m|د|دقيقة|h|ساعة)/i);
    const em   = text.match(/دخول[:\s]?\s*([\d.]+)/i);
    const tp1m = text.match(/TP1[:\s]?\s*([\d.]+)/i);
    const tp2m = text.match(/TP2[:\s]?\s*([\d.]+)/i);
    const slm  = text.match(/SL[:\s]?\s*([\d.]+)/i);

    const tf = tfm ? (tfm[2] ? `${tfm[1]}${tfm[2]}` : `${tfm[1]}m`) : (window.currentTF || "15m");

    return {
      side,
      tf,
      entry: toNumber(em && em[1]),
      tp1:  toNumber(tp1m && tp1m[1]),
      tp2:  toNumber(tp2m && tp2m[1]),
      sl:   toNumber(slm && slm[1]),
      filtersRejected: /مرفوض/i.test(text) ? true : false
    };
  }

  function startWatcher() {
    const box = findAdviceBox();
    if (!box) {
      console.warn("[GS] لم أجد عنصر نصّ الإشارة؛ استخدم window.gsNotifyIfRealSignal(..) يدويًا من التطبيق.");
      return;
    }

    console.log("[GS] watcher started.");
    let lastText = "";

    const trySend = (txt) => {
      const advice = parseAdviceFromText(txt);
      if (!advice) {
        console.warn("[GS] نصيحة غير مُرسلة (مرفوضة/غير موجودة).");
        return;
      }
      window.gsNotifyIfRealSignal(advice);
    };

    // إرسال أولي إذا كان النصّ ظاهر
    const initial = (box.innerText || "").trim();
    if (initial) {
      lastText = initial;
      trySend(initial);
    }

    const mo = new MutationObserver(() => {
      const txt = (box.innerText || "").trim();
      if (txt && txt !== lastText) {
        lastText = txt;
        trySend(txt);
      }
    });

    mo.observe(box, { childList: true, subtree: true, characterData: true });
  }

  // ابدأ المراقبة بعد تحميل DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startWatcher);
  } else {
    startWatcher();
  }
})();
