/* ======================= GoldSignals • workerjs.js =======================

Environment (set these in Cloudflare Workers > Settings):
- TELEGRAM_TOKEN (Secret)
- TELEGRAM_CHAT  (Secret)
- GOLD_TICKS_URL (Plaintext, e.g. https://gold-ticks.samer-mourtada.workers.dev/price)

Endpoints:
- GET  /price          -> passthrough JSON from GOLD_TICKS_URL (or returns { price, ts } if unavailable)
- POST /alert          -> send absolute prices to Telegram (Entry/TP1/TP2/SL), no diffs
- GET  /proxy?url=...  -> simple allowlist CORS proxy (optional; adjust ALLOW_HOSTS)
- OPTIONS *            -> CORS preflight

CORS: open (*). If you want to lock it down, limit the Origin below.

Only change from older versions: /alert sends absolute prices as-is.

========================================================================= */

const DEFAULT_TG_DISABLED = false; // set true for dry-run

// Allowlist hosts for /proxy (edit as needed)
const ALLOW_HOSTS = new Set([
  'stooq.com', 'stooq.pl', 'raw.githubusercontent.com',
  'gold-ticks.samer-mourtada.workers.dev'
]);

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-gs-token',
    'access-control-max-age': '86400'
  };
}

async function handleRequest(req) {
  const url = new URL(req.url);
  const origin = req.headers.get('origin') || '*';

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // ===== /alert (ABSOLUTE PRICES, no diffs) =====
  if (url.pathname === '/alert' && req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { body = {}; }

    const { side, tf, entry, tp1, tp2, sl, price } = body;
    const nf = n => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '—');
    const sideAr = side === 'BUY' ? 'شراء' : side === 'SELL' ? 'بيع' : (side || '—');

    const msg = [
      `${sideAr}  |  TF: ${tf || ''}`,
      `Entry: ${nf(entry)}`,
      `TP1  : ${nf(tp1)}`,
      `TP2  : ${nf(tp2)}`,
      `SL   : ${nf(sl)}`,
      (price != null) ? `Live: ${nf(price)}` : null
    ].filter(Boolean).join('\n');

    // Send to Telegram
    let sent = false, ok = true, tgResp = null;
    if (!DEFAULT_TG_DISABLED) {
      try {
        const urlTG = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        const r = await fetch(urlTG, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: msg })
        });
        tgResp = await r.json().catch(() => ({}));
        ok = r.ok;
        sent = !!tgResp?.ok;
      } catch (e) {
        ok = false;
      }
    }

    return new Response(JSON.stringify({ ok, sent, text: msg }), {
      status: ok ? 200 : 500,
      headers: { 'content-type': 'application/json', ...corsHeaders(origin) }
    });
  }

  // ===== /price passthrough =====
  if (url.pathname === '/price' && req.method === 'GET') {
    try {
      const r = await fetch(GOLD_TICKS_URL, { cf: { cacheTtl: 2 } });
      const txt = await r.text();
      // try JSON first
      try {
        const j = JSON.parse(txt);
        return new Response(JSON.stringify(j), {
          status: 200,
          headers: { 'content-type': 'application/json', ...corsHeaders(origin) }
        });
      } catch {
        // extract number fallback
        const m = txt.match(/(\d+\.\d{2,})/);
        const price = m ? Number(m[1]) : null;
        const payload = { price, ts: Date.now() };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json', ...corsHeaders(origin) }
        });
      }
    } catch (e) {
      const payload = { price: null, ts: Date.now() };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json', ...corsHeaders(origin) }
      });
    }
  }

  // ===== /proxy?url=... (allowlist) =====
  if (url.pathname === '/proxy' && req.method === 'GET') {
    const target = url.searchParams.get('url') || '';
    try {
      const u = new URL(target);
      if (!ALLOW_HOSTS.has(u.hostname)) {
        return new Response('host not allowed', { status: 403, headers: corsHeaders(origin) });
      }
      const r = await fetch(u.toString(), { cf: { cacheTtl: 10 } });
      const hdrs = { ...corsHeaders(origin) };
      // Pass basic content-type if available
      const ct = r.headers.get('content-type');
      if (ct) hdrs['content-type'] = ct;
      return new Response(r.body, { status: r.status, headers: hdrs });
    } catch {
      return new Response('bad url', { status: 400, headers: corsHeaders(origin) });
    }
  }

  // default
  return new Response('OK', { status: 200, headers: corsHeaders(origin) });
}
