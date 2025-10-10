// gs-worker-bridge - نسخة كاملة
// يحفظ: مرة واحدة لكل شمعة (per candle) لكل TF ولكل side (BUY/SELL)
// ضع WORKER_URL لرابط الـ worker/alert الخاص بك

(function () {
  "use strict";

  // --- CONFIG ---
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert"; // غيره هنا
  // --------------------------------

  // تحويل رموز TF الى دقائق
  function tfToMinutes(tf) {
    if (!tf) return 15;
    tf = String(tf).toLowerCase().trim();
    if (tf.endsWith("m")) return parseInt(tf, 10);
    if (tf.endsWith("h")) return parseInt(tf, 10) * 60;
    if (tf.endsWith("d")) return parseInt(tf, 10) * 60 * 24;
    // fallback: حاول parse رقم
    const n = parseInt(tf, 10);
    return Number.isFinite(n) ? n : 15;
  }

  // bucket لتمييز الشمعة الحالية حسب TF
  function currentBucket(tf) {
    const mins = tfToMinutes(tf) || 15;
    return Math.floor(Date.now() / (mins * 60 * 1000));
  }

  // Map لتخزين آخر bucket أرسلنا عليه لكل key = `${side}|${tf}`
  const lastSentBucket = new Map();

  async function sendOncePerCandle(payload) {
    const tf = payload.tf || "15m";
    const side = (payload.side || "NA").toString();
    const key = `${side}|${tf}`;
    const bucket = currentBucket(tf);

    if (lastSentBucket.get(key) === bucket) {
      console.log("[GS] skipped: already sent this candle", key, bucket);
      return false;
    }
    // نضع المؤشر قبل الإرسال لتجنّب السباقات
    lastSentBucket.set(key, bucket);

    try {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      // حاول نقرأ JSON لو رجع
      const j = await res.json().catch(() => ({}));
      console.log("[GS] sent:", payload, j);
      return true;
    } catch (e) {
      console.error("[GS] send failed:", e);
      // لو فشل، نزيل المفتاح حتى يحاول مرة ثانية لاحقاً
      if (lastSentBucket.get(key) === bucket) lastSentBucket.delete(key);
      return false;
    }
  }

  // === استخراج البيانات من النص الظاهر في الواجهة ===
  // الدالة الأم: parseAdviceFromText
  function parseAdviceFromText(text) {
    // تحضيرات: نعالج نص عربي/انجليزي بسيط
    if (!text || !text.trim()) return null;
    const t = text.replace(/\r/g, "\n").replace(/\n+/g, "\n").trim();
    // بعض المواقع تعرض كـ:
    // Side: BUY
    // TF: 15m
    // Entry: 2365.5
    // TP1: 2368
    // TP2: 2372
    // SL: 2359.5
    // أو قد يكون بالعربية — نحاول قراءة الكلمات المفتاح:
    const obj = {};
    const lines = t.split("\n").map(s => s.trim()).filter(Boolean);

    for (const line of lines) {
      const lower = line.toLowerCase();
      // side
      if (lower.includes("side") || lower.includes("جهة") || lower.includes("إشارة") || /buy|sell/.test(lower)) {
        const m = line.match(/(buy|sell)/i);
        if (m) obj.side = m[1].toUpperCase();
        else {
          const m2 = line.match(/(side|جهة|إشارة)\s*[:\-]?\s*(\w+)/i);
          if (m2) obj.side = m2[2].toUpperCase();
        }
        continue;
      }
      // tf
      if (lower.includes("tf") || lower.includes("timeframe") || lower.includes("دقيقة") || lower.includes("m") && /[0-9]+m/.test(lower)) {
        const m = line.match(/(\d+\s*[mhd])/i);
        if (m) obj.tf = m[1].replace(/\s+/g, "");
        else {
          const m2 = line.match(/(tf|timeframe)\s*[:\-]?\s*([0-9]+m)/i);
          if (m2) obj.tf = m2[2];
        }
        continue;
      }
      // entry / دخول
      if (/entry|دخول|سعر الدخول/i.test(lower)) {
        const m = line.match(/([0-9]+(?:\.[0-9]+)?)/);
        if (m) obj.entry = parseFloat(m[1]);
        continue;
      }
      // tp1 tp2
      if (/tp1|target1|tp/i.test(lower) && /tp1/i.test(lower) || /tp1/i.test(lower)) {
        const m = line.match(/tp1[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
        if (m) obj.tp1 = parseFloat(m[1]);
        continue;
      }
      if (/tp2/i.test(lower)) {
        const m = line.match(/tp2[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
        if (m) obj.tp2 = parseFloat(m[1]);
        continue;
      }
      // SL
      if (/sl|stop|sl:|وقف الخسارة|وقف/i.test(lower)) {
        const m = line.match(/([0-9]+(?:\.[0-9]+)?)/);
        if (m) obj.sl = parseFloat(m[1]);
        continue;
      }
      // general numbers: if line starts with number, maybe it's price
      const mnum = line.match(/^([0-9]+(?:\.[0-9]+)?)/);
      if (mnum && !obj.entry) {
        obj.entry = parseFloat(mnum[1]);
        continue;
      }
    } // end lines

    // fallback values
    if (!obj.tf) obj.tf = "15m";
    if (!obj.side) obj.side = "BUY";

    return obj;
  }

  // === البحث عن العنصر الذي يعرض النص (advice) في الصفحة ===
  function findAdviceElement() {
    // تحاول إيجاد عناصر متوقعة - عدّل selectors حسب صفحتك
    const candidates = [
      "#adviceText",
      "#advice",
      ".advice",
      ".adviceText",
      "#signalText",
      ".signal-text",
      ".wrap main", // مجرد محاولة ثانية
    ];

    for (const s of candidates) {
      try {
        const el = document.querySelector(s);
        if (el) return el;
      } catch (e) { /* ignore selector errors */ }
    }

    // fallback: نحاول آخر عنصر <main> أو العنصر الرئيسي
    const main = document.querySelector("main");
    if (main) return main;
    return document.body;
  }

  // === وظيفة الإرسال: تحضير payload ثم sendOncePerCandle ===
  async function trySend(text) {
    try {
      const parsed = parseAdviceFromText(text);
      if (!parsed) {
        console.warn("[GS] parsing failed.");
        return false;
      }

      // مكوّن payload كامل مع تفاصيل يمكن للـ worker أن يعالجها
      const payload = {
        side: parsed.side || "BUY",
        tf: parsed.tf || "15m",
        entry: parsed.entry || null,
        tp1: parsed.tp1 || null,
        tp2: parsed.tp2 || null,
        sl: parsed.sl || null,
        price: parsed.entry || parsed.price || null,
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

  // === تهيئة المراقب (observer) لملاحظة تغيّر النص ===
  function startWatcher() {
    const box = findAdviceElement();
    if (!box) {
      console.warn("[GS] advice element not found.");
      return;
    }

    let lastText = (box.innerText || "").trim();
    console.log("[GS] watcher started. initial text:", lastText);

    // أرسل أولاً إذا يوجد نص صالح
    if (lastText) trySend(lastText);

    // MutationObserver لمراقبة التغيير في المحتوى
    const mo = new MutationObserver(() => {
      const txt = (box.innerText || "").trim();
      if (txt && txt !== lastText) {
        lastText = txt;
        trySend(txt);
      }
    });

    mo.observe(box, { childList: true, subtree: true, characterData: true });
  }

  // تشغيل
  try {
    startWatcher();
  } catch (e) {
    console.error("[GS] init failed:", e);
  }

})();
