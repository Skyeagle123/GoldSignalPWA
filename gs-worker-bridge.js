/* GoldSignals → Worker bridge (stable) */
(function () {
  // ضع هنا رابط الـ Worker لديك (ينتهي بـ /alert)
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  // أدوات صغيرة
  const once = f => { let d=false; return (...a)=>{ if(d) return; d=true; return f(...a); }; };
  const toNum = v => {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    const m = String(v).replace(/[^\d.]/g, '');
    return m ? Number(m) : null;
  };

  // استخراج البيانات من نصّ النصيحة (عربي)
  function parseAdvice(text) {
    if (!text || typeof text !== 'string') return null;

    // جانب (شراء/بيع)
    let side = null;
    if (text.includes("شراء")) side = "BUY";
    if (text.includes("بيع"))   side = "SELL";

    // الإطار الزمني (5/15/30/60… دقيقة)
    // نلتقط أول رقم متبوع بحرف m أو كلمة دقيقة/دقائق أو رقم وحيد في خانة "الإطار"
    let tfMins = null;
    {
      const m = text.match(/(?:الإطار[:：]?\s*)?(\d+)\s*(?:m|د(?:ق(?:ي(?:ق(?:ة|ات)?)?)?)?)/i);
      if (m) tfMins = Number(m[1]);
    }

    // الدخول
    let entry = null;
    {
      const m = text.match(/(?:سعر\s*الدخول[:：]?\s*|دخول[:：]?\s*)([-\d.,]+)/i);
      if (m) entry = toNum(m[1]);
    }

    // TP1
    let tp1 = null;
    {
      const m = text.match(/(?:TP1[:：]?\s*|الأهداف[:：]?\s*)([-\d.,]+)/i);
      if (m) tp1 = toNum(m[1]);
    }

    // TP2 (إن وجد)
    let tp2 = null;
    {
      // نحاول نمطين: "TP1/TP2: 4000 / 4010" أو "TP2: 4010"
      let m = text.match(/TP1\/TP2[:：]?\s*([-\d.,]+)\s*\/\s*([-\d.,]+)/i);
      if (m) {
        tp1 = tp1 ?? toNum(m[1]);
        tp2 = toNum(m[2]);
      } else {
        m = text.match(/TP2[:：]?\s*([-\d.,]+)/i);
        if (m) tp2 = toNum(m[1]);
      }
    }

    // SL
    let sl = null;
    {
      const m = text.match(/(?:SL|وقف\s*الخسارة)[:：]?\s*([-\d.,]+)/i);
      if (m) sl = toNum(m[1]);
    }

    if (!side || !tfMins) return null;

    return { side, tf: `${tfMins}m`, tfMins, entry, tp1, tp2, sl };
  }

  // تخزين آخر شمعة أرسلنا لها (حسب TF)، لمنع الإرسال المتكرر داخل نفس الشمعة
  function getCandleKey(tfMins) {
    const bucket = Math.floor(Date.now() / (tfMins * 60 * 1000));
    return `${tfMins}:${bucket}`;
  }
  function getSentKey(tfMins) {
    try {
      const raw = localStorage.getItem('__gs_sent_candles') || '{}';
      return JSON.parse(raw);
    } catch { return {}; }
  }
  function setSentKey(map) {
    try { localStorage.setItem('__gs_sent_candles', JSON.stringify(map)); } catch {}
  }

  async function sendToWorker(payload) {
    try {
      const r = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json().catch(()=> ({}));
      console.log("[GS] sent:", payload, { ok: r.ok, tg_status: body?.ok ? 200 : body?.status });
    } catch (e) {
      console.warn("[GS] send failed:", e);
    }
  }

  // واجهة عامة (إذا بدك تبعتها يدويًا من الـ Console)
  window.gsNotifyIfRealSignal = async function (adviceTextOrObj) {
    let parsed = null;

    if (typeof adviceTextOrObj === 'string') {
      parsed = parseAdvice(adviceTextOrObj);
    } else if (adviceTextOrObj && typeof adviceTextOrObj === 'object') {
      // دعم تمريـر كائن جاهز
      parsed = {
        side: adviceTextOrObj.side,
        tf: adviceTextOrObj.tf || (adviceTextOrObj.tfMins ? `${adviceTextOrObj.tfMins}m` : undefined),
        tfMins: adviceTextOrObj.tfMins ?? (typeof adviceTextOrObj.tf === 'string' && adviceTextOrObj.tf.endsWith('m')
                  ? Number(adviceTextOrObj.tf.replace('m','')) : undefined),
        entry: adviceTextOrObj.entry ?? null,
        tp1: adviceTextOrObj.tp1 ?? null,
        tp2: adviceTextOrObj.tp2 ?? null,
        sl:  adviceTextOrObj.sl  ?? null,
        price: adviceTextOrObj.price ?? adviceTextOrObj.lastLivePrice ?? null,
        filtersRejected: !!adviceTextOrObj.filtersRejected
      };
    }

    if (!parsed) {
      console.warn("[GS] parsing failed.");
      return;
    }

    // احترم “مرّة لكل شمعة”:
    if (!parsed.tfMins || !Number.isFinite(parsed.tfMins)) {
      console.warn("[GS] missing tfMins, skip.");
      return;
    }
    const keyNow   = getCandleKey(parsed.tfMins);
    const sentMap  = getSentKey(parsed.tfMins);
    if (sentMap[parsed.tfMins] === keyNow) {
      // أرسلنا بنفس الشمعة، تجاهل
      return;
    }

    // جهز الحمولة للـ Worker
    const payload = {
      side: parsed.side,
      tf: parsed.tf,
      entry: parsed.entry ?? parsed.price ?? null,
      tp1: parsed.tp1 ?? null,
      tp2: parsed.tp2 ?? null,
      sl: parsed.sl ?? null,
      filtersRejected: !!parsed.filtersRejected,
    };

    await sendToWorker(payload);

    // علّم إنو هالشمعة انبعتت
    sentMap[parsed.tfMins] = keyNow;
    setSentKey(sentMap);
  };

  // مراقبة نصّ النصيحة تلقائيًّا
  function wireWatcher() {
    const box =
      document.getElementById("adviceText") ||
      window.elAdviceText ||
      document.querySelector("#adviceText, .advice, [data-advice]") ||
      document.querySelector("main.wrap, main");

    if (!box) return;

    console.log("[GS] watcher started.");
    let lastText = "";

    const trySend = once(async (txt) => {
      // نحاول كل تحديث أيضاً لكن من غير تكرار ضمن نفس الشمعة
      const parsed = parseAdvice(txt);
      if (parsed) {
        console.log("[GS] parsed:", parsed);
        await window.gsNotifyIfRealSignal(txt);
      } else {
        console.warn("[GS] parsing failed.");
      }
    });

    // إرسال أولي إذا النصيحة ظاهرة
    if (box.innerText) trySend(box.innerText);

    // راقب تغيّر النص
    const mo = new MutationObserver(() => {
      const txt = box.innerText || "";
      if (txt && txt !== lastText) {
        lastText = txt;
        window.gsNotifyIfRealSignal(txt); // تعتمد على قفل “مرّة لكل شمعة”
      }
    });
    mo.observe(box, { childList: true, subtree: true, characterData: true });
  }

  // زر تصدير CSV لديك يرمي خطأ بالكونسول – تجاهله
  try { wireWatcher(); } catch (e) { console.warn(e); }
})();
