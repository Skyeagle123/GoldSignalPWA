/* ============================================================
   gs-worker-bridge.js (Safe Targets & Telegram Message Builder)
   - Unifies alert distance (Fixed vs %ATR) from UI
   - Robust number parsing (comma/point)
   - Clamps insane TP2 via ATR
   - TP1/TP2 as ABSOLUTE PRICES (not offsets)
   - Exposes helpers on window (drop-in / append-safe)
   ============================================================ */
(function(){
  const g = (typeof window !== 'undefined') ? window : globalThis;

  /* ---------------- helpers ---------------- */
  function toNum(v) {
    if (typeof v === 'number') return v;
    if (v == null) return NaN;
    return parseFloat(String(v).trim().replace(',', '.'));
  }
  function round2(v) {
    const n = toNum(v);
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
  function fmt2(v) {
    const n = round2(v);
    return Number.isFinite(n) ? n.toFixed(2) : '—';
  }

  /* Get current ATR value from the series shown on chart */
  function getAtrNowSafe() {
    try {
      const s = g.__lastSeriesForChart || g.__lastSeries || [];
      const period = g.ATR_PERIOD || 14;
      if (s && s.length && typeof g.atr === 'function') {
        const arr = g.atr(s, period);
        if (arr && arr.length) return toNum(arr[arr.length - 1]);
      }
    } catch(_) {}
    return NaN;
  }

  /* Unified alert distance (Fixed vs %ATR) from UI */
  function getAlertDistanceSafe() {
    const elFixed  = (typeof document !== 'undefined') &&
                     (document.getElementById('alertFixedVal') || document.getElementById('alertDistance'));
    const elPct    = (typeof document !== 'undefined') && document.getElementById('alertAtrPct');
    const useAtr   = (typeof document !== 'undefined') &&
                      ((document.getElementById('alertModeAtr') || {}).checked === true);

    const fixed = toNum(elFixed && elFixed.value || 0.5);
    const pct   = Math.max(0, toNum(elPct && elPct.value || 25));
    const atrNow = getAtrNowSafe();

    let dist = useAtr && Number.isFinite(atrNow) ? atrNow * (pct / 100) : fixed;

    // safety rails
    if (!Number.isFinite(dist) || dist <= 0) dist = 0.5;
    if (Number.isFinite(atrNow)) {
      // لا تزيد عن 5×ATR كمسافة
      dist = Math.min(dist, atrNow * 5);
    }
    return round2(dist);
  }

  /* Compute absolute TP1/TP2/SL from entry+side */
  function computeTargets(entryPrice, side, opts = {}) {
    const entry = toNum(entryPrice);
    const dist  = Number.isFinite(toNum(opts.distance)) ? toNum(opts.distance) : getAlertDistanceSafe();
    const mult2 = Number.isFinite(toNum(opts.tp2Mult)) ? toNum(opts.tp2Mult) : (g.TP2_MULT || 1.7);

    if (!Number.isFinite(entry)) throw new Error('Entry price not finite');

    const dir = (String(side).toUpperCase() === 'BUY') ? +1 : -1;

    const tp1 = entry + dir * dist;
    let   tp2 = entry + dir * (dist * mult2);
    const sl  = entry - dir * dist;

    // Clamp TP2 via ATR
    const atrNow = getAtrNowSafe();
    if (Number.isFinite(atrNow)) {
      const maxOffset = atrNow * 5;
      const off = Math.abs(tp2 - entry);
      if (off > maxOffset) tp2 = entry + dir * maxOffset;
    }

    return {
      entry: round2(entry),
      tp1  : round2(tp1),   // ABSOLUTE price
      tp2  : round2(tp2),   // ABSOLUTE price
      sl   : round2(sl),    // ABSOLUTE price
      dist : round2(dist)   // distance used
    };
  }

  /* Build Telegram message (TP1/TP2 ABSOLUTE) */
  function makeSignalMessage({ side, tfLabel, entryPrice, distance, tp2Mult }) {
    const sideUp = String(side).toUpperCase();
    const t = computeTargets(entryPrice, sideUp, { distance, tp2Mult });

    return (
      `🔔 GoldSignals\n` +
      `Side: ${sideUp}\n` +
      `TF: ${tfLabel}\n` +
      `Entry: ${fmt2(t.entry)}\n` +
      `TP1: ${fmt2(t.tp1)}\n` +     // ABSOLUTE price
      `TP2: ${fmt2(t.tp2)}\n` +     // ABSOLUTE price
      `SL: ${fmt2(t.sl)}\n`
    );
  }

  /* Optional sender wrapper (uses existing global if present) */
  function sendToTelegramWrapped(args) {
    const msg = makeSignalMessage(args);
    if (typeof g.sendSignalToTelegram === 'function') {
      return g.sendSignalToTelegram(msg);
    }
    if (g.TELEGRAM_WEBHOOK_URL) {
      try {
        fetch(g.TELEGRAM_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: msg })
        });
      } catch (_) {}
    }
    return msg; // return for logs if no sender
  }

  /* Expose */
  g.gsGetAlertDistanceSafe = getAlertDistanceSafe;
  g.gsComputeTargets       = computeTargets;
  g.gsMakeTelegramMessage  = makeSignalMessage;
  g.gsSendSignalSafe       = sendToTelegramWrapped;

  /* --- Integration hint ---
     استدعِ الصياغة/الإرسال هك:
     const msg = window.gsMakeTelegramMessage({
       side: currentSide,           // 'BUY' | 'SELL'
       tfLabel: currentTfLabel,     // e.g. '30m'
       entryPrice: currentEntry     // سعر الدخول
       // distance: optional override,
       // tp2Mult : optional override
     });
     window.gsSendSignalSafe({
       side: currentSide,
       tfLabel: currentTfLabel,
       entryPrice: currentEntry
     });
  ------------------------------------------------------------- */
})();
