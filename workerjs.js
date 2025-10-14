export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/,'') || '/';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
        }
      });
    }

    // Routes
    if (path === '/price') return price(env);
    if (path === '/alert' && request.method === 'POST') return alertToTelegram(request, env);

    return new Response(JSON.stringify({ ok:false, error:'not_found' }), {
      status: 404, headers: corsJson()
    });
  }
};

function corsJson(){
  return {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*'
  };
}

// --- /price: fetch from stooq (no-cache) ---
async function price(env){
  const STQ_URL = 'https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv';
  try{
    const res = await fetch(STQ_URL + '&t=' + Date.now(), {
      cf: { cacheTtl: 0, cacheEverything: false },
      headers: { 'cache-control': 'no-cache, no-store' }
    });
    if (!res.ok) throw new Error('upstream ' + res.status);
    const csv = await res.text();
    // symbol,date,time,open,high,low,close,volume
    const line = csv.trim().split('\n').pop();
    const parts = line.split(',');
    const price = parseFloat(parts[6]);
    const dateStr = parts[1]; // YYYY-MM-DD
    const timeStr = parts[2]; // HH:MM:SS
    const ts = Date.parse(dateStr + 'T' + timeStr + 'Z') || Date.now();
    return new Response(JSON.stringify({ price, date: dateStr, time: timeStr, ts }), { headers: corsJson() });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status: 502, headers: corsJson() });
  }
}

// --- /alert: send to Telegram ---
async function alertToTelegram(request, env){
  const token = env.TELEGRAM_TOKEN;
  const chat  = env.TELEGRAM_CHAT;
  if (!token || !chat){
    return new Response(JSON.stringify({ ok:false, error:'no_tg_env' }), { status: 500, headers: corsJson() });
  }
  const body = await request.json().catch(()=> ({}));
  const side  = body.side || '';
  const tf    = body.tf || '';
  const entry = body.entry;
  const tp1   = body.tp1;
  const tp2   = body.tp2;
  const sl    = body.sl;

  const msg = [
    `📈 GoldSignals`,
    `الإطار: ${tf}`,
    `الإشارة: ${side==='BUY'?'شراء':'بيع'}`,
    (isFinite(entry)?`سعر الدخول: ${entry}`:null),
    (isFinite(tp1)?`TP1: ${tp1}`:null),
    (isFinite(tp2)?`TP2: ${tp2}`:null),
    (isFinite(sl)?`SL: ${sl}`:null)
  ].filter(Boolean).join('\n');

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const tg = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: msg })
  });
  const j = await tg.json().catch(()=> ({}));
  return new Response(JSON.stringify({ ok:true, telegram:j && j.ok!==false }), { headers: corsJson() });
}
