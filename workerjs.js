
// === Cloudflare Worker: workerjs.js ===
// Endpoints:
//   GET  /            -> "workerjs is running"
//   POST /alert       -> Send Telegram message (needs TG_TOKEN and TG_CHAT_ID secrets)
//   GET  /price       -> Simple gold-price proxy (fallbacks included)
//
// Set secrets in Cloudflare Dashboard -> Workers & Pages -> your worker -> Settings -> Variables:
//   - TG_TOKEN   (bot token from BotFather)
//   - TG_CHAT_ID (your chat id)
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/,''); // trim trailing slash

      if (path === "" || path === "/") {
        return new Response("workerjs is running", { status: 200 });
      }

      if (path === "/alert" && request.method === "POST") {
        if (!env.TG_TOKEN || !env.TG_CHAT_ID) {
          return json({ ok: false, error: "no_tg_env" }, 500);
        }
        const p = await request.json().catch(() => ({}));

        // Build message
        const lines = ["🔔 *GoldSignals*"];
        if (p.side)  lines.push(`Side: *${p.side}*`);
        if (p.tf)    lines.push(`TF: *${p.tf}*`);
        if (p.entry != null) lines.push(`Entry: *${p.entry}*`);
        if (p.tp1 != null)   lines.push(`TP1: *${p.tp1}*`);
        if (p.tp2 != null)   lines.push(`TP2: *${p.tp2}*`);
        if (p.sl != null)    lines.push(`SL: *${p.sl}*`);

        const text = lines.join("\n");

        const tg = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: env.TG_CHAT_ID,
            text,
            parse_mode: "Markdown",
            disable_web_page_preview: true
          }),
        });

        const body = await tg.text();
        return json({ ok: tg.ok, tg_status: tg.status, tg_body: body, sent: tg.ok });
      }

      if (path === "/price") {
        const sources = [
          "https://api.metals.live/v1/spot/gold",
          "https://data-api.cryptocompare.com/spot/v1/last_trade_price?instrument=XAUUSD"
        ];

        for (const s of sources) {
          try {
            const r = await fetch(s, { cf: { cacheTtl: 10 } });
            if (!r.ok) continue;
            const t = await r.text();
            const price = pickPrice(t);
            if (price) return json({ price });
          } catch (e) {}
        }
        return json({ error: "price_unavailable" }, 502);
      }

      return new Response("Not found", { status: 404 });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function pickPrice(raw) {
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      const flat = data.flat(Infinity).filter((x) => Number.isFinite(Number(x)));
      const v = Number(flat.find((n) => Number(n) > 10));
      return Number.isFinite(v) ? v : null;
    }
    if (typeof data === "object" && data) {
      for (const k of Object.keys(data)) {
        const v = Number(data[k]);
        if (Number.isFinite(v) && v > 10) return v;
      }
    }
  } catch {}
  const m = String(raw).match(/([0-9]{3,5}(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : null;
}
