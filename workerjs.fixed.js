// ===== GoldSignals • workerjs (bridge + per-candle TG alerts) =====

// بيئة متغيّرات مطلوبة في Cloudflare (Settings > Variables and Secrets):
// TELEGRAM_TOKEN  (Secret)  | TELEGRAM_CHAT (Secret)
// GOLD_TICKS_URL  (Plaintext)  ← اختياري لمسار /price (مثلاً: https://gold-ticks.…/price)

const LAST_SENT = new Map(); // key=tf → { candleStart, side }

function tfToMs(tf) {
  if (!tf) return null;
  const m = String(tf).trim().toLowerCase().match(/^(\d+)\s*([mhd])$/);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2];
  if (!Number.isFinite(n) || n <= 0) return null;
  if (u === "m") return n * 60 * 1000;
  if (u === "h") return n * 60 * 60 * 1000;
  if (u === "d") return n * 24 * 60 * 60 * 1000;
  return null;
}

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    ...extra,
  };
}

function sendJson(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(extraHeaders),
    },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // ---------- /price (bridge) ----------
    if (url.pathname === "/price") {
      const upstream = env.GOLD_TICKS_URL || "https://gold-ticks.samer-mourtada.workers.dev/price";
      try {
        const r = await fetch(upstream, { cf: { cacheTtl: 10 } });
        const ct = r.headers.get("content-type") || "";
        const raw = await r.text();

        // أولوية: JSON صريح فقط
        if (ct.includes("application/json") || raw.trim().startsWith("{")) {
          try {
            const j = JSON.parse(raw);
            const p = Number(j?.price);
            if (Number.isFinite(p) && p > 1000 && p < 10000) {
              return sendJson({ ok: true, source: "bridge", upstream, price: p, ...j });
            }
            // لو JSON بس بدون price صالح
            return sendJson({ ok: false, error: "bad_json_price", upstream, body: j }, 502);
          } catch (e) {
            // راجع للـfallback أدناه
          }
        }

        // Fallback صارم: التقاط price من نص يعتمد على المفتاح "price"
        const m = raw.match(/"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
        const p = m ? Number(m[1]) : NaN;
        if (Number.isFinite(p) && p > 1000 && p < 10000) {
          return sendJson({ ok: true, source: "bridge", upstream, price: p, note: "parsed_from_text" });
        }

        // لو ما قدرنا نجيب رقم معقول → ارجع خطأ بدل أرقام مضلِّلة
        return sendJson({ ok: false, error: "price_upstream_failed", upstream, msg: "upstream not valid JSON with price", body: raw.slice(0, 500) }, 502);
      } catch (e) {
        return sendJson({ ok: false, error: "price_bridge_failed", msg: String(e) }, 502);
      }
    }

    // ---------- /alert (per-candle, allow side-change) ----------
    if (url.pathname === "/alert" && req.method === "POST") {
      try {
        const payload = await req.json();
        const { side, tf, tfMins, entry, tp1, tp2, sl, filtersRejected, force } = payload || {};

        const tfStr = tf || (Number.isFinite(tfMins) ? `${tfMins}m` : null);
        const tfMs  = tfToMs(tfStr);
        if (!tfStr || !tfMs) {
          return sendJson({ ok: false, error: "bad_tf", msg: "Missing/invalid tf (e.g. '5m','30m','1h','1d')." }, 400);
        }

        const now = Date.now();
        const candleStart = Math.floor(now / tfMs) * tfMs;

        const rec = LAST_SENT.get(tfStr);
        const lastCandle = rec?.candleStart;
        const lastSide   = rec?.side ?? null;
        const currSide   = (side || "").toUpperCase() || null;

        let shouldSend = false;
        if (force === true) {
          shouldSend = true;
        } else if (lastCandle !== candleStart) {
          if (currSide) shouldSend = true; // أول رسالة بهالشمعة
        } else {
          // نفس الشمعة: ابعث فقط إذا تغيّر الاتجاه
          if (currSide && currSide !== lastSide) shouldSend = true;
        }

        if (!shouldSend) {
          return sendJson({ ok: true, skipped: true, reason: "same_side_same_candle", tf: tfStr, candleStart });
        }

        const lines = ["🔔 GoldSignals", `Side: ${currSide ?? "-"}`, `TF: ${tfStr}`];
        if (Number.isFinite(entry)) lines.push(`Entry: ${entry}`);
        if (Number.isFinite(tp1))   lines.push(`TP1: ${tp1}`);
        if (Number.isFinite(tp2))   lines.push(`TP2: ${tp2}`);
        if (Number.isFinite(sl))    lines.push(`SL: ${sl}`);
        if (filtersRejected === true) lines.push("(مرفوضة بالفلاتر)");
        const text = lines.join("\n");

        const tgToken = env.TELEGRAM_TOKEN;
        const chatId  = env.TELEGRAM_CHAT;
        if (!tgToken || !chatId) {
          return sendJson({ ok: false, error: "no_tg_env", msg: "Missing TELEGRAM_TOKEN or TELEGRAM_CHAT" }, 500);
        }

        const tgResp = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text }),
        });
        const tgBody = await tgResp.json();

        if (tgResp.ok) {
          LAST_SENT.set(tfStr, { candleStart, side: currSide });
        }

        return sendJson({ ok: tgResp.ok, tf: tfStr, candleStart, tg_status: tgResp.status, tg_body: tgBody }, tgResp.ok ? 200 : 502);
      } catch (e) {
        return sendJson({ ok: false, error: "alert_failed", msg: String(e) }, 500);
      }
    }

    return sendJson({ ok: true, msg: "GoldSignals worker ready" });
  }
};
