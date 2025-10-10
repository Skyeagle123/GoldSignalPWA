/*  GoldSignals → Worker bridge (مُحدّث: يُرسل مرة واحدة لكل شمعة ويقرأ TP1/TP2/SL)  */
(() => {
  // ⚠️ ضع رابط الـWorker الخاص فيك (انتهِ بـ /alert)
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  // عنصر النص الذي يحتوي “نصيحة الدخول/الخروج”
  const ADVICE_SEL = "#adviceText";

  // ذاكرة لمنع التكرار: لكل TF نرسل مرة واحدة لكل شمعة
  const lastSentByTF = Object.create(null);

  // أدوات بسيطة
  const toNum = (s) => {
    if (s == null) return null;
    // أرقام بصيغة عربية/إنجليزية مع فواصل
    return parseFloat(String(s).replace(/[^\d.-\-]/g, "").replace(/-/g, "-"));
  };

  const sideMap = { "شراء": "BUY", "بيع": "SELL" };

  // يحاول قراءة كل القيم من نص “نصيحة الدخول/الخروج”
  function parseAdviceText(text) {
    if (!text || typeof text !== "string") return null;

    const t = text.replace(/\s+/g, " ").trim();

    // side
    const mSide =
      t.match(/(?:الملخص|الإشارة)\s*[:：]?\s*(شراء|بيع)/) ||
      t.match(/\b(شراء|بيع)\b/);

    // TF بالدقائق: “الإطار: 30 دقيقة”
    const mTF =
      t.match(/الإطار\s*[:：]?\s*(\d+)\s*د(?:قيقة)?/i) ||
      t.match(/\bTF\s*[:：]?\s*(\d+)\s*m\b/i); // دعم صيغة TF: 15m لو ظهرت

    // entry
    const mEntry =
      t.match(/سعر الدخول\s*[:：]?\s*([0-9.,]+)\b/) ||
      t.match(/\bEntry\s*[:：]?\s*([0-9.,]+)\b/i);

    // tp1/tp2: “الأهداف: 4021.35 / 4010.68”
    const mTPs =
      t.match(/الأهداف\s*[:：]?\s*([0-9.,]+)\s*\/\s*([0-9.,]+)/) ||
      t.match(/\bTP1\s*[:：]?\s*([0-9.,]+).*?\bTP2\s*[:：]?\s*([0-9.,]+)/i);

    // SL
    const mSL =
      t.match(/وقف الخسارة\s*[:：]?\s*([0-9.,]+)\b/) ||
      t.match(/\bSL\s*[:：]?\s*([0-9.,]+)\b/i);

    const side = mSide ? sideMap[mSide[1]] : null;
    const tfMins = mTF ? toNum(mTF[1]) : null;
    const entry = mEntry ? toNum(mEntry[1]) : null;

    const tp1 = mTPs ? toNum(mTPs[1]) : null;
    const tp2 = mTPs ? toNum(mTPs[2]) : null;

    const sl = mSL ? toNum(mSL[1]) : null;

    // نعتبرها “إشارة صالحة” فقط إذا توفرت أهم الحقول
    const ok =
      !!side &&
      !!tfMins &&
      Number.isFinite(entry) &&
      Number.isFinite(sl) &&
      Number.isFinite(tp1) &&
      Number.isFinite(tp2);

    return ok
      ? { side, tfMins, entry, tp1, tp2, sl, raw: t }
      : null;
  }

  // مفتاح الشمعة الحالية (بالدقائق)
  function candleKey(tfMins) {
    const bucket = Math.floor(Date.now() / (tfMins * 60 * 1000));
    return `${tfMins}:${bucket}`;
  }

  // يرسل للـWorker (مع حماية من التكرار)
  async function sendIfNew(payload) {
    const { side, tfMins, entry, tp1, tp2, sl } = payload;

    const key = candleKey(tfMins);
    if (lastSentByTF[tfMins] === key) {
      // تم الإرسال لهذه الشمعة مسبقًا
      console.log("[GS] skipped (already sent this candle).");
      return;
    }

    // شكّل جسم الطلب كما ينتظره الـWorker
    const body = {
      side,
      tf: `${tfMins}m`,
      entry,
      tp1,
      tp2,
      sl,
      price: entry,           // نرسل price=entry للعرض
      filtersRejected: false, // يمكنك تغييرها إن كان عندك فلتر
    };

    console.log("[GS] sending:", body);

    try {
      const r = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      console.log("[GS] sent:", j || { ok: r.ok, status: r.status });

      if (r.ok) {
        lastSentByTF[tfMins] = key; // ثبّت أنك أرسلت لهذه الشمعة
      }
    } catch (err) {
      console.error("[GS] send failed:", err);
    }
  }

  // يحاول قراءة النص وإرساله
  function trySendFromBox(box) {
    const txt = (box && box.textContent) ? box.textContent.trim() : "";
    const parsed = parseAdviceText(txt);

    if (!parsed) {
      console.warn("[GS] parsing failed.");
      return;
    }
    console.log("[GS] parsed:", parsed);
    sendIfNew(parsed);
  }

  // تشغيل المراقبة
  function start() {
    const box =
      document.querySelector(ADVICE_SEL) ||
      document.getElementById("adviceText");

    if (!box) {
      console.warn("[GS] advice box not found.");
      return;
    }

    console.log("[GS] watcher started.");
    // أرسل فورًا إن كانت الشاشة تعرض نصيحة جاهزة
    trySendFromBox(box);

    const mo = new MutationObserver(() => trySendFromBox(box));
    mo.observe(box, { childList: true, subtree: true, characterData: true });
  }

  // ابدأ بعد تحميل DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
