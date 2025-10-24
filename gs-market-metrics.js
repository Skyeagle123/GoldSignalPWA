/* gs-market-metrics.js — uses __seriesForExport + robust ATR + dual events + inline render */
(function () {
  const W = window;
  const fmt = v => (v == null || Number.isNaN(v)) ? "—" : Number(v).toFixed(2);

  // ---------- math helpers ----------
  function sma(arr, p) {
    if (!arr || arr.length < p) return null;
    let s = 0;
    for (let i = arr.length - p; i < arr.length; i++) s += arr[i];
    return s / p;
  }
  function stdev(arr, p) {
    if (!arr || arr.length < p) return null;
    const m = sma(arr, p);
    let s = 0;
    for (let i = arr.length - p; i < arr.length; i++) { const d = arr[i] - m; s += d * d; }
    return Math.sqrt(s / p);
  }

  // ---------- BB% ----------
  function calcBBPct(candles, period = 20, std = 2) {
    if (!candles || candles.length < period + 1) return { bbPct: null, band: null };
    const closes = candles.map(c => c.c ?? c.close ?? c[4]);
    const mean = sma(closes, period);
    const sd   = stdev(closes, period);
    if (mean == null || sd == null) return { bbPct: null, band: null };
    const upper = mean + std * sd;
    const lower = mean - std * sd;
    const lastC = closes[closes.length - 1];
    const width = upper - lower;
    if (!(width > 0)) return { bbPct: null, band: { lower, mean, upper } };
    let bbPct = ((lastC - lower) / width) * 100;
    bbPct = Math.max(0, Math.min(100, bbPct));
    return { bbPct, band: { lower, mean, upper } };
  }

  // ---------- ATR% (robust fallback) ----------
  function calcATRpct(candles, period = 14) {
    if (!candles || candles.length < period + 1) return null;
    const H = c => (c.h ?? c.high ?? c[2] ?? c.c ?? c.close ?? c[4]);
    const L = c => (c.l ?? c.low  ?? c[3] ?? c.c ?? c.close ?? c[4]);
    const C = c => (c.c ?? c.close ?? c[4] ?? c.o ?? c.open ?? c[1]);

    const trs = [];
    for (let i = 1; i < candles.length; i++) {
      const cur  = candles[i];
      const prev = candles[i - 1];
      const h = Number(H(cur)), l = Number(L(cur)), cp = Number(C(prev));
      if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(cp)) continue;

      const tr = Math.max(
        h - l,                // intra-bar range
        Math.abs(h - cp),     // gap up
        Math.abs(l - cp)      // gap down
      );
      trs.push(tr);
    }
    if (trs.length < period) return null;

    const atr = trs.slice(-period).reduce((a, b) => a + b, 0) / period;
    const last = Number(C(candles[candles.length - 1]));
    return (Number.isFinite(last) && last > 0) ? (atr / last) * 100 : null;
  }

  // ---------- classify ----------
  function classify(bbp, atrp) {
    if (bbp == null || atrp == null) return "unknown";
    if (atrp < 0.25 && bbp > 35 && bbp < 65) return "range";
    return "trend";
  }

  // ---------- candles source ----------
  function grabCandles() {
    // المكان الحقيقي بملفاتك
    if (Array.isArray(W.__seriesForExport) && W.__seriesForExport.length > 10) return W.__seriesForExport;
    const g = W.gs || W.GS || {};
    return g.candles || g.data || g.series || W.__gsCandles || null;
  }

  // ---------- inline render (inside settings card only) ----------
  function ensureInlineHost() {
    const card = document.querySelector('[data-gs="market-state-row"]');
    if (!card) return null;
    let inline = document.getElementById('mktStatsInline');
    if (!inline) {
      inline = document.createElement('div');
      inline.id = 'mktStatsInline';
      inline.className = 'hint';
      inline.style.margin = '6px 0';
      const tabs = card.querySelector('.tabs');
      (tabs && tabs.parentNode)
        ? tabs.parentNode.insertBefore(inline, tabs)   // قبل التابات
        : card.insertBefore(inline, card.firstChild);  // أعلى البطاقة
    }
    return inline;
  }
  function renderLine({ mode, bbPct, atrPct }) {
    const host = ensureInlineHost();
    if (!host) return;
    const modeAr = mode === 'trend' ? 'ترند' : mode === 'range' ? 'نطاق' : 'غير معلوم';
    host.textContent = `حالة السوق: ${modeAr} • BB%: ${fmt(bbPct)} • ATR%: ${fmt(atrPct)}`;

    // حدّث شارة BB ضمن قسم "المؤشرات" إن وجدت
    const bbChip = document.getElementById('indBB');
    if (bbChip) bbChip.textContent = fmt(bbPct);
  }

  // ---------- events ----------
  function pushEvents(bbPct, atrPct) {
    try {
      if (typeof W.gsSet === "function") {
        if (bbPct != null) W.gsSet("market.bbPct", +Number(bbPct).toFixed(2));
        if (atrPct != null) W.gsSet("market.atrPct", +Number(atrPct).toFixed(2));
      }
      // أرسل الاسمين للتوافق مع أي UI
      const detail = { bbPct, atrPct, bbPerc: bbPct, atrPerc: atrPct };
      W.dispatchEvent(new CustomEvent("gs:market:metrics", { detail }));
      W.dispatchEvent(new CustomEvent("gs:state-metrics",  { detail }));
    } catch {}
  }

  // ---------- main ----------
  function update(candles) {
    if (!Array.isArray(candles) || candles.length < 21) return;
    const { bbPct } = calcBBPct(candles);
    const atrPct    = calcATRpct(candles);
    const mode      = classify(bbPct, atrPct);
    pushEvents(bbPct, atrPct);
    renderLine({ mode, bbPct, atrPct });
  }

  W.addEventListener("gs:candles:updated", e => update(e.detail?.candles || grabCandles()));
  W.addEventListener("gs:state:changed",   () => update(grabCandles()));
  setTimeout(() => update(grabCandles()), 600);
})();
