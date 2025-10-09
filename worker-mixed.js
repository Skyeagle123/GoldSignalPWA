
/* GoldSignals Worker v3 — WS server + SSE + multi-sources (stooq + metals.live) + health */
const STQ_URL = 'https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv';
const LIVE_SOURCES = [
  'https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv',
  'https://api.metals.live/v1/spot/gold'
];
const LIVE_TIMEOUT_MS = 2500;
const ALLOW_HOSTS = new Set(['stooq.com','stooq.pl','raw.githubusercontent.com','githubusercontent.com','github.com']);
const TICK_RING_MAX = 3600;
let TICKS = [];

function cors(extra = {}) {
  return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'*','Cache-Control':'no-store',...extra};
}
function json(obj, status = 200, maxAge = 0) {
  const h = { ...cors(), 'Content-Type': 'application/json; charset=utf-8' };
  if (maxAge > 0) h['Cache-Control'] = `public, max-age=${maxAge}`;
  return new Response(JSON.stringify(obj), { status, headers: h });
}
function encoder(s) { return new TextEncoder().encode(s); }
function clampInt(v, def) { const n = parseInt(v ?? '', 10); return Number.isFinite(n) && n > 0 ? n : def; }
function toISO(d, t) { if (!d || !t) return new Date().toISOString(); return `${d}T${t}Z`; }

async function fetchWithTimeout(url, timeout=LIVE_TIMEOUT_MS){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), timeout);
  try{
    const r = await fetch(url, { signal: ctl.signal, cf: { cacheTtl: 0 }, headers: { 'cache-control': 'no-cache' } });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const ct=(r.headers.get('content-type')||'').toLowerCase();
    if(ct.includes('json')) return await r.json();
    return await r.text();
  } finally { clearTimeout(t); }
}

async function medianLivePrice(){
  const results = await Promise.allSettled(LIVE_SOURCES.map(u=>fetchWithTimeout(u).catch(e=>({err:String(e)}))));
  const nums = [];
  for(const r of results){
    if(r.status==='fulfilled' && r.value){
      const v = r.value;
      if(Array.isArray(v) && Number.isFinite(v[0])) nums.push(+v[0]);
      else if(v && Number.isFinite(v.price)) nums.push(+v.price);
      else if(typeof v === 'string'){
        const lines=v.trim().split('\n').filter(Boolean);
        const row=lines.length>1?lines[1]:lines[0];
        const parts=row.split(',');
        const close = Number(parts[6]);
        if(Number.isFinite(close)) nums.push(close);
      }
    }
  }
  if(!nums.length) throw new Error('no live sources');
  const avg = nums.reduce((a,b)=>a+b,0)/nums.length;
  const clean = nums.filter(v=>Math.abs(v-avg)/avg<0.02);
  const arr = clean.length?clean:nums;
  arr.sort((a,b)=>a-b);
  return arr[Math.floor(arr.length/2)];
}

function pushTick(price, timeMs){
  const t={price, timeMs:timeMs||Date.now()};
  TICKS.push(t);
  if(TICKS.length> TICK_RING_MAX) TICKS = TICKS.slice(-TICK_RING_MAX);
  return t;
}
function buildOHLC(tfSec=60, lookbackSec=7200){
  const now=Date.now(), from=now-lookbackSec*1000;
  const data=TICKS.filter(x=>x.timeMs>=from).sort((a,b)=>a.timeMs-b.timeMs);
  const tfMs=tfSec*1000;
  const map=new Map();
  for(const t of data){
    const bucket=Math.floor(t.timeMs/tfMs)*tfMs;
    let c=map.get(bucket);
    if(!c){ c={ts:bucket,open:t.price,high:t.price,low:t.price,close:t.price}; map.set(bucket,c); }
    else{ c.high=Math.max(c.high,t.price); c.low=Math.min(c.low,t.price); c.close=t.price; }
  }
  return [...map.values()].sort((a,b)=>a.ts-b.ts);
}

function handleWS(request) {
  const upgradeHeader = request.headers.get('Upgrade') || '';
  if (upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426, headers: cors() });
  }
  const { 0: client, 1: server } = new WebSocketPair();
  acceptServerWebSocket(server);
  return new Response(null, { status: 101, webSocket: client, headers: cors() });
}
function acceptServerWebSocket(ws) {
  ws.accept();
  tickOnceWS(ws);
  const interval = setInterval(()=>tickOnceWS(ws), 1000);
  const hb = setInterval(()=> { try{ ws.send(JSON.stringify({type:'ping', ts: Date.now()})); }catch(_){ } }, 15000);
  ws.addEventListener('close', ()=>{ clearInterval(interval); clearInterval(hb); });
  ws.addEventListener('error', ()=>{ try{ ws.close(); }catch(_){ } clearInterval(interval); clearInterval(hb); });
}
async function tickOnceWS(ws){
  try{
    const price = await medianLivePrice();
    const t = pushTick(price);
    ws.send(JSON.stringify({type:'tick', price, ts: t.timeMs}));
  }catch(e){
    ws.send(JSON.stringify({type:'err', err: String(e?.message||e), ts: Date.now()}));
  }
}

function streamTicksSSE(){
  const stream = new ReadableStream({
    start(controller){
      const enc = (s)=>encoder(s);
      let closed=false;
      async function tickOnce(){
        try{
          const price = await medianLivePrice();
          const t = pushTick(price);
          controller.enqueue(enc(`data: ${JSON.stringify({price, timeMs: t.timeMs})}\n\n`));
        }catch(e){
          controller.enqueue(enc(`data: ${JSON.stringify({err:String(e?.message||e), timeMs: Date.now()})}\n\n`));
        }
      }
      tickOnce();
      const id = setInterval(tickOnce, 1000);
      const ka = setInterval(()=>{ controller.enqueue(enc(':\n\n')); }, 15000);
      const abort = ()=>{ if(closed) return; closed=true; clearInterval(id); clearInterval(ka); try{ controller.close(); }catch{} };
      setTimeout(abort, 30 * 60 * 1000);
    }
  });
  return new Response(stream, { headers: { ...cors(), 'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive' } });
}

async function handlePrice(){
  const res = await fetch(STQ_URL, { cf: { cacheTtl: 5, cacheEverything: true } });
  if(!res.ok) return new Response(JSON.stringify({ok:false,status:res.status}),{status:502, headers:cors({'Content-Type':'application/json; charset=utf-8'})});
  const csv = (await res.text()).trim();
  const lines=csv.split('\n').filter(Boolean);
  const row = lines.length===1?lines[0]:lines[1];
  const parts = row.split(',');
  const [symbol,date,time, , , , close, volume] = parts;
  const price = Number(close);
  const iso = toISO(date,time);
  const ts = Date.parse(iso);
  const body = { ok:true, source:'stooq', symbol, price, close: price, date, time, volume: volume?Number(volume):null, isoTime: iso, ts: isFinite(ts)?ts:Date.now() };
  pushTick(price, isFinite(ts)?ts:Date.now());
  return new Response(JSON.stringify(body), { headers: cors({'Content-Type':'application/json; charset=utf-8'}) });
}

async function handleProxy(target){
  if(!target) return new Response('Missing url param',{status:400, headers:cors()});
  let u; try{ u=new URL(target); }catch{ return new Response('Bad url',{status:400, headers:cors()}); }
  if(!['http:','https:'].includes(u.protocol)) return new Response('Only http/https',{status:400, headers:cors()});
  if(!ALLOW_HOSTS.has(u.hostname)) return new Response('Host not allowed',{status:403, headers:cors()});
  const r = await fetch(u.toString(), { cf: { cacheTtl: 10, cacheEverything: true } });
  const buf = await r.arrayBuffer();
  const ct = r.headers.get('content-type') || 'application/octet-stream';
  return new Response(buf, { status: r.status, headers: cors({ 'Content-Type': ct }) });
}

export default {
  async fetch(req){
    const url = new URL(req.url);
    if(req.method==='OPTIONS') return new Response(null,{headers:cors()});
    try{
      if (url.pathname === '/ws')      return handleWS(req);
      if (url.pathname === '/ticks')   return streamTicksSSE();
      if (url.pathname === '/price')   return await handlePrice();
      if (url.pathname === '/proxy'){  const target=url.searchParams.get('url')||''; return await handleProxy(target); }
      if (url.pathname === '/ohlc'){   const tf=clampInt(url.searchParams.get('tf'),60); const lookback=clampInt(url.searchParams.get('lookback'),7200); const out=buildOHLC(tf,lookback); return json({ok:true,tf,candles:out},200,5); }
      if (url.pathname === '/snapshot'){ const price = await medianLivePrice(); const m1=buildOHLC(60,7200); const m5=buildOHLC(300,6*3600); return json({ok:true,price,m1,m5,isoTime:new Date().toISOString()}); }
      if (url.pathname==='/'||url.pathname==='/health') return json({ok:true,service:'goldprice-proxy',addOns:['ws','ticks','ohlc','snapshot']},200,5);
      if (url.pathname === '/last')    return json(TICKS.length?TICKS[TICKS.length-1]:{}, 200);
      return json({ok:true,usage:['/ws (WebSocket)','/ticks (SSE)','/price','/proxy?url=...','/last','/ohlc?tf=300&lookback=21600','/snapshot']});
    }catch(e){ return json({ok:false,error:String(e?.message||e)},500); }
  }
};
