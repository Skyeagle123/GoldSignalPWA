/* gs-market-metrics.js — patched: uses __seriesForExport + dual events + safe render */
(function () {
  const W = window;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const fmt  = v => (v == null || Number.isNaN(v)) ? "—" : Number(v).toFixed(2);

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
    bbPct = Math.max(0, Math.min(100, bbPct));
    return { bbPct, band: { lower, mean, upper } };
  }
  function calcATRpct(candles, period = 14) {
    if (!candles || candles.length < period + 1) return null;
    const H = c => c.h ?? c.high ?? c[2];
    const L = c => c.l ?? c.low  ?? c[3];
    const C = c => c.c ?? c.close ?? c[4];
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
      const cur = candles[i], prev = candles[i - 1];
      trs.push(Math.max(H(cur) - L(cur), Math.abs(H(cur) - C(prev)), Math.abs(L(cur) - C(prev))));
    }
    if (trs.length < period) return null;
    const recent = trs.slice(-period);
    const atr = recent.reduce((a,b)=>a+b,0) / period;
    const lastClose = (candles[candles.length - 1].c ?? candles[candles.length - 1][4]);
    if (!(lastClose > 0)) return null;
    return (atr / lastClose) * 100;
  }

  function classify(bbp, atrp) {
    if (bbp == null || atrp == null) return "unknown";
    if (atrp < 0.25 && bbp > 35 && bbp < 65) return "range";
    return "trend";
  }

  function grabCandles() {
    if (Array.isArray(W.__seriesForExport) && W.__seriesForExport.length > 10) return W.__seriesForExport;
    const g = W.gs || W.GS || {};
    return g.candles || g.data || g.series || W.__gsCandles || null;
  }

  function ensureHost() {
    const card = document.querySelector('[data-gs="market-state-row"]') || document.querySelector('main .card');
    if (!card) return null;
    let el = card.querySelector('#marketMetricsLine');
    if (!el) {
      el = document.createElement('div');
      el.id = 'marketMetricsLine';
      el.className = 'hint';
      el.style.marginTop = '6px';
      card.appendChild(el);
    }
    return el;
  }
  function renderLine({ mode, bbPct, atrPct }) {
    const host = ensureHost();
    if (!host) return;
    const modeAr = mode === 'trend' ? 'ترند' : mode === 'range' ? 'نطاق' : 'غير معلوم';
    host.textContent = `حالة السوق: ${modeAr} • BB%: ${typeof bbPct==='number'?bbPct.toFixed(2):'—'} • ATR%: ${typeof atrPct==='number'?atrPct.toFixed(2):'—'}`;
    const bbChip = document.getElementById('indBB');
    if (bbChip) bbChip.textContent = typeof bbPct==='number'?bbPct.toFixed(2):'—';
  }

  function pushEvents(bbPct, atrPct) {
    try {
      if (typeof W.gsSet === "function") {
        if (bbPct != null) W.gsSet("market.bbPct", +Number(bbPct).toFixed(2));
        if (atrPct != null) W.gsSet("market.atrPct", +Number(atrPct).toFixed(2));
      }
      const detail = { bbPct, atrPct, bbPerc: bbPct, atrPerc: atrPct };
      W.dispatchEvent(new CustomEvent("gs:market:metrics", { detail }));
      W.dispatchEvent(new CustomEvent("gs:state-metrics",  { detail }));
    } catch {}
  }

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