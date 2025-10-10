/*  GoldSignals → Worker bridge (نسخة Debug محسّنة)  */
(() => {
  // ▼ غيّر هذا إن لزم
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";
  const ADVICE_SEL = "#adviceText";
  const DEBUG = true;

  // تحويل أرقام عربية -> إنجليزية + تنظيف
  const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
  const arToEn = (s) =>
    String(s).replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d));

  const toNum = (s) => {
    if (s == null) return null;
    const cleaned = arToEn(String(s)).replace(/[^\d.\-]/g, "");
    const v = parseFloat(cleaned);
    return Number.isFinite(v) ? v : null;
  };

  const sideMap = { "شراء": "BUY", "بيع": "SELL" };

  // parser قوي: يحاول كل الصيغ الشائعة
  function parseAdviceText(text) {
    if (!text || typeof text !== "string") return null;

    const t = text.replace(/\s+/g, " ").trim();
    if (DEBUG) console.log("[GS] raw advice text:", t);

    // side
    const mSide =
      t.match(/(?:الملخص|الإشارة)\s*[:：]?\s*(شراء|بيع)/) ||
      t.match(/\b(شراء|بيع)\b/);

    // TF بالدقائق: “الإطار: 30 دقيقة” أو “TF: 15m”
    const mTF =
      t.match(/الإطار\s*[:：]?\s*(\d+)\s*د(?:قيقة)?/i) ||
      t.match(/\bTF\s*[:：]?\s*(\d+)\s*m\b/i);

    // Entry
    const mEntry =
      t.match(/سعر الدخول\s*[:：]?\s*([0-9٠-٩.,]+)\b/) ||
      t.match(/\bEntry\s*[:：]?\s*([0-9٠-٩.,]+)\b/i);

    // TP1/TP2 (أولاً الصيغة العربية “الأهداف: X / Y”)
    let tp1 = null, tp2 = null;
    const mTPs1 = t.match(/الأهداف\s*[:：]?\s*([0-9٠-٩.,]+)\s*\/\s*([0-9٠-٩.,]+)/);
    if (mTPs1) {
      tp1 = toNum(mTPs1[1]);
      tp2 = toNum(mTPs1[2]);
    }
    // أو صيغة TP1/TP2 الصريحة (بالانجليزي)
    const mTP1 = t.match(/\bTP1\s*[:：]?\s*([0-9٠-٩.,]+)\b/i);
    const mTP2 = t.match(/\bTP2\s*[:：]?\s*([0-9٠-٩.,]+)\b/i);
    if (mTP1) tp1 = toNum(mTP1[1]);
    if (mTP2) tp2 = toNum(mTP2[1]);

    // SL
    const mSL =
      t.match(/وقف الخسارة\s*[:：]?\s*([0-9٠-٩.,]+)\b/) ||
      t.match(/\bSL\s*[:：]?\s*([0-9٠-٩.,]+)\b/i);

    const side = mSide ? sideMap[mSide[1]] : null;
    const tfMins = mTF ? toNum(mTF[1]) : null;
    const entry = mEntry ? toNum(mEntry[1]) : null;
    const sl = mSL ? toNum(mSL[1]) : null;

    if (DEBUG) {
      console.log("[GS] parsed draft:", {
        side, tfMins, entry, tp1, tp2, sl
      });
    }

    // شرط الحد الأدنى: side + tf + entry + sl
    if (!side || !tfMins || !Number.isFinite(entry) || !Number.isFinite(sl)) {
      return null;
    }

    // TP1/TP2 اختياريين (لكن ننبه بالكونسول إن ناقصين)
    if (!Number.isFinite(tp1) || !Number.isFinite(tp2)) {
      console.warn("[GS] TP1/TP2 لم تُلتقط من النص – سنُرسل بدونهم.", { tp1, tp2 });
      if (!Number.isFinite(tp1)) tp1 = null;
      if (!Number.isFinite(tp2)) tp2 = null;
    }

    return { side, tfMins, entry, tp1, tp2, sl, raw: t };
  }

  // مرّة لكل شمعة لكل TF
  const lastSentByTF = Object.create(null);
  const candleKey = (tfMins) =>
    `${tfMins}:${Math.floor(Date.now() / (tfMins * 60 * 1000))}`;

  async function sendIfNew(payload) {
    const { side, tfMins, entry, tp1, tp2, sl } = payload;
    const key = candleKey(tfMins);
    if (lastSentByTF[tfMins] === key) {
      if (DEBUG) console.log("[GS] skipped (already sent this candle).");
      return;
    }

    const body = {
      side,
      tf: `${tfMins}m`,
      entry,
      tp1,
      tp2,
      sl,
      price: entry,
      filtersRejected: false,
    };

    if (DEBUG) console.log("[GS] sending:", body);

    try {
      const r = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (DEBUG) console.log("[GS] sent:", j || { ok: r.ok, status: r.status });
      if (r.ok) lastSentByTF[tfMins] = key;
    } catch (err) {
      console.error("[GS] send failed:", err);
    }
  }

  function trySendFromBox(box) {
    const txt = (box && box.textContent) ? box.textContent.trim() : "";
    const parsed = parseAdviceText(txt);
    if (!parsed) {
      console.warn("[GS] parsing failed (لن نُرسل).");
      return;
    }
    if (DEBUG) console.log("[GS] parsed:", parsed);
    sendIfNew(parsed);
  }

  function start() {
    const box =
      document.querySelector(ADVICE_SEL) ||
      document.getElementById("adviceText");

    if (!box) {
      console.warn("[GS] advice box not found.");
      return;
    }

    if (DEBUG) console.log("[GS] watcher started.");
    // أول ما يشتغل
    trySendFromBox(box);

    // راقب تغيّر النص فقط (يكفينا لتحديث النصيحة)
    const mo = new MutationObserver(() => trySendFromBox(box));
    mo.observe(box, { childList: true, subtree: true, characterData: true });
  }

  // دالة فحص سريعة من الكونسول
  window.__gsDebug = () => {
    const box =
      document.querySelector(ADVICE_SEL) ||
      document.getElementById("adviceText");
    if (!box) return console.warn("adviceText not found");
    console.log("RAW:", box.textContent);
    console.log("PARSED:", parseAdviceText(box.textContent));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
