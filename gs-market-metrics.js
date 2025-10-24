/* gs-market-metrics.js v5.2 — render-safe + dual events */
(function () {
  const W = window;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const fmt  = v => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(2));

  // --- helpers ---
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
    bbPct = clamp(bbPct, 0, 100);
    return { bbPct, band: { lower, mean, upper } };
  }
  function calcATRpct(candles, period = 14) {
    if (!candles || candles.length < period + 1) return null;
    const H = c => c.h ?? c.high ?? c[2];
    const L = c => c.l ?? c.low  ?? c[3];
    const C = c => c.c ?? c.close ?? c[4];
    let trs = [];
    for (let i = 1; i < candles.length; i++) {
      const cur = candles[i], prev = candles[i - 1];
      const tr = Math.max(H(cur) - L(cur), Math.abs(H(cur) - C(prev)), Math.abs(L(cur) - C(prev)));
      trs.push(tr);
    }
    if (trs.length < period) return null;
    let sum = 0; for (let i = trs.length - period; i < trs.length; i++) sum += trs[i];
    const atr = sum / period;
    const lastClose = C(candles[candles.length - 1]);
    if (!(lastClose > 0)) return null;
    return (atr / lastClose) * 100;
  }

  function classify(bbp, atrp) {
    if (bbp == null || atrp == null) return "unknown";
    if (atrp < 0.25 && bbp > 35 && bbp < 65) return "range";
    return "trend";
  }

  // ---- rendering (no body-prepend) ----
  function renderLine({ mode, bbPct, atrPct }) {
    // 1) لو عندك عقدة جاهزة من app.js (mktStatsInline) استعملها
    let el = document.getElementById("mktStatsInline")
          || document.getElementById("marketMetricsLine");

    // 2) وإلا حطّها جوّا بطاقة الإعدادات فقط
    if (!el) {
      const card = document.querySelector('[data-gs="market-state-row"]') || document.querySelector('main .card');
      if (card) {
        el = document.createElement('div');
        el.id = 'marketMetricsLine';
        el.className = 'hint';
        el.style.marginTop = '8px';
        card.appendChild(el);
      }
    }
    if (el) {
      const modeAr = mode === 'trend' ? 'ترند' : mode === 'range' ? 'نطاق' : 'غير معلوم';
      el.textContent = `حالة السوق: ${modeAr} • BB%: ${fmt(bbPct)} • ATR%: ${fmt(atrPct)}`;
    }

    // 3) حدّث شارة BB داخل قسم "المؤشرات" إذا موجودة
    const bbChip = document.getElementById('indBB');
    if (bbChip) bbChip.textContent = fmt(bbPct);
  }

  function pushEvents(bbPct, atrPct) {
    try {
      if (typeof W.gsSet === "function") {
        if (bbPct != null) W.gsSet("market.bbPct", +Number(bbPct).toFixed(2));
        if (atrPct != null) W.gsSet("market.atrPct", +Number(atrPct).toFixed(2));
      }
      // الحدث الأصلي
      W.dispatchEvent(new CustomEvent("gs:market:metrics", { detail: { bbPct, atrPct } }));
      // الجديد: ليتوافق مع app.js الحالي
      W.dispatchEvent(new CustomEvent("gs:state-metrics",  { detail: { bbPct:bbPct, atrPct:atrPct, bbPerc:bbPct, atrPerc:atrPct } }));
    } catch {}
  }

  function update(candles) {
    const { bbPct } = calcBBPct(candles);
    const atrPct    = calcATRpct(candles);
    const mode      = classify(bbPct, atrPct);
    pushEvents(bbPct, atrPct);
    renderLine({ mode, bbPct, atrPct });
  }

  function grabCandles() {
    const g = W.gs || W.GS || {};
    return g.candles || g.data || g.series || W.__gsCandles || null;
  }

  W.addEventListener("gs:candles:updated", e => update(e.detail?.candles || grabCandles()));
  W.addEventListener("gs:state:changed",   () => update(grabCandles()));
  setTimeout(() => update(grabCandles()), 600);
})();

