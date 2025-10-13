/* ==============================================================
   Mobile Debug (self-contained)
   - Auto-creates DBG button & panel if missing
   - Live widget at TOP with direction arrow ↑/↓/→
   - Uses window.__liveAgeOkMs (default 5000 ms)
   - Refresh every 1s
   ============================================================== */
(function () {
  // ---- Ensure button & panel exist ----
  function ensureUI() {
    let btn = document.getElementById("dbgBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "dbgBtn";
      btn.textContent = "DBG";
      btn.style.cssText =
        "position:fixed;bottom:20px;right:20px;z-index:9999;background:#007aff;color:#fff;padding:10px 14px;border:none;border-radius:50%;font-weight:700;box-shadow:0 0 10px rgba(0,0,0,0.3);";
      document.body.appendChild(btn);
    }
    let panel = document.getElementById("mobile-debug");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "mobile-debug";
      panel.style.cssText =
        "display:none;position:fixed;bottom:80px;right:20px;width:290px;max-height:80vh;overflow:auto;background:rgba(20,22,30,0.98);color:#fff;font-size:13px;padding:10px;border-radius:12px;box-shadow:0 0 12px rgba(0,0,0,0.4);z-index:9999;";
      document.body.appendChild(panel);
    }
    // Toggle
    btn.onclick = function () {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    };
    return panel;
  }

  // Keep previous live price to infer direction
  if (typeof window.__mdPrevLivePrice === "undefined")
    window.__mdPrevLivePrice = null;

  // ---- Take a snapshot of runtime state ----
  function snapshot() {
    const st = {};
    try {
      // Counters / meta (fallbacks if not present)
      st.csvRows = Number.isFinite(window.__csvRows) ? window.__csvRows : 0;
      st.lastBar = window.__lastBarTime || "—";
      st.autoChecked = !!window.__autoChecked;

      // Indicators current state
      st.useRSI = !!window.USE_RSI;
      st.useMACD = !!window.USE_MACD;
      st.useEMA_TREND = !!window.USE_EMA_TREND;
      st.useSTOCH = !!window.USE_STOCH;
      st.useBB = !!window.USE_BB;

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

      // OK/bad threshold
      st.liveAgeOkMs =
        typeof window.__liveAgeOkMs === "number" && isFinite(window.__liveAgeOkMs)
          ? window.__liveAgeOkMs
          : 5000;

      // Direction arrow
      const prev = window.__mdPrevLivePrice;
      let dir = "→",
        dirColor = "#cfcfcf";
      if (
        typeof st.livePrice === "number" &&
        isFinite(st.livePrice) &&
        typeof prev === "number" &&
        isFinite(prev)
      ) {
        if (st.livePrice > prev) {
          dir = "↑";
          dirColor = "#7bd88f"; // up - green
        } else if (st.livePrice < prev) {
          dir = "↓";
          dirColor = "#ff8989"; // down - red
        }
      }
      st.liveDir = dir;
      st.liveDirColor = dirColor;

      if (typeof st.livePrice === "number" && isFinite(st.livePrice)) {
        window.__mdPrevLivePrice = st.livePrice;
      }
    } catch (e) {}
    window.__mdSnapshot = st;
    return st;
  }

  // ---- Render panel ----
  function render(st) {
    const panel = ensureUI();
    const ageOk =
      st.liveAgeMs != null && isFinite(st.liveAgeMs) && st.liveAgeMs < st.liveAgeOkMs;
    const liveAgeTxt =
      st.liveAgeMs != null && isFinite(st.liveAgeMs)
        ? Math.round(st.liveAgeMs) + " ms"
        : "—";
    const livePriceTxt =
      typeof st.livePrice === "number" && isFinite(st.livePrice)
        ? st.livePrice.toFixed(2)
        : "—";

    const boxStyle =
      "border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:10px;margin-bottom:8px;font-size:12px;";
    const titleStyle = "opacity:.7;margin-bottom:6px;font-weight:600;";

    let html = `
      <div class="livebox" style="${boxStyle}">
        <div style="${titleStyle}">Live</div>
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

      <div class="statebox" style="${boxStyle}">
        <div style="${titleStyle}">Summary</div>
        <div><b>${st.csvRows || 0}</b> CSV rows</div>
        <div>${st.lastBar || "—"} Last bar (local)</div>
        <div>${st.autoChecked ? "true" : "false"} Auto checked</div>
      </div>

      <div class="flagsbox" style="${boxStyle}">
        <div style="${titleStyle}">State</div>
        <div>${st.useRSI} USE_RSI</div>
        <div>${st.useMACD} USE_MACD</div>
        <div>${st.useEMA_TREND} USE_EMA_TREND</div>
        <div>${st.useSTOCH} USE_STOCH</div>
        <div>${st.useBB} USE_BB</div>
      </div>
    `;
    panel.innerHTML = html;
  }

  // ---- Tick ----
  function tick() {
    const st = snapshot();
    render(st);
  }

  // Start
  window.addEventListener("load", function () {
    ensureUI();
    tick();
    setInterval(tick, 1000);
  });
})();
