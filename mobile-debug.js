/* ==========================================
   Mobile Debug Panel (Updated + Price Arrow)
   - Shows Live widget at TOP of the panel
   - Direction arrow: ↑ (up), ↓ (down), → (flat)
   - Uses window.__liveAgeOkMs (default 5000 ms)
   - Refreshes every 1s
   ========================================== */
(function(){
  // Keep previous live price to infer direction
  if (typeof window.__mdPrevLivePrice === "undefined") window.__mdPrevLivePrice = null;

  function snapshot(){
    const st = {};
    try {
      // Basic stats (fallbacks if not present)
      st.csvRows = Number.isFinite(window.__csvRows) ? window.__csvRows : 0;
      st.lastBar = window.__lastBarTime || "—";
      st.autoChecked = !!window.__autoChecked;

      // Indicators state (booleans)
      st.useRSI       = !!window.USE_RSI;
      st.useMACD      = !!window.USE_MACD;
      st.useEMA_TREND = !!window.USE_EMA_TREND;
      st.useSTOCH     = !!window.USE_STOCH;
      st.useBB        = !!window.USE_BB;

      // Live data
      if (typeof window.__livePrice === "number" && isFinite(window.__livePrice)) {
        st.livePrice = window.__livePrice;
      } else {
        st.livePrice = null;
      }

      if (typeof window.__liveTimeMs === "number" && isFinite(window.__liveTimeMs)) {
        st.liveAgeMs = Date.now() - window.__liveTimeMs;
      } else {
        st.liveAgeMs = null;
      }

      // Ok/bad threshold (ms)
      st.liveAgeOkMs =
        (typeof window.__liveAgeOkMs === "number" && isFinite(window.__liveAgeOkMs))
          ? window.__liveAgeOkMs
          : 5000;

      // Direction arrow
      const prev = window.__mdPrevLivePrice;
      let dir = "→", dirColor = "#cfcfcf";
      if (typeof st.livePrice === "number" && isFinite(st.livePrice) && typeof prev === "number" && isFinite(prev)) {
        if (st.livePrice > prev) { dir = "↑"; dirColor = "#7bd88f"; }        // up (green)
        else if (st.livePrice < prev) { dir = "↓"; dirColor = "#ff8989"; }   // down (red)
      }
      st.liveDir = dir;
      st.liveDirColor = dirColor;

      // Update prev for next tick if current is valid
      if (typeof st.livePrice === "number" && isFinite(st.livePrice)) {
        window.__mdPrevLivePrice = st.livePrice;
      }
    } catch (e) { /* ignore */ }

    // Expose snapshot for any other tools
    window.__mdSnapshot = st;
    return st;
  }

  function render(st) {
    // Live widget (TOP)
    const ageOk = (st.liveAgeMs != null && isFinite(st.liveAgeMs) && st.liveAgeMs < st.liveAgeOkMs);
    const liveAgeTxt = (st.liveAgeMs != null && isFinite(st.liveAgeMs)) ? (Math.round(st.liveAgeMs) + " ms") : "—";
    const livePriceTxt = (typeof st.livePrice === "number" && isFinite(st.livePrice)) ? st.livePrice.toFixed(2) : "—";

    let html = `
      <div class="section livebox"
           style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px;margin-bottom:6px;font-size:12px;">
        <div style="opacity:.7;margin-bottom:4px;font-weight:600;">Live</div>
        <div>
          Live price:
          <b>${livePriceTxt}</b>
          <b style="margin-inline-start:6px;color:${st.liveDirColor};font-size:14px">${st.liveDir}</b>
        </div>
        <div style="color:${ageOk ? "#7bd88f" : "#ffb86b"}">
          Live age: ${liveAgeTxt} (${ageOk ? "ok" : "bad"})
        </div>
        <div>Age threshold: ${Math.round(st.liveAgeOkMs / 1000)} s</div>
      </div>
    `;

    // Basic info + state
    html += `
      <div><b>${st.csvRows || 0}</b> CSV rows</div>
      <div>${st.lastBar || "—"} Last bar (local)</div>
      <div>${st.autoChecked ? "true" : "false"} Auto checked</div>
      <br>
      <div style="font-weight:700">State</div>
      <div>${st.useRSI} USE_RSI</div>
      <div>${st.useMACD} USE_MACD</div>
      <div>${st.useEMA_TREND} USE_EMA_TREND</div>
      <div>${st.useSTOCH} USE_STOCH</div>
      <div>${st.useBB} USE_BB</div>
    `;

    const el = document.getElementById("mobile-debug");
    if (el) el.innerHTML = html;
  }

  function tick() {
    const st = snapshot();
    render(st);
  }

  // Kick off
  tick();
  setInterval(tick, 1000);
})();
