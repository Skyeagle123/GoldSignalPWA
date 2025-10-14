// ===== GoldSignals • workerjs (bridge + per-candle TG alerts on side-change) =====

/*
  Variables & Secrets (Workers → Settings):
  - TELEGRAM_TOKEN  (Secret)
  - TELEGRAM_CHAT   (Secret)
  - GOLD_TICKS_URL  (Plaintext)  e.g. https://gold-ticks.samer-mourtada.workers.dev/price
*/

// نتعقّب لكل TF آخر شمعة وآخر اتجاه أرسلناه فيها
// Map<string, { candleStart:number, side:string|null }>
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
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(extraHeaders),
    },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // ---------- /price (bridge إلى gold-ticks مع fallback JSON مضمون) ----------
    if (url.pathname === "/price") {
      const upstream = env.GOLD_TICKS_URL || "https://gold-ticks.samer-mourtada.workers.dev/price";
      try {
        // no-cache + نطلب JSON
        const r = await fetch(
          upstream + (upstream.includes('?') ? '&' : '?') + 't=' + Date.now(),
          {
            cf: { cacheTtl: 0, cacheEverything: false },
            headers: { 'cache-control': 'no-cache, no-store', 'accept': 'application/json' }
          }
        );

        const ct  = (r.headers.get('content-type') || '').toLowerCase();
        const txt = await r.text();

        // 1) لو الرد JSON من gold-ticks
        if (ct.includes('json') || txt.trim().startsWith('{')) {
          const data = JSON.parse(txt);
          return sendJson({ ok: true, source: "bridge", upstream, ...data });
        }

        // 2) Fallback: stooq CSV -> JSON مضمون
        const st = await fetch(
          'https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv&t=' + Date.now(),
          { cf: { cacheTtl: 0, cacheEverything: false }, headers: { 'cache-control': 'no-cache, no-store' } }
        );
        const csv   = await st.text();
        const line  = csv.trim().split('\n').pop();      // آخر سطر
        const parts = line.split(',');                   // symbol,date,time,open,high,low,close,volume
        const price = parseFloat(parts[6]);
        const dateStr = parts[1];
        const timeStr = parts[2];
        const ts = Date.parse(dateStr + 'T' + timeStr + 'Z') || Date.now();

        return sendJson({
          ok: true,
          source: "fallback-stooq",
          upstream,
          symbol: "XAUUSD",
          price,
          close: price,
          date: dateStr,
          time: timeStr,
          ts
        });

      } catch (e) {
        return sendJson({ ok: false, error: "price_bridge_failed", msg: String(e) }, 502);
      }
    }

    // ---------- /alert : أرسل فقط عند تغيّر الـside ضمن نفس الشمعة ----------
    if (url.pathname === "/alert" && req.method === "POST") {
      try {
        const payload = await req.json();
        // المتوقع من الواجهة:
        // { side, tf, tfMins?, entry?, tp1?, tp2?, sl?, filtersRejected?, force? }
        const {
          side,
          tf,
          tfMins,
          entry,
          tp1,
          tp2,
          sl,
          filtersRejected,
          force
        } = payload || {};

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

        // المنطق:
        // - أول مرة بهالشمعة: لا نرسل إلا إذا في side معلوم (BUY/SELL)
        // - إذا كنا مرسلين بهالشمعة وكان side نفسه → تخطّى (لا تبعت تغيّر entry)
        // - إذا تغيّر side ضمن الشمعة → ابعث فوراً
        let shouldSend = false;
        if (force === true) {
          shouldSend = true;
        } else if (lastCandle !== candleStart) {
          // شمعة جديدة: لا ترسل إلا إذا side موجود
          if (currSide) shouldSend = true;
        } else {
          // نفس الشمعة
          if (currSide && currSide !== lastSide) {
            shouldSend = true; // تغيّر اتجاه
          } else {
            // نفس الاتجاه ضمن الشمعة => لا ترسل (تغيّرات الـEntry تتجاهَل)
            return sendJson({
              ok: true,
              skipped: true,
              reason: "same_side_same_candle",
              tf: tfStr,
              candleStart
            });
          }
        }

        if (!shouldSend) {
          return sendJson({
            ok: true,
            skipped: true,
            reason: "no_side_or_no_change",
            tf: tfStr,
            candleStart
          });
        }

        // صيغة الرسالة (أسطر ثابتة مثل الصورة)
        const lines = [
          "🔔 GoldSignals",
          `Side: ${currSide ?? "-"}`,
          `TF: ${tfStr}`,
        ];
        if (Number.isFinite(entry)) lines.push(`Entry: ${entry}`);
        if (Number.isFinite(tp1))   lines.push(`TP1: ${tp1}`);
        if (Number.isFinite(tp2))   lines.push(`TP2: ${tp2}`);
        if (Number.isFinite(sl))    lines.push(`SL: ${sl}`);
        if (filtersRejected === true) lines.push("(مرفوضة بالفلاتر)");

        const text = lines.join("\n");

        // تيليغرام
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
          // خزّن آخر شمعة وآخر اتجاه لهذا TF
          LAST_SENT.set(tfStr, { candleStart, side: currSide });
        }

        return sendJson({
          ok: tgResp.ok,
          tf: tfStr,
          candleStart,
          tg_status: tgResp.status,
          tg_body: tgBody,
        }, tgResp.ok ? 200 : 502);
      } catch (e) {
        return sendJson({ ok: false, error: "alert_failed", msg: String(e) }, 500);
      }
    }

    // افتراضي
    return sendJson({ ok: true, msg: "GoldSignals worker ready" });
  }
};
