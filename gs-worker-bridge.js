/* GoldSignals → Worker bridge (مرّة لكل شمعة) */
(function () {
  // ⛳️ غيّر رابط الوركر إذا لزم
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  // ابحث عن صندوق النص اللي فيه الملخص/النصيحة
  const box =
    document.getElementById("adviceText") ||
    document.querySelector("#adviceText") ||
    document.querySelector("main .wrap") ||
    document.querySelector("main");

  if (!box) {
    console.warn("[GS] box not found — الجسر مش شاف الصندوق.");
    return;
  }

  // helper: تحويل أرقام لنظيفة
  const num = (v) => {
    if (v == null) return null;
    const n = Number(
      String(v).replace(/[^\d.\-]+/g, "").replace(/(\.\d{2})\d+$/, "$1")
    );
    return isFinite(n) ? n : null;
  };

  // اكتشاف الإطار الزمني (عربي/إنجليزي)
  function parseTF(text) {
    // أمثلة: "TF: 15m" أو "الإطار: 30 دقيقة"
    const en = text.match(/TF\s*:\s*(\d+)\s*([mh])/i);
    if (en) {
      const n = Number(en[1]);
      const u = en[2].toLowerCase();
      const mins = u === "h" ? n * 60 : n;
      return { tfLabel: `${mins}${u === "h" ? "h" : "m"}`, tfMins: mins };
    }
    const ar = text.match(/الإطار\s*:\s*(\d+)\s*دق(?:يقة|ائق)/);
    if (ar) {
      const mins = Number(ar[1]);
      return { tfLabel: `${mins}m`, tfMins: mins };
    }
    // fallback: إذا فيه window.currentTFMinutes
    const tfGuess =
      window.currentTFMinutes || window.currentTF || window.currentTf;
    if (tfGuess) {
      const mins = Number(tfGuess);
      if (isFinite(mins) && mins > 0) return { tfLabel: `${mins}m`, tfMins: mins };
    }
    // افتراضي: 15m
    return { tfLabel: "15m", tfMins: 15 };
  }

  // اكتشاف إذا النصيحة مرفوضة بالفلتر
  function isRejected(text) {
    return /مرفوضة|مرفوض|فلتر|rejected/i.test(text);
  }

  // استخراج الحقول: side/entry/tp1/tp2/sl
  function parseAdvice(text) {
    // side
    let side = null;
    if (/BUY/i.test(text) || /شراء/.test(text)) side = "BUY";
    if (/SELL/i.test(text) || /بيع/.test(text)) side = "SELL";

    // entry: نحاول عربي/إنجليزي
    const mEntry =
      text.match(/Entry\s*:\s*([0-9.,]+)/i) ||
      text.match(/سعر الدخول\s*[:：]\s*([0-9.,]+)/);
    const entry = mEntry ? num(mEntry[1]) : null;

    // TP1 / TP2
    const mTp1 =
      text.match(/TP1\s*:\s*([0-9.,]+)/i) || text.match(/TP1\s*[:：]\s*([0-9.,]+)/i);
    const mTp2 =
      text.match(/TP2\s*:\s*([0-9.,]+)/i) || text.match(/TP2\s*[:：]\s*([0-9.,]+)/i);
    const tp1 = mTp1 ? num(mTp1[1]) : null;
    const tp2 = mTp2 ? num(mTp2[1]) : null;

    // SL
    const mSl =
      text.match(/SL\s*:\s*([0-9.,]+)/i) || text.match(/وقف الخسارة\s*[:：]\s*([0-9.,]+)/);
    const sl = mSl ? num(mSl[1]) : null;

    // TF
    const { tfLabel, tfMins } = parseTF(text);

    return {
      side,
      tf: tfLabel,
      tfMins,
      entry,
      tp1,
      tp2,
      sl,
      filtersRejected: isRejected(text),
    };
  }

  // مرّة واحدة لكل شمعة: نحسب الـbucket من الزمن الحالي و tf
  let lastBucketKey = null;

  // لتخفيف الوميض، نعمل debounce صغير بعد تغيّر النص
  let debounceTimer = null;
  const DEBOUNCE_MS = 1200;

  // إرسال فعلي للوركر
  async function sendAdvice(payload) {
    try {
      const r = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      console.log("[GS] sent:", payload, j);
    } catch (e) {
      console.error("[GS] send failed:", e);
    }
  }

  function trySend(text) {
    const p = parseAdvice(text);
    console.log("[GS] parsed:", p);

    // شروط الإرسال:
    // 1) مش مرفوضة بالفلتر
    // 2) فيه side واضح
    // 3) فيه Entry (ما منرسل إذا مش موجود)
    if (p.filtersRejected || !p.side || p.entry == null) {
      console.warn("[GS] نصيحة غير مرسلة (مرفوضة/ناقصة).");
      return;
    }

    // حسبة الشمعة الحالية بالـminutes
    const bucket =
      p.side +
      "|" +
      p.tf +
      "|" +
      Math.floor(Date.now() / (p.tfMins * 60 * 1000));

    if (bucket === lastBucketKey) {
      // تم الإرسال لهذه الشمعة — تجاهل
      return;
    }

    lastBucketKey = bucket;

    const payload = {
      side: p.side,
      tf: p.tf,
      entry: p.entry,
      tp1: p.tp1,
      tp2: p.tp2,
      sl: p.sl,
      filtersRejected: false,
    };

    sendAdvice(payload);
  }

  // مراقب تغيّر نص الصندوق
  let lastText = "";
  function onChange() {
    const txt = box.innerText || "";
    if (txt === lastText) return;
    lastText = txt;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => trySend(txt), DEBOUNCE_MS);
  }

  // أرسل فورًا إذا في نصيحة ظاهرة عند التحميل
  onChange();

  const mo = new MutationObserver(onChange);
  mo.observe(box, { childList: true, subtree: true, characterData: true });

  console.log("[GS] watcher started.");
})();
