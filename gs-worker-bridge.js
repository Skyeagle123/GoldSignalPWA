/* GoldSignals → Worker bridge (صغير وآمن) */
(function () {
  // 👇 ضع رابط الWorker تبعك (مسار /alert)
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  // ——— أدوات قراءة أرقام تتحمّل العربي والفواصل ———
  function cleanNum(s) {
    if (s == null) return null;
    return s.replace(/[,\u060C\s]/g, ""); // يشيل , و ، ومسافات
  }
  function toFloat(s) {
    const n = parseFloat(cleanNum(String(s)));
    return Number.isFinite(n) ? n : null;
  }
  function pickNumber(re, text) {
    const m = text.match(re);
    return m ? toFloat(m[1]) : null;
  }
  function pickTwoNumbers(re, text) {
    const m = text.match(re);
    if (!m) return [null, null];
    return [toFloat(m[1]), toFloat(m[2])];
  }

  // ——— محاولة التقاط TF من النص (اختياري) ———
  function pickTF(text) {
    // أمثلة: "الإطار: 30 دقيقة" / "TF: 15m" / "ساعة"
    const mMin = text.match(/(?:الإطار|TF)\s*[:：]?\s*(\d+)\s*(?:دقيقة|min|m)\b/i);
    if (mMin) return `${mMin[1]}m`;
    const mHour = text.match(/(?:الإطار|TF)\s*[:：]?\s*(\d+)\s*(?:ساعة|hour|h)\b/i);
    if (mHour) return `${mHour[1]}h`;
    return null;
  }

  // ——— تحويل رسالة نصيحة إلى Payload ———
  function payloadFromAdviceText(text) {
    if (!text) return null;

    // تجاهل حالات “لا توجد نصيحة / مرفوضة بالفلاتر”:
    if (/(لا توجد نصيحة|مرفوضة\s*بالفلاتر|filtersRejected\s*:\s*true)/i.test(text)) {
      return null;
    }

    // Side
    let side = null;
    if (/شراء|BUY/i.test(text)) side = "BUY";
    else if (/بيع|SELL/i.test(text)) side = "SELL";

    // TF من التطبيق أو من النص أو افتراضي
    const tf = (window.currentTF && String(window.currentTF)) || pickTF(text) || "15m";

    // Entry
    const entry =
      pickNumber(/(?:سعر\s*الدخول|Entry)\s*[:：]\s*([0-9.,\u060C]+)/i, text) ??
      pickNumber(/Entry\s*[:：]\s*([0-9.,\u060C]+)/i, text);

    // TP1/TP2
    // عربي: "الأهداف: 3987.63 / 4008.14" — إنكليزي: "TP1: 3987.63, TP2: 4008.14"
    let [tp1, tp2] =
      pickTwoNumbers(
        /(?:الأهداف|Targets?)\s*[:：]\s*([0-9.,\u060C]+)\s*[\/,،]\s*([0-9.,\u060C]+)/i,
        text
      ) || [];
    if (tp1 == null) {
      tp1 = pickNumber(/TP1\s*[:：]\s*([0-9.,\u060C]+)/i, text);
    }
    if (tp2 == null) {
      tp2 = pickNumber(/TP2\s*[:：]\s*([0-9.,\u060C]+)/i, text);
    }

    // SL
    const sl =
      pickNumber(/(?:وقف\s*الخسارة|SL)\s*[:：]\s*([0-9.,\u060C]+)/i, text) ??
      pickNumber(/SL\s*[:：]\s*([0-9.,\u060C]+)/i, text);

    // سعر حي إن وجِد
    const price =
      (typeof window.lastLivePrice === "number" && window.lastLivePrice) || null;

    if (!side) return null;

    return { side, tf, entry, tp1, tp2, sl, price, filtersRejected: false };
  }

  // ——— إرسال للWorker ———
  function sendToWorker(payload) {
    return fetch(WORKER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((j) => {
        console.log("[GS] sent:", payload, j && j.ok ? j : "");
        return j;
      })
      .catch((e) => console.error("[GS] send error:", e));
  }

  // ——— مرّة واحدة لكل شمعة (لا نكرّر مع تغيّر السعر فقط) ———
  const sentKeys = new Set();
  function makeKey(p) {
    return [
      p.side || "",
      p.tf || "",
      p.entry ?? "",
      p.tp1 ?? "",
      p.tp2 ?? "",
      p.sl ?? "",
    ].join("|");
  }

  function trySend(text) {
    const p = payloadFromAdviceText(text);
    if (!p) {
      console.warn("[GS] نصيحة غير مُرسلة (مرفوضة/غير موجودة).");
      return;
    }
    const key = makeKey(p);
    if (sentKeys.has(key)) {
      // نفس الشمعة عملياً (نفس القيم الأساسية)
      return;
    }
    sentKeys.add(key);
    sendToWorker(p);
  }

  // ——— إيجاد عنصر النصيحة ومراقبته ———
  const box =
    document.getElementById("adviceText") ||
    window.elAdviceText ||
    document.querySelector("#adviceText, .advice, .signal, main .wrap") ||
    document.body;

  if (!box) {
    console.warn("[GS] advice box not found, watching <main>.");
  } else {
    console.log("[GS] watching:", box);
  }

  // أرسل أوليًّا إن كانت النصيحة ظاهرة
  let lastText = (box.innerText || "").trim();
  trySend(lastText);

  // راقب أي تغيير بالنص
  const mo = new MutationObserver(() => {
    const txt = (box.innerText || "").trim();
    if (txt !== lastText) {
      lastText = txt;
      trySend(txt);
    }
  });
  mo.observe(box, { childList: true, subtree: true, characterData: true });

  console.log("[GS] watcher started.");
})();
```0
