/* GoldSignals v2 - improved SSE reconnection, sanity checks, CSV age warning, notifications */

const LIVE_SOURCES = [
  'https://goldprice-proxy.samer-mourtada.workers.dev/price',
  'https://api.metals.live/v1/spot/gold',
];

const SSE_URL = 'https://gold-ticks.samer-mourtada.workers.dev/ticks';
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const LIVE_REFRESH_SEC = 1;
const TABLE_ROWS       = 80;

const $=(id)=>document.getElementById(id);

/* DOM */
const elCsvInput=$('csvInput'), elBtnRun=$('runBtn');
const elConn=$('connStatus'), elCsvAge=$('csvAge');
const elTf5=$('tf5'), elTf30=$('tf30'), elTf60=$('tf60'), elTfD=$('tfD');
const elProMode=$('proMode'), elMtfConfirm=$('mtfConfirm');
const elLivePrice=$('livePrice'), elLiveTime=$('liveTime');
const elSummaryText=$('summaryText'), elAdviceText=$('adviceText');
const elIndRSI=$('indRSI'), elIndMACD=$('indMACD'), elIndEMAF=$('indEMAF'), elIndEMAS=$('indEMAS');
const elRowsBody=$('rowsBody');

/* formats */
const nf2=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const dtfNY=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
function fmtLocalDateTime(ts){const d=new Date(ts);return `${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} ${d.toLocaleDateString('en-CA')}`;}

/* settings */
let ATR_MIN_PCT=0.05, ATR_MAX_PCT=0.80;
let PRO_MODE=false, MTF_CONFIRM=true;
let currentTF=5;

/* live */
let LAST_LIVE = null;
let __cache=null;
let __evtSrc=null;
let sseRetry=0;
let lastPriceTs=0;
let lastCsvTs=null;

/* sanity params */
const MAX_JUMP_PCT = 2.0; // ignore spikes > 2% per second

/* helpers */
async function fetchJson(url, timeout=2500){
  const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(), timeout);
  try{ const r=await fetch(url,{signal:ctl.signal}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
  finally{ clearTimeout(to); }
}

async function fetchCsvText(url){
  const u=(url&&url.trim())?url.trim():DEFAULT_5M_CSV; const full=u.startsWith('http')?u:`${u}?t=${Date.now()}`;
  const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(),4000);
  try{ const r=await fetch(full,{signal:ctl.signal}); if(!r.ok) throw new Error('CSV HTTP '+r.status); return await r.text(); }finally{clearTimeout(to);}
}

/* CSV age check */
async function checkCsvAge(url){
  try{
    const txt = await fetchCsvText(url);
    const lines = txt.trim().split(/\r?\n/).filter(Boolean);
    // try to parse first data line date
    let dateCandidate=null;
    if(lines.length>1){
      const parts = lines[1].split(',');
      const d = parts[0];
      if(d && !isNaN(Date.parse(d))) dateCandidate = Date.parse(d);
      else if(parts[1] && !isNaN(Date.parse(parts[1]))) dateCandidate = Date.parse(parts[1]);
    }
    if(dateCandidate){ lastCsvTs = dateCandidate; const ageHours=(Date.now()-dateCandidate)/3600000;
      elCsvAge.textContent = `CSV: ${Math.round(ageHours)}h`; elCsvAge.className='status '+(ageHours>6?'warn':'ok');
    } else { elCsvAge.textContent='CSV: —'; elCsvAge.className='status'; }
  }catch(e){ elCsvAge.textContent='CSV: خطأ'; elCsvAge.className='status bad'; }
}

// Continued: rest of file from earlier attempt

/* SSE + fallback with backoff */
function setConnStatus(text,cls){ if(elConn){ elConn.textContent = `الاتصال: ${text}`; elConn.className = 'status '+(cls||''); } }
function startSSE(){
  try{
    if(__evtSrc) try{ __evtSrc.close(); }catch{}
    __evtSrc = new EventSource(SSE_URL);
    __evtSrc.onopen = ()=>{ sseRetry=0; setConnStatus('SSE متصل','ok'); };
    __evtSrc.onmessage = (ev)=>{
      try{
        const j = JSON.parse(ev.data);
        if(Number.isFinite(j.price)) handleLiveTick(j.price, j.timeMs||Date.now());
      }catch(e){}
    };
    __evtSrc.onerror = (ev)=>{ try{__evtSrc.close();}catch{}; __evtSrc=null; setConnStatus('SSE قطع — سيتم المحاولة','bad'); scheduleSSEReconnect(); };
  }catch(e){ scheduleSSEReconnect(); }
}
function scheduleSSEReconnect(){
  sseRetry++; const wait = Math.min(60, Math.pow(1.8, Math.min(sseRetry,8))); // backoff up to ~60s
  setConnStatus(`SSE يحاول الاتصال خلال ${Math.round(wait)}s`,'warn');
  setTimeout(()=>{ if(!__evtSrc) startSSE(); }, Math.round(wait*1000));
}
async function fetchLiveFallback(){
  try{
    const vals = await Promise.allSettled(LIVE_SOURCES.map(u=>fetchJson(u,2000)));
    const nums = vals.filter(x=>x.status==='fulfilled').map(x=>{ const v=x.value; if(Array.isArray(v)&&Number.isFinite(v[0])) return +v[0]; if(v&&Number.isFinite(v.price)) return +v.price; return NaN; }).filter(Number.isFinite);
    if(!nums.length) throw new Error('no sources');
    const avg = nums.reduce((a,b)=>a+b,0)/nums.length; const clean = nums.filter(v=>Math.abs(v-avg)/avg<0.01); const arr = clean.length?clean:nums; arr.sort((a,b)=>a-b); const median = arr[Math.floor(arr.length/2)];
    handleLiveTick(median, Date.now());
    setConnStatus('Polling','ok');
  }catch(e){ setConnStatus('Polling فشل','bad'); }
}

/* handle live tick with sanity */
function handleLiveTick(price, timeMs){
  if(!Number.isFinite(price)) return;
  const prev = window.__livePrice;
  if(Number.isFinite(prev) && lastPriceTs && (Date.now()-lastPriceTs)<5000){
    const pct = Math.abs(price-prev)/prev*100;
    if(pct > MAX_JUMP_PCT){
      console.warn('Ignored spike', pct); return;
    }
  }
  window.__livePrice = price; window.__liveTimeMs = timeMs; LAST_LIVE = {price, timeMs}; lastPriceTs = Date.now();
  paintLive(price, timeMs);
  maybeNotify(price);
  reprojectWithLive();
}

/* UI painting */
function paintLive(price, ts){ if(elLivePrice&&Number.isFinite(price)) elLivePrice.textContent = nf2.format(price); if(elLiveTime&&ts) elLiveTime.textContent = fmtLocalDateTime(ts); }

/* simple notify */
function maybeNotify(price){
  try{
    const alertEnable = document.getElementById('alertEnable')?.checked;
    if(!alertEnable) return;
    if(!('Notification' in window)) return;
    if(Notification.permission !== 'granted'){ Notification.requestPermission(); return; }
    const lines = window.__lastLinesForChart;
    if(!lines) return;
    const dist = parseFloat(document.getElementById('alertDistance')?.value||0.5);
    const entry = lines.entry;
    if(Number.isFinite(entry) && Math.abs(price-entry) <= Math.max(dist, 0.25*(window.__lastAtr||1))){
      new Notification('GoldSignals', { body: `سعر قريب من نقطة الدخول: ${nf2.format(price)}` });
    }
  }catch(e){}
}

/* minimal analysis placeholders */
function setActiveTF(tf){ currentTF = tf; [elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active')); if(tf===5)elTf5?.classList?.add('active'); if(tf===30)elTf30?.classList?.add('active'); if(tf===60)elTf60?.classList?.add('active'); if(tf===1440)elTfD?.classList?.add('active'); }
function reprojectWithLive(){ try{ if(!__cache||!LAST_LIVE) return; const {tf,base,rows5,rows30,rows60,piv}=__cache; const series=mergeLiveIntoSeries(window.__lastBaseSeries||base,tf,LAST_LIVE); const rsiArr=rsi(series,14), mac=macd(series,12,26,9), atrArr=atr(series,14); const stoch=null, bb=null; const i=series.length-1, px=series[i].close, sig=filteredSignal(tf,series,rsiArr,mac,atrArr,rows5,rows30,rows60,piv,stoch,bb), aNow=atrArr?.[i]??0.5, emaS=mac.emaS[i]; let entry=null; if(sig==='شراء') entry=Math.max(px,Number.isFinite(emaS)?emaS:px); else if(sig==='بيع') entry=Math.min(px,Number.isFinite(emaS)?emaS:px); entry=adjustEntry(entry,px,aNow,sig); const lines=(sig==='حيادي')?undefined:{entry, sl: sig==='شراء'? entry-1.5*aNow : entry+1.5*aNow, tp1: sig==='شراء'? entry+1.0*aNow: entry-1.0*aNow, tp2: sig==='شراء'? entry+2.0*aNow: entry-2.0*aNow}; window.__lastSeriesForChart=series; window.__lastLinesForChart=lines; window.__lastAtr=aNow; renderTradeChart(series,lines); if(elAdviceText) elAdviceText.textContent = buildAdvice(tf,series,rsiArr,mac,piv,LAST_LIVE,atrArr,rows5,rows30,rows60,stoch,bb); }catch(e){console.warn(e);} }

/* minimal indicator functions */
function ema(series,p){const out=new Array(series.length).fill(null), k=2/(p+1); let e=null,sum=0; for(let i=0;i<series.length;i++){const v=series[i].close; if(i<p){sum+=v;if(i===p-1){e=sum/p;out[i]=e;}} else{e=v*k+e*(1-k);out[i]=e;}} return out;}
function rsi(series,period=14){const out=new Array(series.length).fill(null); if(series.length<=period) return out; let g=0,l=0; for(let i=1;i<=period;i++){const d=series[i].close-series[i-1].close; if(d>=0)g+=d; else l-=d;} let ag=g/period, al=l/period; out[period]=al===0?100:100-(100/(1+(ag/al))); for(let i=period+1;i<series.length;i++){const d=series[i].close-series[i-1].close, G=d>0?d:0, L=d<0?-d:0; ag=(ag*(period-1)+G)/period; al=(al*(period-1)+L)/period; out[i]=al===0?100:100-(100/(1+(ag/al)));} return out;}
function macd(series,fast=12,slow=26,signal=9){const emaF=ema(series,fast), emaS=ema(series,slow); const m=series.map((_,i)=> (emaF[i]==null||emaS[i]==null)?null:emaF[i]-emaS[i]); const pts=m.map((v,i)=>({ts:series[i].ts,close:(v==null)?NaN:v})), clean=pts.filter(p=>Number.isFinite(p.close)); const sigClean=ema(clean,signal), sigFull=new Array(series.length).fill(null); for(let i=0,j=0;i<series.length;i++){ if(Number.isFinite(pts[i]?.close)) sigFull[i]=sigClean[j++]; } return {emaF,emaS,macd:m,signal:sigFull};}
function atr(series,period=14){ if(!series?.length) return []; const tr=new Array(series.length).fill(null); for(let i=0;i<series.length;i++){const h=series[i].high,l=series[i].low; if(i===0){tr[i]=h-l;continue;} const pc=series[i-1].close; tr[i]=Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc));} const out=new Array(series.length).fill(null); let sum=0; for(let i=0;i<series.length;i++){const v=tr[i]; if(i<period){sum+=v;if(i===period-1) out[i]=sum/period;} else out[i]=(out[i-1]*(period-1)+v)/period;} return out;}

/* parseCsv, aggregateOHLC, mergeLiveIntoSeries (re-used) */
function parseCsv(text){ const lines=text.trim().split(/\r?\n/); if(!lines.length) return []; const header=lines[0].toLowerCase(); const out=[]; if(header.includes('symbol')&&header.includes('date')&&header.includes('time')){ for(let i=1;i<lines.length;i++){const parts=lines[i].split(','); const sym=parts[0], d=parts[1], t=parts[2], o=parts[3], h=parts[4], l=parts[5], c=parts[6]; if(!d||!t) continue; const ts=Date.parse(`${d}T${t}Z`); const open=+o,high=+h,low=+l,close=+c; if(Number.isFinite(ts)&&Number.isFinite(close)) out.push({ts,open:Number.isFinite(open)?open:close,high:Number.isFinite(high)?high:close,low:Number.isFinite(low)?low:close,close}); } } else { for(let i=1;i<lines.length;i++){const [d,c]=lines[i].split(','); const ts=Date.parse(d), close=+c; if(Number.isFinite(ts)&&Number.isFinite(close)) out.push({ts,open:close,high:close,low:close,close}); } } out.sort((a,b)=>a.ts-b.ts); return out; }
function aggregateOHLC(rows, minutes){ const ms=minutes*60*1000, map=new Map(); for(const r of rows){const b=Math.floor(r.ts/ms)*ms; let rec=map.get(b); if(!rec){rec={ts:b,open:r.open,high:r.high,low:r.low,close:r.close};map.set(b,rec);} else{rec.high=Math.max(rec.high,r.high);rec.low=Math.min(rec.low,r.low);rec.close=r.close;} } return [...map.values()].sort((a,b)=>a.ts-b.ts); }
function mergeLiveIntoSeries(series,tfMin,live){ if(!series?.length||!live) return series; const ms=tfMin*60*1000, b=Math.floor(live.timeMs/ms)*ms; const out=series.slice(), last={...out[out.length-1]}; if(b===last.ts){last.close=live.price; last.high=Math.max(last.high,live.price); last.low=Math.min(last.low,live.price); out[out.length-1]=last;} else if(b>last.ts){out.push({ts:b,open:last.close,high:live.price,low:live.price,close:live.price});} return out; }

/* drawing helper reused earlier: renderTradeChart (already defined) */

/* init */
setActiveTF(5);
startSSE();
setInterval(()=>{ if(!__evtSrc){ fetchLiveFallback(); } }, LIVE_REFRESH_SEC*1000);
