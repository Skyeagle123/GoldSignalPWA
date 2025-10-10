/* GoldSignals → Worker bridge (strict real-signal + strong dedup) */
(function () {
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  const box =
    document.getElementById("adviceText") ||
    document.querySelector("#adviceText");
  if (!box) {
    console.warn("[GS] adviceText not found.");
    return;
  }

  const num = (v) => {
    if (v == null) return null;
    const n = Number(String(v).replace(/[^\d.\-]+/g, ""));
    return isFinite(n) ? n : null;
  };

  function parseTF(text) {
    const en = text.match(/TF\s*:\s*(\d+)\s*([mh])/i);
    if (en) {
      const n = Number(en[1]);
      const u = en[2].toLowerCase();
      const mins = u === "h" ? n * 60 : n;
      return { tfLabel: `${mins}${u === "h" ? "h" : "m"}`, tfMins: mins };
    }
    const ar = text.match(/الإطار\s*:\s*(\d+)\s*دق(?:يقة|ائق)/);
    if (ar) {
      const mins = Number(ar[1]);
      return { tfLabel: `${mins}m`, tfMins: mins };
    }
    const guess = Number(window.currentTFMinutes || window.currentTF || 15);
    return { tfLabel: `${guess}m`, tfMins: guess || 15 };
  }

  // كلمات/عبارات نمنع معها الإرسال
  const NEGATIVE_PATTERNS = [
    /مرفوض|مرفوضة|فلتر|فلترات/i,
    /افتراضي|افتراضية|اطلاع فقط|اطّلاع/i,
    /قريب جداً?|قريب جدا|قريب من/i,
    /Pivot/i,
  ];

  function isRejected(text) {
    return NEGATIVE_PATTERNS.some((re) => re.test(text));
  }

  function parseAdvice(text) {
    let side = null;
    if (/BUY/i.test(text) || /شراء/.test(text)) side = "BUY";
    if (/SELL/i.test(text) || /بيع/.test(text)) side = "SELL";

    const mEntry =
      text.match(/Entry\s*:\s*([0-9.,]+)/i) ||
      text.match(/سعر الدخول\s*[:：]\s*([0-9.,]+)/);
    const entry = mEntry ? num(mEntry[1]) : null;

    const mTp1 =
      text.match(/TP1\s*:\s*([0-9.,]+)/i) ||
      text.match(/TP1\s*[:：]\s*([0-9.,]+)/i);
    const mTp2 =
      text.match(/TP2\s*:\s*([0-9.,]+)/i) ||
      text.match(/TP2\s*[:：]\s*([0-9.,]+)/i);
    const mSl =
      text.match(/SL\s*:\s*([0-9.,]+)/i) ||
      text.match(/وقف الخسارة\s*[:：]\s*([0-9.,]+)/);

    const tp1 = mTp1 ? num(mTp1[1]) : null;
    const tp2 = mTp2 ? num(mTp2[1]) : null;
    const sl = mSl ? num(mSl[1]) : null;

    const { tfLabel, tfMins } = parseTF(text);

    return {
      side,
      entry,
      tp1,
      tp2,
      sl,
      tf: tfLabel,
      tfMins,
      filtersRejected: isRejected(text),
    };
  }

  // مفاتيح التخزين
  const K_BUCKET = "__gs_last_bucket__";
  const K_HASH = "__gs_last_payload_hash__";
  const read = (k) => sessionStorage.getItem(k);
  const write = (k, v) => sessionStorage.setItem(k, v);

  // Hash بسيط لمحتوى الإشارة
  const hash = (obj) =>
    btoa(
      unescape(
        encodeURIComponent(
          JSON.stringify(obj, Object.keys(obj).sort()).slice(0, 256)
        )
      )
    );

  let lastText = "";
  let debounceTimer = null;
  const DEBOUNCE_MS = 2200; // أطول شوي ليستقر النص بعد تبديل TF

  async function send(payload) {
    try {
      const r = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      console.log("[GS] sent:", payload, j);
    } catch (e) {
      console.error("[GS] send failed:", e);
    }
  }

  function trySend(text) {
    const p = parseAdvice(text);
    console.log("[GS] parsed:", p);

    // شرط الإشارة الحقيقية: side + entry + tp1 + sl موجودين،
    // وعدم وجود كلمات الرفض/الافتراضي/قريب …إلخ
    if (
      p.filtersRejected ||
      !p.side ||
      p.entry == null ||
      p.tp1 == null ||
      p.sl == null
    ) {
      console.warn("[GS] skipped (not a real signal).");
      return;
    }

    // Dedup حسب الشمعة
    const bucket =
      p.side + "|" + p.tf + "|" + Math.floor(Date.now() / (p.tfMins * 60 * 1000));

    // Dedup أقوى حسب محتوى الإشارة
    const payload = {
      side: p.side,
      tf: p.tf,
      entry: p.entry,
      tp1: p.tp1,
      tp2: p.tp2,
      sl: p.sl,
      filtersRejected: false,
    };
    const h = hash(payload);

    // لو نفس المحتوى أو نفس الشمعة—لا تبعِت
    if (bucket === read(K_BUCKET) || h === read(K_HASH)) {
      console.log("[GS] deduped.");
      return;
    }

    write(K_BUCKET, bucket);
    write(K_HASH, h);
    send(payload);
  }

  function onChange() {
    const txt = box.innerText || "";
    if (txt === lastText) return;
    lastText = txt;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => trySend(txt), DEBOUNCE_MS);
  }

  // بدء المراقبة
  onChange(); // يرسل فقط إذا كانت نصيحة حقيقية جاهزة
  const mo = new MutationObserver(onChange);
  mo.observe(box, { childList: true, subtree: true, characterData: true });
  console.log("[GS] watcher started.");
})();
