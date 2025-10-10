/* GoldSignals → Worker bridge (ثابت وآمن) */
(function () {
  // ⚠️ ضع رابط الوركر الخاص فيك:
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  /* ---------- أدوات قراءة الأرقام والنص ---------- */

  // ينظّف الأرقام: يشيل فواصل الآلاف العربية/الإنجليزية والمسافات والـNBSP،
  // ويحوّل الفاصل العشري العربي (٫) إلى نقطة.
  function cleanNum(s) {
    if (s == null) return null;
    let t = String(s);
    t = t.replace(/\u066B/g, ".");                 // '٫' → '.'
    t = t.replace(/[,\u060C\u066C\u00A0\s]/g, ""); // ,  ،  ٬  NBSP  ومسافات
    return t;
  }
  function toNumber(s) {
    const v = cleanNum(s);
    return v ? Number(v) : null;
  }

  // يلتقط رقم واحد بنمط معيّن
  function pickNumber(re, text) {
    const m = text.match(re);
    return m ? toNumber(m[1]) : null;
  }
  // يلتقط رقمين بنمط واحد
  function pickTwoNumbers(re, text) {
    const m = text.match(re);
    return m ? [toNumber(m[1]), toNumber(m[2])] : null;
  }

  // يحوّل إطار زمني في النص إلى شكل قياسي: "5m" / "15m" / "30m" / "1h"...
  function parseTf(text) {
    // أمثلة: "الإطار: 30 دقيقة" أو "TF: 15m" أو "TF: 1h"
    const m =
      text.match(/(?:الإطار|tf)\s*[:：]?\s*([0-9]+)\s*(?:د|دقيقة|minutes?|m)\b/i) ||
      text.match(/(?:الإطار|tf)\s*[:：]?\s*([0-9]+)\s*(?:س|ساعة|hours?|h)\b/i) ||
      text.match(/tf\s*[:：]?\s*([0-9]+m|[0-9]+h)\b/i);
    if (!m) return null;

    const raw = m[1].toLowerCase();
    if (raw.endsWith("m")) return raw;
    if (raw.endsWith("h")) return raw;

    // رقم + دقائق افتراضي
    const n = Number(raw);
    if (!isNaN(n)) {
      // لو لقي كلمة ساعة في السطر:
      if (/ساعة|hours?|h/i.test(m[0])) return `${n}h`;
      return `${n}m`;
    }
    return null;
  }

  // يحوّل tf إلى عدد دقائق
  function tfToMinutes(tf) {
    if (!tf) return null;
    const m = tf.match(/^(\d+)([mh])$/i);
    if (!m) return null;
    const n = Number(m[1]);
    return m[2].toLowerCase() === "h" ? n * 60 : n;
  }

  // مفتاح مرّة لكل شمعة: يعتمد على tf والشمعة الحالية
  function candleKeyFor(tf) {
    const mins = tfToMinutes(tf);
    if (!mins) return `na:${Math.floor(Date.now() / 6e4)}`;
    const bucket = Math.floor(Date.now() / (mins * 60 * 1000));
    return `${tf}:${bucket}`;
  }

  /* ---------- تحليل نص النصيحة ---------- */

  function parseAdviceText(text) {
    if (!text) return null;

    // تجاهل الحالات غير الحقيقية/المرفوضة بالفلاتر
    if (/(لا\s*توجد\s*نصيحة|مرفوضة\s*بالفلاتر)/i.test(text)) {
      return { notReal: true };
    }

    // BUY / SELL (عربي/إنجليزي)
    const sideMap = { "شراء": "BUY", "بيع": "SELL" };
    let side =
      (text.match(/(?:الإشارة|الملخص|side)\s*[:：]?\s*(شراء|بيع)/i) || [])[1] ||
      (text.match(/\b(BUY|SELL)\b/i) || [])[1];
    if (!side) return null;
    side = sideMap[side] || side.toUpperCase();

    // TF
    const tf = parseTf(text) || "15m";

    // Entry
    const entry =
      pickNumber(/(?:سعر\s*الدخول|Entry)\s*[:：]\s*([0-9.,\u060C\u066B\u066C\s]+)/i, text) ??
      pickNumber(/Entry\s*[:：]\s*([0-9.,\u060C\u066B\u066C\s]+)/i, text);

    // TP1/TP2 (قد تأتي مع فاصلة/شرطة مائلة أو على سطرين)
    let pair = pickTwoNumbers(
      /(?:الأهداف|Targets?)\s*[:：]\s*([0-9.,\u060C\u066B\u066C\s]+)\s*[\/,،]\s*([0-9.,\u060C\u066B\u066C\s]+)/i,
      text
    );
    let tp1 = pair ? pair[0] : null;
    let tp2 = pair ? pair[1] : null;
    if (tp1 == null) tp1 = pickNumber(/TP1\s*[:：]\s*([0-9.,\u060C\u066B\u066C\s]+)/i, text);
    if (tp2 == null) tp2 = pickNumber(/TP2\s*[:：]\s*([0-9.,\u060C\u066B\u066C\s]+)/i, text);

    // SL
    const sl =
      pickNumber(/(?:وقف\s*الخسارة|SL)\s*[:：]\s*([0-9.,\u060C\u066B\u066C\s]+)/i, text) ??
      pickNumber(/SL\s*[:：]\s*([0-9.,\u060C\u066B\u066C\s]+)/i, text);

    return {
      side,
      tf,
      entry,
      tp1,
      tp2,
      sl,
      filtersRejected: false,
    };
  }

  /* ---------- إرسال إلى الوركر + منع التكرار ---------- */

  const sentByKey = new Set();

  async function sendOncePerCandle(payload) {
    const key = `${payload.side}|${payload.tf}|${candleKeyFor(payload.tf)}|${payload.entry}|${payload.tp1}|${payload.tp2}|${payload.sl}`;
    if (sentByKey.has(key)) return false;
    sentByKey.add(key);

    try {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      console.log("[GS] sent:", payload, j);
      return true;
    } catch (e) {
      console.error("[GS] send failed:", e);
      return false;
    }
  }

  /* ---------- مراقبة النص في الصفحة ---------- */

  function getAdviceBox() {
    // جرّب id ثابت إن وُجد
    const el1 = document.getElementById("adviceText");
    if (el1) return el1;
    // وإلا التقط أول قسم ملخّص (النص العربي الموجود في صفحتك)
    const candidates = Array.from(document.querySelectorAll("main, .wrap, body"));
    for (const c of candidates) {
      if (c && c.innerText && /نصيحة\s*الدخول\/الخروج|الإشارة/i.test(c.innerText)) {
        return c;
      }
    }
    // fallback: النص الكامل في main
    return document.querySelector("main, body") || document.body;
  }

  function startWatcher() {
    const box = getAdviceBox();
    if (!box) {
      console.warn("[GS] no box found to watch.");
      return;
    }
    console.log("[GS] watching:", box);

    let lastText = "";
    function trySend(text) {
      const adv = parseAdviceText(text);
      if (!adv || adv.notReal) {
        console.warn("[GS] نصيحة غير مُرسلة (مرفوضة/غير موجودة).");
        return;
      }
      sendOncePerCandle(adv);
    }

    // إرسال أولي إن كانت نصيحة ظاهرة
    trySend(box.innerText || "");

    // راقب تغيّر النص
    const mo = new MutationObserver(() => {
      const t = box.innerText || "";
      if (t !== lastText) {
        lastText = t;
        trySend(t);
      }
    });
    mo.observe(box, { childList: true, subtree: true, characterData: true });

    console.log("[GS] watcher started.");
  }

  // نقطة دخول
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startWatcher);
  } else {
    startWatcher();
  }

  // دالة متاحة يدويًا إن حبيت تنادي فيها من كودك:
  window.gsNotifyIfRealSignal = async function (advice) {
    if (!advice || !advice.side) return;
    // تأكد من tf
    advice.tf = advice.tf || parseTf(document.body.innerText || "") || "15m";
    await sendOncePerCandle(advice);
  };
})();
