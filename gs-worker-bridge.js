/* GoldSignals → Worker bridge (خفيف وآمن) */
(function () {
  // ⚠️ ضع رابط الوركر الخاص فيك:
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  // ==== 1) إرسال مباشر من الكود (اختياري) ====
  // تسمحلك تنادي الإرسال يدويًا من أي مكان:
  window.gsNotifyIfRealSignal = function (advice) {
    try {
      if (!advice) return;

      // السماح بحالتين فقط BUY/SELL
      if (advice.side !== "BUY" && advice.side !== "SELL") return;

      // إذا مرفوضة بالفلاتر لا ترسل
      if (advice.filtersRejected === true) return;

      const payload = {
        side: advice.side,                // "BUY" | "SELL"
        tf: advice.tf || "",             // "15m" | "30m" | "1h" ...
        entry: num(advice.entry),
        tp1: num(advice.tp1),
        tp2: num(advice.tp2),
        sl: num(advice.sl),
        price: num(advice.price) || num(advice.entry) || null,
        filtersRejected: false
      };

      // إرسال للـWorker
      fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(r => r.json())
        .then(r => console.log("[GS] sent:", payload, r))
        .catch(console.error);
    } catch (e) {
      console.error("[GS] notify error:", e);
    }
  };

  // ==== 2) مراقبة نصّ “النصيحة” داخل الصفحة تلقائيًا ====
  // يرسِل مرّة واحدة فقط عندما يتغيّر النص فعلاً (ويتجاهل “مرفوض/الفلاتر”)
  const box =
    document.getElementById("adviceText") ||
    document.querySelector("#adviceText, .advice, [data-advice]") ||
    document.querySelector("main");

  if (!box) {
    console.warn("[GS] advice box not found — watcher disabled.");
    return;
  }

  let lastText = "";

  function trySend(text) {
    try {
      text = (text || "").trim();
      if (!text) return;

      // إرسال مرّة واحدة فقط لكل تغيير حقيقي بالنص
      if (text === lastText) return;
      lastText = text;

      // تجاهُل الحالات غير الحقيقة/المرفوضة
      if (includesAny(text, ["لا توجد نصيحة", "مرفوض", "مرفوضة", "الفلاتر"])) {
        console.warn("[GS] نصيحة غير مُرسلة (مرفوضة/غير موجودة).");
        return;
      }

      const parsed = parseAdvice(text);
      if (!parsed || !parsed.side) {
        console.warn("[GS] parsing failed.");
        return;
      }

      // أرسل عبر الدالة العلوية الموحّدة
      window.gsNotifyIfRealSignal({
        side: parsed.side,
        tf: parsed.tf,
        entry: parsed.entry,
        tp1: parsed.tp1,
        tp2: parsed.tp2,
        sl: parsed.sl,
        price: (window.lastLivePrice != null ? window.lastLivePrice : parsed.entry),
        filtersRejected: false
      });
    } catch (e) {
      console.error("[GS] trySend error:", e);
    }
  }

  // إرسال أوّلي إن كان في نصيحة ظاهرة
  trySend(getText(box));

  // راقب أي تغيير بالنص
  const mo = new MutationObserver(() => {
    const txt = getText(box);
    // الشرط المعدّل: نص موجود + غير فارغ + تغيّر فعلاً
    if (txt && txt.trim() && txt !== lastText) {
      trySend(txt);
    }
  });
  mo.observe(box, { childList: true, subtree: true, characterData: true });

  console.log("[GS] watcher started.");

  // ==== توابع مساعدة ====
  function getText(el) {
    if (!el) return "";
    // بعض العناصر قد تحتوي على نصّ داخلية عربية مع أرقام مفصولة بفواصل
    return (el.innerText || el.textContent || "").trim();
  }

  function includesAny(t, arr) {
    t = t || "";
    return arr.some(k => t.includes(k));
    }

  function num(v) {
    if (v == null) return null;
    if (typeof v === "number") return v;
    // حوّل "4,008.14" أو "3٬987.63" لأرقام
    const s = String(v).replace(/[^\d.\-]/g, "").replace(/(\..*)\./g, "$1"); // إزالة أي فواصل عربية/إنجليزية
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  // يحاول استخراج BUY/SELL و TF و Entry/TP1/TP2/SL من نص عربي
  function parseAdvice(text) {
    // side
    let side = null;
    if (text.includes("شراء")) side = "BUY";
    else if (text.includes("بيع")) side = "SELL";

    // tf: أمثلة في النص: "الإطار: 30 دقيقة" أو "الإطار: 5 دقيقة" أو "ساعة"
    let tf = "";
    const mTfMin = text.match(/الإطار[:：]?\s*(\d+)\s*دقيقة/);
    const mTfHour = text.match(/الإطار[:：]?\s*ساعة/);
    if (mTfMin) tf = `${mTfMin[1]}m`;
    else if (mTfHour) tf = "1h";

    // entry
    let entry = pickNumberAfter(text, /سعر الدخول[:：]?\s*/);

    // TP1/TP2: إمّا بصيغة TP1/TP2 أو "الأهداف: X , Y"
    let tp1 = null, tp2 = null;
    const mTP = text.match(/TP1\s*\/\s*TP2[:：]?\s*([0-9.,٬]+)\s*\/\s*([0-9.,٬]+)/i);
    if (mTP) {
      tp1 = num(mTP[1]);
      tp2 = num(mTP[2]);
    } else {
      const mGoals = text.match(/الأهداف[:：]?\s*([0-9.,٬]+)\s*[،,]\s*([0-9.,٬]+)/);
      if (mGoals) {
        tp1 = num(mGoals[1]);
        tp2 = num(mGoals[2]);
      }
    }

    // SL
    let sl = pickNumberAfter(text, /وقف الخسارة[:：]?\s*/);

    return { side, tf, entry, tp1, tp2, sl };
  }

  function pickNumberAfter(text, re) {
    const idx = text.search(re);
    if (idx === -1) return null;
    const sub = text.slice(idx).replace(re, "");
    const m = sub.match(/([0-9.,٬]+)/);
    return m ? num(m[1]) : null;
  }
})();
