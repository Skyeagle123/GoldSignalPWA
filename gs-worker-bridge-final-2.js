
/* ============================================================
   GoldSignals → Worker bridge (with TP/SL parsing + de-dup)
   - Sends ONE message per real signal (BUY/SELL) per TF+Entry
   - Reads from advice text (Arabic/English) OR from advice object
   - Includes Entry / TP1 / TP2 / SL when present
   ============================================================ */
(function () {
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  // De-dup memory (avoid spam)
  const lastSent = new Map();  // key: tf|side|entryRounded
  const DEDUP_TTL_MS = 15 * 60 * 1000; // 15 minutes

  // ---------- helpers ----------
  function coalesce(...vals) {
    for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
    return null;
  }
  function toNumber(x) {
    if (x === null || x === undefined) return null;
    const n = Number(String(x).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  function canonTF(tf) {
    if (!tf && typeof window !== "undefined") {
      const cur = (window.currentTF ?? window.TF ?? null);
      if (cur) tf = cur;
    }
    if (tf === null || tf === undefined || tf === "") return "";
    const s = String(tf).toLowerCase().trim();
    if (s === "1440" || s === "1d" || /day/.test(s)) return "1d";
    const m = s.match(/(\d+)\s*m(in)?/);
    if (m) return m[1] + "m";
    if (/^\d+$/.test(s)) return s + "m";
    return s;
  }
  function shouldSendOnce(tf, side, entry) {
    const entryRounded = entry != null ? Math.round(Number(entry) * 100) / 100 : "NA";
    const key = `${tf}|${side}|${entryRounded}`;
    const now = Date.now();
    const prev = lastSent.get(key);
    if (prev && now - prev < DEDUP_TTL_MS) return false;
    // Clean older keys for same tf/side
    for (const k of Array.from(lastSent.keys())) {
      if (k.startsWith(`${tf}|${side}|`)) lastSent.delete(k);
    }
    lastSent.set(key, now);
    return true;
  }

  // ---------- parse from TEXT (Arabic/English) ----------
  function parseFromText(text) {
    const t = (text || "").trim();
    if (!t) return null;
    // ignore non-real
    if (/لا توجد نصيحة/.test(t) || /مرفوض/.test(t) || /حيادي/.test(t) || /neutral/i.test(t)) return null;

    // side
    let side = null;
    const mSideAr = t.match(/الإشارة\s*:\s*(شراء|بيع)/);
    if (mSideAr) side = (mSideAr[1] === "شراء" ? "BUY" : "SELL");
    if (!side) {
      const mSideEn = t.match(/\b(BUY|SELL)\b/i);
      if (mSideEn) side = mSideEn[1].toUpperCase();
    }
    if (!side) return null;

    // entry
    let entry = null;
    const mEntryAr = t.match(/سعر(?:\s*الدخول)?\s*[:：]\s*([\d.]+)/);
    if (mEntryAr) entry = toNumber(mEntryAr[1]);
    if (entry == null) {
      const mEntryEn = t.match(/\b(?:entry|entry\s*price)\s*[:：]\s*([\d.]+)/i);
      if (mEntryEn) entry = toNumber(mEntryEn[1]);
    }

    // TP1 / TP2
    let tp1 = null, tp2 = null;
    const mTP1a = t.match(/(?:TP1|TP\s*1|الهدف\s*1)\s*[:：]\s*([\d.]+)/i);
    if (mTP1a) tp1 = toNumber(mTP1a[1]);
    const mTP2a = t.match(/(?:TP2|TP\s*2|الهدف\s*2)\s*[:：]\s*([\d.]+)/i);
    if (mTP2a) tp2 = toNumber(mTP2a[1]);

    // SL
    let sl = null;
    const mSLar = t.match(/(?:SL|وقف(?:\s*الخسارة)?)\s*[:：]\s*([\d.]+)/i);
    if (mSLar) sl = toNumber(mSLar[1]);
    if (sl == null) {
      const mSLen = t.match(/(?:stop\s*loss)\s*[:：]\s*([\d.]+)/i);
      if (mSLen) sl = toNumber(mSLen[1]);
    }

    // TF
    let tf = "";
    const mTFar = t.match(/(?:الإطار|TF)\s*[:：]\s*([^\n]+)/);
    if (mTFar) tf = canonTF(mTFar[1]);
    else tf = canonTF("");

    // live price (fallback)
    const live = (typeof window !== "undefined" ? (window.lastLivePrice ?? window.__livePrice ?? null) : null);
    const price = entry != null ? entry : (toNumber(live));

    return { side, tf, entry, tp1, tp2, sl, price, filtersRejected: false };
  }

  // ---------- send ----------
  async function sendToWorker(payload) {
    try {
      await fetch(WORKER_URL + "/alert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (window?.console) console.log("[GS] sent:", payload);
    } catch (e) {
      if (window?.console) console.warn("[GS] send failed:", e);
    }
  }

  // ---------- public API ----------
  /**
   * Accepts:
   *  - String text (Arabic/English advice text)
   *  - Object { side, tf, entry, tp1, tp2, sl, price, filtersRejected }
   */
  window.gsNotifyIfRealSignal = function (advice) {
    let data = null;
    if (typeof advice === "string") {
      data = parseFromText(advice);
    } else if (advice && typeof advice === "object") {
      // Coalesce from object keys (whatever is available)
      const side = (String(advice.side || "").toUpperCase());
      if (side !== "BUY" && side !== "SELL") return; // only real
      if (advice.filtersRejected === true) return;    // skip rejected
      data = {
        side,
        tf: canonTF(coalesce(advice.tf, advice.timeframe, advice.TF, window?.currentTF)),
        entry: toNumber(coalesce(advice.entry, advice.entryPrice, advice.entry_point)),
        tp1: toNumber(coalesce(advice.tp1, advice.takeProfit1)),
        tp2: toNumber(coalesce(advice.tp2, advice.takeProfit2)),
        sl:  toNumber(coalesce(advice.sl, advice.stopLoss)),
        price: toNumber(coalesce(advice.price, window?.lastLivePrice, window?.__livePrice)),
        filtersRejected: false
      };
    }
    if (!data) return;

    // de-dup
    const key = `${data.tf}|${data.side}|${data.entry != null ? Math.round(data.entry*100)/100 : "NA"}`;
    const now = Date.now();
    const prev = lastSent.get(key);
    if (prev && now - prev < DEDUP_TTL_MS) return; // recent same signal
    // clean same tf/side
    for (const k of Array.from(lastSent.keys())) {
      if (k.startsWith(`${data.tf}|${data.side}|`)) lastSent.delete(k);
    }
    lastSent.set(key, now);

    sendToWorker(data);
  };

  // ---------- auto observe advice box ----------
  try {
    const target =
      (typeof elAdviceText !== "undefined" && elAdviceText) ||
      document.getElementById("adviceText") ||
      document.querySelector(".advice-text, #advice");

    if (target && typeof MutationObserver !== "undefined") {
      const mo = new MutationObserver(() => {
        const txt = (target.textContent || "").trim();
        window.gsNotifyIfRealSignal(txt);
      });
      mo.observe(target, { childList: true, subtree: true, characterData: true });
      // initial check
      const initTxt = (target.textContent || "").trim();
      if (initTxt) window.gsNotifyIfRealSignal(initTxt);
    }
  } catch (e) {
    if (window?.console) console.warn("[GS] observer failed:", e);
  }
})();
