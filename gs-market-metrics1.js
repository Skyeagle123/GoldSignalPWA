// gs-market-metrics.js  —  reads BB line + live price from UI and shows: "BB% • ATR%"
(() => {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const toNum = (s) => {
    if (s == null) return NaN;
    const t = String(s).replace(/[^\d.\-]+/g, "");
    return t ? Number(t) : NaN;
  };

  function ensureHost() {
    let el = document.getElementById("mktStatsInline");
    if (el) return el;
    el = document.createElement("div");
    el.id = "mktStatsInline";
    el.style.cssText =
      "margin-top:8px;font-size:.92rem;opacity:.95;color:var(--muted-fore,#bbb)";
    // حطه مباشرة بعد سطر "حالة السوق" إن وُجد
    const mark = [...document.querySelectorAll("*")].find((n) =>
      /حالة\s*السوق/.test(n.textContent || "")
    );
    if (mark?.parentElement) mark.parentElement.after(el);
    else (document.querySelector("main") || document.body).appendChild(el);
    return el;
  }
  const host = ensureHost();

  const fmt = (v) =>
    Number.isFinite(v) ? (v > 0 ? "+" : "") + v.toFixed(2) : "—";
  function render({ bbp, atrp, src }) {
    host.textContent = `BB%: ${fmt(bbp)} • ATR%: ${fmt(atrp)}${src ? " (" + src + ")" : ""}`;
  }

  // يلتقط أحداث من جسورك إن كانت موجودة
  window.addEventListener("gs:state-metrics", (e) => {
    const d = e?.detail || {};
    let bbp = Number.isFinite(d.bbp) ? d.bbp : undefined;
    let atrp = Number.isFinite(d.atrp) ? d.atrp : undefined;
    if (bbp != null || atrp != null) render({ bbp, atrp, src: "bridge" });
  });

  function readFromUI() {
    // السعر الحي
    let price;
    const liveEl =
      document.getElementById("livePrice") ||
      [...document.querySelectorAll("*")].find((n) =>
        /السعر\s*الحي/.test(n.textContent || "")
      );
    if (liveEl) {
      const m = (liveEl.textContent || "").match(/[-+]?\d[\d,.]*/);
      if (m) price = toNum(m[0]);
      if (!Number.isFinite(price)) {
        const t = [...liveEl.querySelectorAll("*")]
          .map((x) => x.textContent || "")
          .join(" ");
        const m2 = t.match(/[-+]?\d[\d,.]*/);
        if (m2) price = toNum(m2[0]);
      }
    }

    // سطر BB: "BB: U / M / L" (قد يكون بثلاث سبانات)
    let upper, mid, lower;
    const bbNode = [...document.querySelectorAll("*")].find((n) =>
      /\bBB\b\s*:/.test(n.textContent || "")
    );
    if (bbNode) {
      const nums = (bbNode.textContent || "").match(/[-+]?\d[\d,.]*/g) || [];
      if (nums.length >= 3) {
        upper = toNum(nums[0]);
        mid = toNum(nums[1]);
        lower = toNum(nums[2]);
      } else {
        // أحيانًا الأرقام موزّعة ضمن أبناء
        const nums2 = [...bbNode.querySelectorAll("*")]
          .map((x) => x.textContent || "")
          .join(" ")
          .match(/[-+]?\d[\d,.]*/g) || [];
        if (nums2.length >= 3) {
          upper = toNum(nums2[0]);
          mid = toNum(nums2[1]);
          lower = toNum(nums2[2]);
        }
      }
    }

    // ATR% إن كان مكتوبًا
    let atrp;
    const atrNode = [...document.querySelectorAll("*")].find((n) =>
      /ATR%/.test(n.textContent || "")
    );
    if (atrNode) {
      const mm = (atrNode.textContent || "").match(/ATR%[^0-9\-+]*([-+]?\d[\d,.]*)/i);
      if (mm) atrp = toNum(mm[1]);
    }

    // حساب BB%
    let bbp;
    if ([upper, mid, lower, price].every(Number.isFinite)) {
      const halfSpan = (upper - lower) / 2;
      if (halfSpan > 0) bbp = clamp(((price - mid) / halfSpan) * 100, -100, 100);
    }

    return { bbp, atrp };
  }

  let last = { bbp: undefined, atrp: undefined };
  function tick() {
    try {
      const u = readFromUI();
      const bbp = Number.isFinite(u.bbp) ? u.bbp : last.bbp;
      const atrp = Number.isFinite(u.atrp) ? u.atrp : last.atrp;
      if (bbp !== last.bbp || atrp !== last.atrp) {
        last = { bbp, atrp };
        render({ bbp, atrp, src: "ui" });
      }
    } catch {}
  }

  // انتظر DOM ثم ابدأ
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", tick, { once: true });
  else tick();

  setInterval(tick, 1500);
})();
