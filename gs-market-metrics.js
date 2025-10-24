/* gs-market-metrics-final2.js — top-only BB/ATR + robust ATR + UI sync */
(function () {
  const W = window;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const fmt = v => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(2));
  function sma(arr, p){ if (!arr || arr.length < p) return null; let s = 0; for (let i = arr.length - p; i < arr.length; i++) s += arr[i]; return s / p; }
  function stdev(arr, p){ if (!arr || arr.length < p) return null; const m = sma(arr, p); let s = 0; for (let i = arr.length - p; i < arr.length; i++){ const d = arr[i]-m; s += d*d; } return Math.sqrt(s / p); }
  function calcBBPct(candles, period = 20, std = 2){
    if (!candles || candles.length < period + 1) return { bbPct: null, band: null };
    const closes = candles.map(c => c.c ?? c.close ?? c[4]);
    const mean = sma(closes, period);
    const sd   = stdev(closes, period);
    if (mean == null || sd == null) return { bbPct: null, band: null };
    const upper = mean + std * sd, lower = mean - std * sd;
    const lastC = closes[closes.length - 1], width = upper - lower;
    if (!(width > 0)) return { bbPct: null, band: { lower, mean, upper } };
    let bbPct = ((lastC - lower) / width) * 100; bbPct = Math.min(100, Math.max(0, bbPct));
    return { bbPct, band: { lower, mean, upper } };
  }
  function calcATRpct(candles, period = 14){
    if (!candles || candles.length < 3) return null;
    const H = c => c.h ?? c.high ?? c[2], L = c => c.l ?? c.low  ?? c[3], C = c => c.c ?? c.close ?? c[4];
    const trs = []; for (let i = 1; i < candles.length; i++){ const cur = candles[i], prev = candles[i-1];
      const tr = Math.max(H(cur)-L(cur), Math.abs(H(cur)-C(prev)), Math.abs(L(cur)-C(prev))); trs.push(tr); }
    if (!trs.length) return null;
    const p = Math.min(period, trs.length); let sum = 0; for (let i = trs.length - p; i < trs.length; i++) sum += trs[i];
    const atr = sum / p; const lastClose = C(candles[candles.length - 1]); if (!(lastClose > 0)) return 0;
    return (atr / lastClose) * 100;
  }
  function classify(bbp, atrp){ if (atrp == null || bbp == null) return "unknown"; if (atrp < 0.25 && bbp > 35 && bbp < 65) return "range"; return "trend"; }
  function renderLine({ mode, bbPct, atrPct }){
    let el = document.getElementById("gsMarketMetricsLine");
    if (!el){ el = document.createElement("div"); el.id = "gsMarketMetricsLine"; el.className = "muted";
      const mount = document.querySelector("header .wrap") || document.body; mount.insertBefore(el, mount.firstChild || null); }
    const modeTxt = mode === "trend" ? "trend" : mode === "range" ? "range" : "unknown";
    el.textContent = `حالة السوق: ${modeTxt} • BB%: ${fmt(bbPct)} • ATR%: ${fmt(atrPct)}`;
    document.querySelectorAll(".hint-stats, .bbatr-inline").forEach(n => n.remove());
  }
  function pushToState(bbPct, atrPct, mode){
    try { const gs = (W.gs = W.gs || {}); gs.market = Object.assign(gs.market || {}, { bbPct, atrPct, mode }); } catch {}
    W.dispatchEvent(new CustomEvent("gs:market:metrics", { detail: { mode, bbPct, atrPct, bbPerc: bbPct, atrPerc: atrPct } }));
  }
  function grabCandles(){ const g = W.gs || W.GS || {}; return g.candles || g.data || g.series || W.__gsCandles || null; }
  function update(candles){ const { bbPct } = calcBBPct(candles); const atrPct = calcATRpct(candles); const mode = classify(bbPct, atrPct); pushToState(bbPct, atrPct, mode); renderLine({ mode, bbPct, atrPct }); }
  W.addEventListener("gs:candles:updated", e => update(e.detail?.candles || grabCandles()));
  W.addEventListener("gs:state:changed",   () => update(grabCandles()));
  setTimeout(() => update(grabCandles()), 300);
  setTimeout(() => update(grabCandles()), 1200);
})();
