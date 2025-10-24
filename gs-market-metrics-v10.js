/* gs-market-metrics.js v4 - self-contained BB% & ATR% with safe fallbacks */
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
    // 0..100 داخل القناة (نسمح ببعض الخروج ثم نُثبت)
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
    // SMA على TR
    let sum = 0;
    for (let i = trs.length - period; i < trs.length; i++) sum += trs[i];
    const atr = sum / period;
    const lastClose = C(candles[candles.length - 1]);
    if (!(lastClose > 0)) return null;
    return (atr / lastClose) * 100;
  }

  function classify(bbp, atrp) {
    if (bbp == null || atrp == null) return "unknown";
    // قواعد بسيطة قابلة للتعديل:
    // ATR% منخفض + BB% داخل الوسط => range، غير هيك => trend
    if (atrp < 0.25 && bbp > 35 && bbp < 65) return "range";
    return "trend";
  }

  function renderLine({ mode, bbPct, atrPct, band }) {
    // ابحث عن مكان السطر أو أنشئه إن لم يوجد
    let el = document.getElementById("gsMarketMetricsLine");
    if (!el) {
      el = document.createElement("div");
      el.id = "gsMarketMetricsLine";
      el.className = "muted";
      // نضعه فوق بلوك Auto indicators (مثل ما ظهر عندك)
      const anchor =
        document.querySelector("h3,h2,.muted") ||
        document.querySelector("#gsPanel") ||
        document.querySelector("main");
      (anchor && anchor.parentNode)
        ? anchor.parentNode.insertBefore(el, anchor.nextSibling)
        : document.body.appendChild(el);
    }
    const bbTxt  = `BB%: ${fmt(bbPct)}`;
    const atrTxt = `ATR%: ${fmt(atrPct)}`;
    const modeAr = mode === "trend" ? "trend" :
                   mode === "range" ? "range" : "unknown (0)";
    // إذا بدك تعرض حدود البولنجر كمان:
    // const bandTxt = band ? ` • BB: ${fmt(band.lower)} / ${fmt(band.mean)} / ${fmt(band.upper)}` : "";
    el.textContent = `حالة السوق: ${modeAr} • ${bbTxt} • ${atrTxt}`;
  }

  function pushToState(bbPct, atrPct) {
    try {
      // إن وُجد gsSet استعمله (لا نكسر شيء)
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
    const { bbPct, band } = calcBBPct(candles);
    const atrPct = calcATRpct(candles);
    const mode   = classify(bbPct, atrPct);
    pushToState(bbPct, atrPct);
    renderLine({ mode, bbPct, atrPct, band });
  }

  // حاول جلب الشموع من أكثر من مكان معروف
  function grabCandles() {
    const g = W.gs || W.GS || {};
    return g.candles || g.data || g.series || W.__gsCandles || null;
  }

  // اشترك بالأحداث الشائعة في مشروعك
  W.addEventListener("gs:candles:updated", e => update(e.detail?.candles || grabCandles()));
  W.addEventListener("gs:state:changed",   () => update(grabCandles()));
  // تشغيل أولي متأخر قليلاً
  setTimeout(() => update(grabCandles()), 600);
})();
