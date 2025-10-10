<!-- سمّه مثلاً: gs-worker-bridge.js وأضِفه بعد app.js -->
<script>
(() => {
  // عدّل فقط هذا العنوان إذا تغيّر
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  // --- أدوات مساعدة ---
  const toNum = (s) => {
    if (s == null) return null;
    // بدّل الفاصلة العربية / الغربية إلى نقطة
    s = String(s).trim().replace(/\u066B/g, ".").replace(/,/g, ".");
    // أرقام عربية → غربية
    s = s.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };

  const tfLabel = () => {
    const t = (window.currentTF || window.currentTf || window.current_tframe || "").toString().toLowerCase();
    if (/^5/.test(t)) return "5m";
    if (/^15/.test(t)) return "15m";
    if (/^30/.test(t)) return "30m";
    if (/^60|^1h|ساعة/.test(t)) return "1h";
    // من النص العربي داخل الصندوق (الإطار: … دقيقة/ساعة)
    const txt = getAdviceBox()?.innerText || "";
    const m = txt.match(/الإطار:\s*([\d\u0660-\u0669]+)\s*(?:دقيقة|دقائق)/);
    if (m) return `${toNum(m[1])|0}m`;
    if (/الإطار:\s*ساعة/.test(txt)) return "1h";
    return "15m"; // افتراضي
  };

  const getCandleKey = () => {
    const tf = tfLabel();
    const tfMin = tf === "1h" ? 60 : parseInt(tf);
    const now = Date.now();
    const openMs = Math.floor(now / (tfMin*60*1000)) * (tfMin*60*1000);
    return `${tf}|${openMs}`;
  };

  const getAdviceBox = () =>
    document.getElementById("adviceText") ||
    window.elAdviceText ||
    document.querySelector("#adviceText, .advice, .hint, main.wrap");

  // --- Parse نص النصيحة ---
  function parseAdvice(text) {
    if (!text) return null;

    // تجاهل الحالات غير الحقيقية
    if (/مرفوضة|غير\s+موجودة/i.test(text)) return { rejected:true };

    // SIDE
    let side = null;
    if (/شراء/.test(text)) side = "BUY";
    else if (/بيع/.test(text)) side = "SELL";

    // TF minutes (إن وُجد)
    let tfm = null;
    const mTfMin = text.match(/الإطار:\s*([\d\u0660-\u0669]+)\s*(?:دقيقة|دقائق)/);
    if (mTfMin) tfm = toNum(mTfMin[1]);
    if (!tfm && /الإطار:\s*ساعة/.test(text)) tfm = 60;

    // Entry
    let entry = null;
    // نمط: "سعر الدخول: 4005.12"
    const mEntry = text.match(/سعر\s*الدخول[:：]?\s*([0-9\u0660-\u0669.,]+)/);
    if (mEntry) entry = toNum(mEntry[1]);

    // SL
    let sl = null;
    const mSL = text.match(/وقف\s*الخسارة[:：]?\s*([0-9\u0660-\u0669.,]+)/);
    if (mSL) sl = toNum(mSL[1]);

    // TP1/TP2
    let tp1 = null, tp2 = null;

    // 1) نمط الأهداف: "الأهداف: 4010.5 / 4020.8"
    const mTargets = text.match(/الأهداف[:：]?\s*([0-9\u0660-\u0669.,]+)\s*[/|]\s*([0-9\u0660-\u0669.,]+)/);
    if (mTargets) {
      tp1 = toNum(mTargets[1]);
      tp2 = toNum(mTargets[2]);
    }

    // 2) نمط: "TP1: xxx" و "TP2: yyy"
    if (tp1 == null) {
      const mTp1 = text.match(/TP1[:：]?\s*([0-9\u0660-\u0669.,]+)/i);
      if (mTp1) tp1 = toNum(mTp1[1]);
    }
    if (tp2 == null) {
      const mTp2 = text.match(/TP2[:：]?\s*([0-9\u0660-\u0669.,]+)/i);
      if (mTp2) tp2 = toNum(mTp2[1]);
    }

    // fallback للـ TF من واجهة الموقع
    const tf = tfm ? (tfm===60 ? "1h" : `${tfm}m`) : tfLabel();

    return { side, tf, entry, tp1, tp2, sl, rejected:false };
  }

  // --- منع التكرار: مرّة لكل شمعة ---
  const sentBuckets = new Set();
  const sentOnceOnLoad = new Set(); // يمنع إعادة الإرسال بعد refresh لنفس الشمعة

  async function sendToWorker(payload) {
    try {
      const r = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      // للديبَغ
      const ok = r.ok;
      let tg_status = null;
      try { const b = await r.json(); tg_status = b?.tg_status; } catch(e){}
      console.log("[GS] sent:", payload, {ok, tg_status});
    } catch (e) {
      console.warn("[GS] send failed:", e);
    }
  }

  function trySend(text) {
    const p = parseAdvice(text);
    if (!p || p.rejected) {
      console.warn("[GS] نصيحة غير مُرسلة (مرفوضة/غير موجودة).");
      return;
    }
    if (!p.side || !p.entry) {
      console.warn("[GS] parsing failed.", p);
      return;
    }

    const key = `${p.side}|${p.tf}|${getCandleKey()}`;

    // لا تُرسل إذا أرسلت ضمن نفس الشمعة
    if (sentBuckets.has(key)) return;
    // لا تُرسل إذا هذه أول لحظة بعد refresh وقد أُرسلت مسبقًا خلال نفس الشمعة
    if (sentOnceOnLoad.has(key)) return;

    sentBuckets.add(key);
    sentOnceOnLoad.add(key);

    // صياغة الرسالة + تمرير كل الحقول (قد يكون tp1/tp2 null إذا غير متوفرين)
    sendToWorker({
      side: p.side,
      tf: p.tf,
      entry: p.entry,
      tp1: p.tp1,
      tp2: p.tp2,
      sl: p.sl,
      filtersRejected: false
    });
  }

  // --- مراقبة النص ---
  const box = getAdviceBox();
  if (!box) {
    console.warn("[GS] لم أجد صندوق النصيحة.");
    return;
  }
  console.log("[GS] watcher started.");

  let lastText = "";

  // أرسل مرّة أولى إذا كانت النصيحة ظاهرة
  lastText = box.innerText || "";
  if (lastText) trySend(lastText);

  // راقب تغيّر النص
  const mo = new MutationObserver(() => {
    const txt = box.innerText || "";
    if (txt !== lastText) {
      lastText = txt;
      trySend(txt);
    }
  });
  mo.observe(box, { childList:true, subtree:true, characterData:true });

})();
</script>
