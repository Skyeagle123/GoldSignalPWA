
/* GoldSignals Worker v3.1 — WS + SSE + REST (stooq only)
   - Removed metals.live source per request (was flaky).
   - Primary source: Stooq CSV for XAUUSD.
   - Endpoints: /ws, /ticks, /price, /last, /ohlc, /snapshot, /health
*/

const STQ_URL = 'https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv';
const LIVE_SOURCES = [
  // Stooq only (stable)
  'https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv'
];
const LIVE_TIMEOUT_MS = 2500;
const TICK_RING_MAX = 3600; // ~1h
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

function parseStooqCSV(text){
  const lines=(text||'').trim().split('\n').filter(Boolean);
  const row = lines.length===1?lines[0]:lines[1];
  const parts = (row||'').split(',');
  // s,d,t,o,h,l,c,v
  const symbol = parts[0];
  const date = parts[1];
  const time = parts[2];
  const close = Number(parts[6]);
  return { symbol, date, time, close };
}

async function medianLivePrice(){
  // With single source, just return stooq close
  const out = await fetchWithTimeout(STQ_URL).catch(()=>null);
  if (typeof out === 'string'){
    const { close } = parseStooqCSV(out);
    if (Number.isFinite(close)) return close;
  }
  throw new Error('no live price');
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

// ---------- WebSocket server (/ws) ----------
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

// ---------- SSE stream (/ticks) ----------
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

// ---------- REST: /price, /last, /ohlc, /snapshot ----------
async function handlePrice(){
  try{
    const res = await fetch(STQ_URL, { cf: { cacheTtl: 5, cacheEverything: true } });
    if(!res.ok) return json({ok:false,status:res.status}, 502);
    const csv = (await res.text()).trim();
    const { symbol, date, time, close } = parseStooqCSV(csv);
    const price = Number(close);
    const iso = toISO(date, time);
    const ts = Date.parse(iso);
    const body = { ok:true, source:'stooq', symbol, price, close: price, date, time, isoTime: iso, ts: isFinite(ts)?ts:Date.now() };
    pushTick(price, isFinite(ts)?ts:Date.now());
    return json(body);
  }catch(e){
    return json({ok:false,error:String(e?.message||e)}, 500);
  }
}

export default {
  async fetch(req){
    const url = new URL(req.url);
    if(req.method==='OPTIONS') return new Response(null,{headers:cors()});
    try{
      if (url.pathname === '/ws')      return handleWS(req);
      if (url.pathname === '/ticks')   return streamTicksSSE();
      if (url.pathname === '/price')   return await handlePrice();
      if (url.pathname === '/ohlc'){   const tf=clampInt(url.searchParams.get('tf'),60); const lookback=clampInt(url.searchParams.get('lookback'),7200); const out=buildOHLC(tf,lookback); return json({ok:true,tf,candles:out},200,5); }
      if (url.pathname === '/snapshot'){ const price = await medianLivePrice(); const m1=buildOHLC(60,7200); const m5=buildOHLC(300,6*3600); return json({ok:true,price,m1,m5,isoTime:new Date().toISOString()}); }
      if (url.pathname === '/last')    return json(TICKS.length?TICKS[TICKS.length-1]:{}, 200);
      if (url.pathname==='/'||url.pathname==='/health') return json({ok:true,service:'goldprice-proxy',sources:['stooq'],addOns:['ws','ticks','ohlc','snapshot']},200,5);
      return json({ok:true,usage:['/ws (WebSocket)','/ticks (SSE)','/price','/last','/ohlc?tf=300&lookback=21600','/snapshot']});
    }catch(e){ return json({ok:false,error:String(e?.message||e)},500); }
  }
};
