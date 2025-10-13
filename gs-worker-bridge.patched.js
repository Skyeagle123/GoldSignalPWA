/* ============================================================
   gs-worker-bridge.js (Safe Targets & Telegram Message Builder)
   - Unifies alert distance (Fixed vs %ATR) from UI
   - Robust number parsing (comma/point)
   - Clamps insane TP2 via ATR
   - TP1/TP2/SL as ABSOLUTE PRICES (not offsets)
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

    const fixed  = toNum(elFixed && elFixed.value || 0.5);
    const pct    = Math.max(0, toNum(elPct && elPct.value || 25));
    const atrNow = getAtrNowSafe();

    let dist = useAtr && Number.isFinite(atrNow) ? atrNow * (pct / 100) : fixed;

    // safety rails
    if (!Number.isFinite(dist) || dist <= 0) dist = 0.5;
    if (Number.isFinite(atrNow)) {
      // لا تزيد عن 5×ATR كمسافة معقولة
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
      entry: round2(entry),  // ABSOLUTE
      tp1  : round2(tp1),    // ABSOLUTE
      tp2  : round2(tp2),    // ABSOLUTE
      sl   : round2(sl),     // ABSOLUTE
      dist : round2(dist)
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
      `TP1: ${fmt2(t.tp1)}\n` +     // أسعار كاملة
      `TP2: ${fmt2(t.tp2)}\n` +     // أسعار كاملة
      `SL: ${fmt2(t.sl)}\n`
    );
  }

  /* Sender wrapper
     - لو عندك sendSignalToTelegram بيستخدمه
     - إذا TELEGRAM_WEBHOOK_URL موجود: يرسل النص + الحقول البنيوية (ABS)
  */
  function sendToTelegramWrapped(args) {
    const sideUp = String(args.side).toUpperCase();
    const t = computeTargets(args.entryPrice, sideUp, { distance: args.distance, tp2Mult: args.tp2Mult });
    const msg = (
      `🔔 GoldSignals\n` +
      `Side: ${sideUp}\n` +
      `TF: ${args.tfLabel}\n` +
      `Entry: ${fmt2(t.entry)}\n` +
      `TP1: ${fmt2(t.tp1)}\n` +
      `TP2: ${fmt2(t.tp2)}\n` +
      `SL: ${fmt2(t.sl)}\n`
    );

    if (typeof g.sendSignalToTelegram === 'function') {
      // مرر أيضًا الأرقام جاهزة لو حاب تستفيد منها بالمرسل الداخلي
      return g.sendSignalToTelegram(msg, t);
    }
    if (g.TELEGRAM_WEBHOOK_URL) {
      try {
        return fetch(g.TELEGRAM_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: msg,
            // payload البنيوي (مفيد لو الـ worker يعتمد الحقول)
            side: sideUp,
            tfLabel: args.tfLabel,
            entry: t.entry,
            tp1:   t.tp1,
            tp2:   t.tp2,
            sl:    t.sl,
            priceMode: 'abs'
          })
        });
      } catch (_) {}
    }
    // fallback: اطبعها للّوغ
    console.log('[TG message ready]\\n' + msg);
    return msg;
  }

  /* Expose */
  g.gsGetAlertDistanceSafe = getAlertDistanceSafe;
  g.gsComputeTargets       = computeTargets;
  g.gsMakeTelegramMessage  = makeSignalMessage;
  g.gsSendSignalSafe       = sendToTelegramWrapped;

  /* --- Integration hint ---
     مثال استخدام:
     window.gsSendSignalSafe({
       side: currentSide,          // 'BUY' | 'SELL'
       tfLabel: currentTfLabel,    // مثال '30m'
       entryPrice: currentEntry    // سعر الدخول
       // distance: override اختياري
       // tp2Mult : override اختياري
     });
  ------------------------------------------------------------- */
})();