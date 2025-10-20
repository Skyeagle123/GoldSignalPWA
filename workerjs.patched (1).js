// ===== GoldSignals • workerjs (bridge patched: JSON-only + sanity) =====
/*
  Variables & Secrets (Workers → Settings):
  - TELEGRAM_TOKEN  (Secret)
  - TELEGRAM_CHAT   (Secret)
  - GOLD_TICKS_URL  (Plaintext)  e.g. https://gold-ticks.samer-mourtada.workers.dev/price
*/

const LAST_SENT = new Map();

function tfToMs(tf) {
  if (!tf) return null;
  const m = String(tf).trim().toLowerCase().match(/^(\d+)\s*([mhd])$/);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2];
  if (!Number.isFinite(n) || n <= 0) return null;
  if (u === 'm') return n * 60 * 1000;
  if (u === 'h') return n * 60 * 60 * 1000;
  if (u === 'd') return n * 24 * 60 * 60 * 1000;
  return null;
}

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
    "vary": "Origin",
    ...extra,
  };
}
function sendJson(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(extraHeaders) },
  });
}

function healthyJson(j){
  if(!j || (j.ok===false)) return false;
  const p = Number(j.price);
  if(!Number.isFinite(p)) return false;
  if(j.symbol && j.symbol!=="XAUUSD") return false;
  if(p<800 || p>10000) return false;
  const ts = Number(j.ts||0);
  if(ts && Math.abs(Date.now()-ts) > 60_000) return false;
  return true;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    // ---------- /price (JSON-only + sanity) ----------
    if (url.pathname === "/price") {
      const upstream = env.GOLD_TICKS_URL || "https://gold-ticks.samer-mourtada.workers.dev/price";
      try {
        const r = await fetch(
          upstream + (upstream.includes("?") ? "&" : "?") + "t=" + Date.now(),
          { cf: { cacheTtl: 0, cacheEverything: false }, headers: { "cache-control": "no-cache", "accept": "application/json" } }
        );
        const ct = (r.headers.get("content-type") || "").toLowerCase();
        const raw = await r.text();

        if (!(ct.includes("json") || raw.trim().startsWith("{"))) {
          return sendJson({ ok:false, source:"bridge", upstream, note:"upstream_not_json" }, 502);
        }
        let j; try { j = JSON.parse(raw); } catch(e){
          return sendJson({ ok:false, source:"bridge", upstream, note:"json_parse_error" }, 502);
        }
        if (!healthyJson(j)) {
          return sendJson({ ok:false, source:"bridge", upstream, note:"unhealthy_json" }, 502);
        }
        return sendJson({ ok:true, source:"bridge", upstream, ...j }, 200);
      } catch (e) {
        return sendJson({ ok:false, source:"bridge", note:"bridge_exception", error:String(e) }, 500);
      }
    }

    // ---------- /health ----------
    if (url.pathname === "/health") {
      return sendJson({ ok:true, source:"bridge", ts: Date.now() });
    }

    // ---------- /alert (كما في نسختك مع إصلاح 0.00) ----------
    if (url.pathname === "/alert" && req.method === "POST") {
      try {
        const payload = await req.json();
        const { side, tf, tfMins, entry, tp1, tp2, sl, filtersRejected, force } = payload || {};
        const tfStr = tf || (Number.isFinite(tfMins) ? `${tfMins}m` : null);
        const tfMs  = tfToMs(tfStr);
        if (!tfStr || !tfMs) {
          return sendJson({ ok:false, error:"bad_tf", msg:"Missing/invalid tf (e.g. '5m','30m','1h','1d')." }, 400);
        }

        const now = Date.now();
        const candleStart = Math.floor(now / tfMs) * tfMs;

        const rec = LAST_SENT.get(tfStr);
        const lastCandle = rec?.candleStart;
        const lastSide   = rec?.side ?? null;
        const currSide   = (side || "").toUpperCase() || null;

        let shouldSend = false;
        if (force === true) shouldSend = true;
        else if (lastCandle !== candleStart) { if (currSide) shouldSend = true; }
        else { if (currSide && currSide !== lastSide) shouldSend = true; else
          return sendJson({ ok:true, skipped:true, reason:"same_side_same_candle", tf:tfStr, candleStart }); }

        const safeNum = (v) => {
          if (v === null || v === undefined) return null;
          const s = String(v).trim();
          if (s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return null;
          const n = Number(s);
          return Number.isFinite(n) ? n : null;
        };
        const nf = n => Number.isFinite(n) ? n.toFixed(2) : "—";

        const eN  = safeNum(entry);
        const t1N = safeNum(tp1);
        const t2N = safeNum(tp2);
        const slN = safeNum(sl);

        const sideAr = currSide === "BUY" ? "شراء" : (currSide === "SELL" ? "بيع" : (currSide || "—"));
        const lines = [
          "🔔 GoldSignals",
          `${sideAr} | TF: ${tfStr}`,
        ];
        if (eN  !== null) lines.push(`Entry: ${nf(eN)}`);
        if (t1N !== null) lines.push(`TP1  : ${nf(t1N)}`);
        if (t2N !== null) lines.push(`TP2  : ${nf(t2N)}`);
        if (slN !== null) lines.push(`SL   : ${nf(slN)}`);
        if (filtersRejected === true) lines.push("(مرفوضة بالفلاتر)");

        const text = lines.join("\n");

        const tgToken = env.TELEGRAM_TOKEN;
        const chatId  = env.TELEGRAM_CHAT;
        if (!tgToken || !chatId) {
          return sendJson({ ok:false, error:"no_tg_env", msg:"Missing TELEGRAM_TOKEN or TELEGRAM_CHAT" }, 500);
        }

        const tgResp = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text }),
        });
        const tgBody = await tgResp.json();

        if (tgResp.ok) LAST_SENT.set(tfStr, { candleStart, side: currSide });

        return sendJson({ ok: tgResp.ok, tf: tfStr, candleStart, tg_status: tgResp.status, tg_body: tgBody }, tgResp.ok ? 200 : 502);
      } catch (e) {
        return sendJson({ ok:false, error:"alert_failed", msg:String(e) }, 500);
      }
    }

    return sendJson({ ok:true, msg:"GoldSignals bridge ready" });
  }
};
