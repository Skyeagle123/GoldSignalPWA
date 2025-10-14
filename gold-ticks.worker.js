export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/,'') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
        }
      });
    }

    if (path === '/price') return price();
    return new Response(JSON.stringify({ ok:false, error:'not_found' }), { status: 404, headers: corsJson() });
  }
};

function corsJson(){
  return {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*'
  };
}

async function price(){
  const STQ_URL = 'https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv';
  try{
    const res = await fetch(STQ_URL + '&t=' + Date.now(), {
      cf: { cacheTtl: 0, cacheEverything: false },
      headers: { 'cache-control': 'no-cache, no-store' }
    });
    if (!res.ok) throw new Error('upstream ' + res.status);
    const csv = await res.text();
    const line = csv.trim().split('\n').pop();
    const parts = line.split(',');
    const price = parseFloat(parts[6]);
    const dateStr = parts[1];
    const timeStr = parts[2];
    const ts = Date.parse(dateStr + 'T' + timeStr + 'Z') || Date.now();
    return new Response(JSON.stringify({ price, date: dateStr, time: timeStr, ts }), { headers: corsJson() });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status: 502, headers: corsJson() });
  }
}
