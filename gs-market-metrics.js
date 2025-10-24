/* gs-market-metrics.js v5.1 — safe render inside settings card (no body-prepend) */
(function () {
  const W = window;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const fmt = v => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(2));

  // --- helpers: SMA, STDEV, ATR ---
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
    for (let i = arr.length - p; i < arr.length; i++) {
      const d = arr[i] - m; s += d * d;
    }
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
      const tr = Math.max(
        H(cur) - L(cur),
        Math.abs(H(cur) - C(prev)),
        Math.abs(L(cur) - C(prev))
      );
      trs.push(tr);
    }
    if (trs.length < period) return null;
    let sum = 0;
    for (let i = trs.length - period; i < trs.length; i++) sum += trs[i];
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

  // ✅ ارسم داخل بطاقة الإعدادات فقط (ولا تلمس <body> مباشرة)
  function renderLine({ mode, bbPct, atrPct }) {
    // ابحث عن البطاقة
    const card = document.querySelector('[data-gs="market-state-row"]') || document.querySelector('main .card');
    if (!card) return;

    // عنصر السطر
    let el = card.querySelector('#marketMetricsLine');
    if (!el) {
      el = document.createElement('div');
      el.id = 'marketMetricsLine';
      el.className = 'hint';
      el.style.marginTop = '8px';
      card.appendChild(el);
    }

    const modeAr = mode === 'trend' ? 'ترند' : mode === 'range' ? 'نطاق' : 'غير معلوم';
    const bbTxt  = `BB%: ${fmt(bbPct)}`;
    const atrTxt = `ATR%: ${fmt(atrPct)}`;
    el.textContent = `حالة السوق: ${modeAr} • ${bbTxt} • ${atrTxt}`;
  }

  function pushToState(bbPct, atrPct) {
    try {
      if (typeof W.gsSet === "function") {
        if (bbPct != null) W.gsSet("market.bbPct", +bbPct.toFixed(2));
        if (atrPct != null) W.gsSet("market.atrPct", +atrPct.toFixed(2));
      }
      W.dispatchEvent(new CustomEvent("gs:market:metrics", {
        detail: { bbPct, atrPct }
      }));
    } catch {}
  }

  function update(candles) {
    const { bbPct } = calcBBPct(candles);
    const atrPct    = calcATRpct(candles);
    const mode      = classify(bbPct, atrPct);
    pushToState(bbPct, atrPct);
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
