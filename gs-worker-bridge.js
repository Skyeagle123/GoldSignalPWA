/* gs-worker-bridge.js (v7 Arabic support) */

(() => {
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  // تحويل الأرقام العربية ↦ إنكليزية
  const arToEn = (s) =>
    (s || "").replace(/[\u0660-\u0669]/g, (d) =>
      String("0123456789"["\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d)])
    );

  const pickNum = (txt, re) => {
    const m = arToEn(txt).match(re);
    return m ? Number(m[1]) : null;
  };

  function parseAdvice(txt) {
    const t = txt.replace(/\s+/g, " ").trim();

    // اتجاه
    let side = /شراء|BUY/i.test(t) ? "BUY" : /بيع|SELL/i.test(t) ? "SELL" : null;

    // TF
    let tf = (t.match(/\b(5 ?م|15 ?م|30 ?م|1 ?س|5m|15m|30m|1h)\b/i) || [])[1];
    if (tf) {
      tf = tf.replace(" ", "").replace("م", "m").replace("س", "h");
    } else {
      const m = Number(window.currentTFMinutes || 15);
      tf = m === 60 ? "1h" : `${m}m`;
    }

    // Entry / هدف أول / هدف ثاني / وقف الخسارة
    const entry = pickNum(t, /(?:دخول|Entry)[:：]?\s*([0-9]+(?:\.[0-9]+)?)/i);
    const tp1 = pickNum(t, /(?:هدف ?أول|هدف1|TP1)[:：]?\s*([0-9]+(?:\.[0-9]+)?)/i);
    const tp2 = pickNum(t, /(?:هدف ?ثاني|هدف2|TP2)[:：]?\s*([0-9]+(?:\.[0-9]+)?)/i);
    const sl = pickNum(t, /(?:وقف ?الخسارة|SL|ستوب)[:：]?\s*([0-9]+(?:\.[0-9]+)?)/i);

    const live = Number(window.lastLivePrice || window.__lastLivePrice || NaN);
    const price = isNaN(live) ? entry ?? null : live;

    return { side, tf, entry, tp1, tp2, sl, price };
  }

  const sentBuckets = new Map();

  function candleBucket(tf) {
    const m = tf === "1h" ? 60 : Number((tf || "").replace(/m/i, "")) || 15;
    const now = new Date();
    const minutes = now.getUTCMinutes();
    const openMin = minutes - (minutes % m);
    return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()} ${now.getUTCHours()}:${openMin}`;
  }

  async function sendToWorker(payload) {
    try {
      const r = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      console.log("[GS] sent:", payload, j);
    } catch (e) {
      console.warn("[GS] worker send failed:", e);
    }
  }

  const box = document.getElementById("adviceText");
  if (!box) {
    console.warn("[GS] adviceText element not found.");
    return;
  }
  console.log("[GS] Arabic watcher started.");

  let lastTxt = "";
  function trySend(txt) {
    const adv = parseAdvice(txt);
    if (!adv.side) return;

    const bucketKey = `${adv.side}|${adv.tf}|${candleBucket(adv.tf)}`;
    if (sentBuckets.has(bucketKey)) return;

    const payload = {
      side: adv.side,
      tf: adv.tf,
      entry: adv.entry ?? adv.price,
      tp1: adv.tp1,
      tp2: adv.tp2,
      sl: adv.sl,
      price: adv.price,
    };

    sendToWorker(payload);
    sentBuckets.set(bucketKey, true);
  }

  trySend(box.innerText || "");

  const mo = new MutationObserver(() => {
    const txt = box.innerText || "";
    if (txt !== lastTxt) {
      lastTxt = txt;
      trySend(txt);
    }
  });
  mo.observe(box, { childList: true, subtree: true, characterData: true });
})();
