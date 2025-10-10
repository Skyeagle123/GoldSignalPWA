/*  GoldSignals → Worker bridge (مُحدّث وآمن)  */
(function () {
  // ⚠️ ضع رابط الوركر الخاص فيك:
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev";

  /* ============ أدوات مساعدة ============ */

  // تحويل أرقام عربية/فواصل إلى رقم عشري عادي
  function normalizeNumber(s) {
    if (s == null) return null;
    let t = String(s)
      .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))         // أرقام عربية → 0..9
      .replace(/[^\d.,\-]/g, "");                                // احذف أي رموز أخرى
    // لو عندي فاصلتين: اعتبر الأخيرة فاصلة عشرية وامسح الباقي
    const lastComma = t.lastIndexOf(",");
    const lastDot   = t.lastIndexOf(".");
    if (lastComma > lastDot) { // الفاصلة آخر شي → اعتبرها عشرية والباقي آلاف
      t = t.replace(/\./g, "").replace(/,/g, (m, i, str) => (i === lastComma ? "." : ""));
    } else {
      t = t.replace(/,/g, ""); // الفواصل آلاف → امسحها
    }
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }

  function tfToMinutes(tf) {
    if (!tf) return 15;
    if (typeof tf === "number") return tf;
    const m = String(tf).trim().toLowerCase().match(/^(\d+)\s*([mh])$/);
    if (!m) return 15;
    const v = parseInt(m[1], 10);
    return m[2] === "h" ? v * 60 : v;
  }

  // مفتاح الشمعة الحالية (لتجنّب التكرار)
  function currentCandleKey(tfStr, more = "") {
    const mins = tfToMinutes(tfStr || window.currentTF || "15m");
    const bucket = Math.floor(Date.now() / (mins * 60 * 1000));
    return `${mins}|${bucket}|${more || ""}`;
  }

  // نخزّن آخر إرسال كي لا نكرّر بنفس الشمعة
  const LS_KEY = "gs_last_sent_key";
  function sentThisCandle(key) {
    try {
      const last = localStorage.getItem(LS_KEY);
      return last === key;
    } catch { return false; }
  }
  function markSent(key) {
    try { localStorage.setItem(LS_KEY, key); } catch {}
  }

  // هل النص يحمل نصيحة كاملة؟
  function hasCompleteAdvice(text) {
    const t = (text || "").toLowerCase();
    const hasEntry = /entry|سعر الدخول|دخول/.test(t);
    const hasSL    = /\bsl\b|وقف الخسارة|وقف/.test(t);
    const hasTP    = /\btp1\b|\btp2\b|tp1|tp2/.test(t);
    return hasEntry && hasSL && hasTP;
  }

  // يحاول استخراج side/tf/entry/tp1/tp2/sl من النص (عربي/إنكليزي)
  function parseAdviceFromText(text) {
    if (!text) return null;
    const t = text.replace(/\s+/g, " ");

    // side
    let side = /sell|بيع/i.test(t) ? "SELL" : /buy|شراء/i.test(t) ? "BUY" : null;

    // tf (مثل 5m / 30m / 1h)
    const tfMatch = t.match(/\b(\d+)\s*(m|h)\b/i);
    const tf = tfMatch ? `${tfMatch[1]}${tfMatch[2].toLowerCase()}` : (window.currentTF || "15m");

    // أرقام: نجرب أنماط شائعة
    // Entry:
    let entry = null;
    let m;
    m = t.match(/(?:entry|سعر الدخول|دخول)\D{0,6}([0-9.,٠-٩\-]+)/i);
    if (m) entry = normalizeNumber(m[1]);

    // SL:
    let sl = null;
    m = t.match(/\b(?:sl|وقف(?:\s*الخسارة)?)\D{0,6}([0-9.,٠-٩\-]+)/i);
    if (m) sl = normalizeNumber(m[1]);

    // TP1:
    let tp1 = null;
    m = t.match(/\b(?:tp1)\D{0,6}([0-9.,٠-٩\-]+)/i);
    if (m) tp1 = normalizeNumber(m[1]);

    // TP2:
    let tp2 = null;
    m = t.match(/\b(?:tp2)\D{0,6}([0-9.,٠-٩\-]+)/i);
    if (m) tp2 = normalizeNumber(m[1]);

    return { side, tf, entry, tp1, tp2, sl };
  }

  // عنصر النص الذي تُكتب فيه النصيحة
  function findAdviceElement() {
    return (
      document.getElementById("adviceText") ||
      window.elAdviceText ||
      document.querySelector("#adviceText, .advice, [data-advice], main .wrap, main")
    );
  }

  // إرسال للوركر مع قفل "مرّة لكل شمعة"
  async function sendOncePerCandle(payload) {
    const key = currentCandleKey(payload.tf, `${payload.side}|${payload.entry}|${payload.sl}|${payload.tp1}|${payload.tp2}`);
    if (sentThisCandle(key)) {
      console.log("[GS] skipped (already sent this candle).");
      return false;
    }
    const url = WORKER_URL.replace(/\/+$/, "") + "/alert";
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    let ok = res.ok;
    try {
      const j = await res.json();
      ok = ok && j && j.ok !== false;
      console.log("[GS] worker reply:", j);
    } catch {
      console.log("[GS] worker status:", res.status);
    }
    if (ok) markSent(key);
    return ok;
  }

  // يرسل إن وُجد نص كامل
  async function trySend(text) {
    try {
      if (!hasCompleteAdvice(text)) {
        console.warn("[GS] incomplete advice → waiting …");
        return false;
      }
      const parsed = parseAdviceFromText(text);
      if (!parsed || !parsed.side) {
        console.warn("[GS] parsing failed.");
        return false;
      }
      const payload = {
        side:  parsed.side || "BUY",
        tf:    parsed.tf   || (window.currentTF || "15m"),
        entry: parsed.entry ?? null,
        tp1:   parsed.tp1   ?? null,
        tp2:   parsed.tp2   ?? null,
        sl:    parsed.sl    ?? null,
        price: parsed.entry ?? null,
        filtersRejected: false,
        raw: text,
        ts: Date.now(),
      };
      console.log("[GS] sending:", payload);
      return await sendOncePerCandle(payload);
    } catch (e) {
      console.error("[GS] trySend error:", e);
      return false;
    }
  }

  // مراقبة الصندوق مع تهدئة (debounce)
  function startWatcher() {
    if (startWatcher.__wired) return;
    startWatcher.__wired = true;

    const box = findAdviceElement();
    if (!box) {
      console.warn("[GS] advice element not found.");
      return;
    }

    let lastText = (box.innerText || "").trim();
    console.log("[GS] watcher started.");
    let timer = null;

    // محاولة أولى لو النص جاهز
    if (lastText && hasCompleteAdvice(lastText)) trySend(lastText);

    const scheduleCheck = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const txt = (box.innerText || "").trim();
        // حتى لو ما تغيّر — إذا صار كامل بعد لحظات نبعت
        lastText = txt || lastText || "";
        if (hasCompleteAdvice(lastText)) {
          trySend(lastText);
        } else {
          console.log("[GS] waiting for full advice …");
        }
      }, 900); // تهدئة لتجنّب الطشّ أثناء التحديث
    };

    const mo = new MutationObserver(scheduleCheck);
    mo.observe(box, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", scheduleCheck, { passive: true });
  }

  /* ============ واجهات عامة ============ */

  // لو بدك تبعته يدويّاً من كودك:
  window.gsNotifyIfRealSignal = async function (adviceObj) {
    // يقبل كائن جاهز بنفس الحقول
    const payload = {
      side:  adviceObj.side || "BUY",
      tf:    adviceObj.tf   || (window.currentTF || "15m"),
      entry: adviceObj.entry ?? null,
      tp1:   adviceObj.tp1   ?? null,
      tp2:   adviceObj.tp2   ?? null,
      sl:    adviceObj.sl    ?? null,
      price: adviceObj.price ?? adviceObj.entry ?? null,
      filtersRejected: !!adviceObj.filtersRejected,
      raw: adviceObj.raw || "",
      ts: Date.now(),
    };
    console.log("[GS] manual send:", payload);
    return await sendOncePerCandle(payload);
  };

  // تشغيل تلقائي بعد تحميل الصفحة
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startWatcher, { once: true });
  } else {
    startWatcher();
  }
})();
