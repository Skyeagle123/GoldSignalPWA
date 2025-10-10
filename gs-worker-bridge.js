/* GoldSignals → Worker bridge (منع التكرار + رسالة واحدة منظّمة) */
(function () {
  // ضع رابط الـWorker الخاص بك هنا
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev";

  // سجل بسيط لمنع تكرار نفس الإشارة لفترة محددة
  const lastSent = new Map();           // key = tf|side|entryRounded
  const DEDUP_TTL_MS = 15 * 60 * 1000;  // مهلة 15 دقيقة (غيّرها إذا بدك)

  function shouldSendOnce(tf, side, entry) {
    // نوحد قيمة الدخول لتقليل حساسية التغيير (تقريب على خانتين)
    const entryRounded =
      entry != null ? Math.round(Number(entry) * 100) / 100 : "NA";
    const key = `${tf}|${String(side).toUpperCase()}|${entryRounded}`;
    const now = Date.now();
    const prev = lastSent.get(key);

    // إذا أرسِلَت خلال المهلة → لا ترسل
    if (prev && now - prev < DEDUP_TTL_MS) return false;

    // تنظيف مفاتيح قديمة لنفس (tf|side) لتفادي التضخم
    for (const k of lastSent.keys()) {
      if (k.startsWith(`${tf}|${String(side).toUpperCase()}|`)) lastSent.delete(k);
    }
    lastSent.set(key, now);
    return true;
  }

  /**
   * استدعِ هذه الدالة عند توليد نصيحة نهائية:
   * window.gsNotifyIfRealSignal(adviceObject);
   *
   * المتوقّع داخل adviceObject (استعمل ما يتوفر لديك):
   * {
   *   side: "BUY"|"SELL",
   *   tf: "5m"|"15m"|...,
   *   entry / entryPrice / entry_point: Number,
   *   tp1, tp2, sl: Number,
   *   price: Number (السعر الحي - اختياري),
   *   filtersRejected: Boolean
   * }
   */
  async function notifyIfRealSignal(advice) {
    try {
      if (!advice || !advice.side) return;
      const side = String(advice.side).toUpperCase();
      if (side !== "BUY" && side !== "SELL") return;

      // تجاهل الإشارات المرفوضة بالفلاتر
      if (advice.filtersRejected === true) return;

      // اجلب الحقول إن وُجدت
      const tf    = advice.tf || window.currentTF || "";
      const entry = coalesce(advice.entry, advice.entryPrice, advice.entry_point, null);
      const tp1   = coalesce(advice.tp1, advice.takeProfit1, null);
      const tp2   = coalesce(advice.tp2, advice.takeProfit2, null);
      const sl    = coalesce(advice.sl,  advice.stopLoss,   null);
      const price = coalesce(advice.price, window.lastLivePrice, null);

      // لا ترسل إلا أول مرة لنفس (TF + Side + Entry/Price)
      if (!shouldSendOnce(tf, side, entry ?? price)) return;

      // أرسل للـWorker
      await fetch(`${WORKER_URL}/alert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          side, tf, entry, tp1, tp2, sl, price,
          filtersRejected: false
        })
      }).catch(() => {});
    } catch (e) {
      // تجاهل أخطاء الشبكة
    }
  }

  function coalesce(...vals) {
    for (const v of vals) if (v !== undefined && v !== null) return v;
    return null;
  }

  // نعرّض الدالة للاستخدام من الكود الأساسي
  window.gsNotifyIfRealSignal = notifyIfRealSignal;
})();
