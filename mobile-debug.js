/* ==============================================================
   Mobile Debug (self-contained, draggable, fullscreen)
   - Auto-creates DBG button & panel if missing
   - Live widget at TOP with direction arrow ↑/↓/→
   - Uses window.__liveAgeOkMs (default 5000 ms)
   - Refresh every 1s
   ============================================================== */
(function () {
  // keep previous live price to infer direction
  if (typeof window.__mdPrevLivePrice === "undefined")
    window.__mdPrevLivePrice = null;

  // ---------- UI bootstrap ----------
  function ensureUI() {
    let btn = document.getElementById("dbgBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "dbgBtn";
      btn.textContent = "DBG";
      btn.style.cssText =
        "position:fixed;bottom:20px;right:20px;z-index:99999;background:#007aff;color:#fff;padding:10px 14px;border:none;border-radius:50%;font-weight:700;box-shadow:0 0 10px rgba(0,0,0,0.3);";
      document.body.appendChild(btn);
    }
    let panel = document.getElementById("mobile-debug");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "mobile-debug";
      document.body.appendChild(panel);
    }
    // Base panel styles (with mobile-friendly scrolling)
    panel.style.cssText =
      "display:none;position:fixed;bottom:80px;right:20px;width:300px;max-height:90vh;overflow:auto;background:rgba(20,22,30,0.98);color:#fff;font-size:13px;padding:10px;border-radius:12px;box-shadow:0 0 12px rgba(0,0,0,0.4);z-index:99999;webkit-overflow-scrolling:touch;touch-action:pan-y;";

    // Toggle panel on click
    btn.onclick = function () {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    };
    return panel;
  }

  // ---------- state snapshot ----------
  function snapshot() {
    const st = {};
    try {
      // counters/meta
      st.csvRows = Number.isFinite(window.__csvRows) ? window.__csvRows : 0;
      st.lastBar = window.__lastBarTime || "—";
      st.autoChecked = !!window.__autoChecked;

      // indicators flags
      st.useRSI = !!window.USE_RSI;
      st.useMACD = !!window.USE_MACD;
      st.useEMA_TREND = !!window.USE_EMA_TREND;
      st.useSTOCH = !!window.USE_STOCH;
      st.useBB = !!window.USE_BB;

      // live data
      st.livePrice =
        typeof window.__livePrice === "number" && isFinite(window.__livePrice)
          ? window.__livePrice
          : null;
      st.liveAgeMs =
        typeof window.__liveTimeMs === "number" && isFinite(window.__liveTimeMs)
          ? Date.now() - window.__liveTimeMs
          : null;

      // ok/bad threshold (ms)
      st.liveAgeOkMs =
        typeof window.__liveAgeOkMs === "number" && isFinite(window.__liveAgeOkMs)
          ? window.__liveAgeOkMs
          : 5000;

      // direction arrow
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
          dirColor = "#7bd88f"; // up
        } else if (st.livePrice < prev) {
          dir = "↓";
          dirColor = "#ff8989"; // down
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

  // ---------- header UX (drag + fullscreen + close) ----------
  function attachUX(panel) {
    const head = panel.querySelector("#md-head");
    if (!head) return; // render() guarantees it exists

    // drag
    (function enableDrag() {
      if (head.__dragBound) return; // bind once
      head.__dragBound = true;
      let startX, startY, startTop, startRight, dragging = false;
      function px(n) { return (n | 0) + "px"; }
      function onStart(e) {
        dragging = true;
        const t = e.touches ? e.touches[0] : e;
        startX = t.clientX; startY = t.clientY;
        const rect = panel.getBoundingClientRect();
        panel.style.top = px(rect.top);
        panel.style.right = px(window.innerWidth - rect.right);
        panel.style.bottom = "auto";
        startTop = rect.top;
        startRight = window.innerWidth - rect.right;
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onEnd);
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onEnd);
      }
      function onMove(e) {
        if (!dragging) return;
        const t = e.touches ? e.touches[0] : e;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        panel.style.top = px(Math.max(10, startTop + dy));
        panel.style.right = px(Math.max(10, startRight - dx));
        if (e.cancelable) e.preventDefault();
      }
      function onEnd() {
        dragging = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onEnd);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
      }
      head.addEventListener("mousedown", onStart);
      head.addEventListener("touchstart", onStart, { passive: true });
    })();

    // fullscreen + close
    (function enableFullscreenClose() {
      if (panel.__fsBound) return;
      panel.__fsBound = true;
      let full = false;
      const btnFS = panel.querySelector("#md-expand");
      const btnClose = panel.querySelector("#md-close");
      const orig = {
        width: panel.style.width || "300px",
        right: panel.style.right || "20px",
        bottom: panel.style.bottom || "80px",
        top: panel.style.top || "",
        borderRadius: panel.style.borderRadius || "12px",
      };
      function setFull(v) {
        full = v;
        if (full) {
          panel.style.top = "10px";
          panel.style.right = "10px";
          panel.style.bottom = "10px";
          panel.style.width = "calc(100vw - 20px)";
          panel.style.maxHeight = "calc(100vh - 20px)";
          panel.style.borderRadius = "12px";
          panel.style.display = "block";
        } else {
          panel.style.top = "";
          panel.style.right = orig.right;
          panel.style.bottom = orig.bottom;
          panel.style.width = orig.width;
          panel.style.maxHeight = "90vh";
          panel.style.borderRadius = orig.borderRadius;
        }
      }
      if (btnFS) btnFS.onclick = () => setFull(!full);
      if (btnClose) btnClose.onclick = () => (panel.style.display = "none");
    })();
  }

  // ---------- render ----------
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

    panel.innerHTML = `
      <div id="md-head" style="cursor:move;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;opacity:.9;">
        <span style="font-weight:700">Mobile Debug</span>
        <div>
          <button id="md-expand" style="margin-inline-end:6px;border:0;border-radius:8px;padding:4px 8px;background:#444;color:#fff">⤢</button>
          <button id="md-close" style="border:0;border-radius:8px;padding:4px 8px;background:#333;color:#fff">×</button>
        </div>
      </div>

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

    attachUX(panel);
  }

  // ---------- tick loop ----------
  function tick() {
    const st = snapshot();
    render(st);
  }

  window.addEventListener("load", function () {
    ensureUI();
    tick();
    setInterval(tick, 1000);
  });
})();
