/* GoldSignals app.js v3 — auto-run + historical fallbacks + live merge + CSV export */
const SSE_URL = 'https://gold-ticks.samer-mourtada.workers.dev/ticks';
const WORKER_BASE = 'https://gold-ticks.samer-mourtada.workers.dev';
const DEFAULT_5M_CSV = 'XAUUSD_5min.csv';
const STQ_CSV = 'https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv';

const LIVE_SOURCES = [
  WORKER_BASE + '/price',
  'https://api.metals.live/v1/spot/gold',
];

const LIVE_REFRESH_SEC = 1;
const MAX_JUMP_PCT = 2.0;
const TABLE_ROWS = 80;

const $ = (id)=>document.getElementById(id);

const elCsvInput=$('csvInput'), elBtnRun=$('runBtn'), elDl=$('dlCsvBtn');
const elConn=$('connStatus'), elCsvAge=$('csvAge');
const elTf5=$('tf5'), elTf30=$('tf30'), elTf60=$('tf60'), elTfD=$('tfD');
const elLivePrice=$('livePrice'), elLiveTime=$('liveTime');
const elSummaryText=$('summaryText');
const elIndRSI=$('indRSI'), elIndMACD=$('indMACD'), elIndEMAF=$('indEMAF'), elIndEMAS=$('indEMAS');
const elRowsBody=$('rowsBody');

const nf2=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function fmtLocalDateTime(ts){const d=new Date(ts);return `${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} ${d.toLocaleDateString('en-CA')}`;}

let currentTF=5, LAST_LIVE=null, __evtSrc=null, sseRetry=0, lastPriceTs=0, __cache=null;

// ---------- helpers ----------
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

// CSV age badge
async function checkCsvAge(url){
  try{
    const txt = await fetchCsvText(url);
    const lines = txt.trim().split(/\r?\n/).filter(Boolean);
    let dateCandidate=null;
    if(lines.length>1){
      const parts = lines[1].split(',');
      const d = parts[0];
      if(d && !isNaN(Date.parse(d))) dateCandidate = Date.parse(d);
      else if(parts[1] && !isNaN(Date.parse(parts[1]))) dateCandidate = Date.parse(parts[1]);
    }
    if(dateCandidate){ const ageHours=(Date.now()-dateCandidate)/3600000;
      elCsvAge.textContent = `CSV: ${Math.round(ageHours)}h`; elCsvAge.className='status '+(ageHours>6?'warn':'ok');
    } else { elCsvAge.textContent='CSV: —'; elCsvAge.className='status'; }
  }catch(e){ elCsvAge.textContent='CSV: —'; elCsvAge.className='status'; }
}

// ---- historical fallbacks ----
async function fetchOhlcFromWorker(tfMin = 5, lookbackSec = 12 * 3600) {
  const tfSec = tfMin * 60;
  const url = `${WORKER_BASE}/ohlc?tf=${tfSec}&lookback=${lookbackSec}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('ohlc http ' + r.status);
  const j = await r.json();
  return j.candles.map(c => ({ ts: c.ts, open: c.open, high: c.high, low: c.low, close: c.close }));
}
async function fetchStooqViaProxy(){
  const url = `${WORKER_BASE}/proxy?url=${encodeURIComponent(STQ_CSV)}`;
  const r = await fetch(url, {cache:'no-store'});
  if(!r.ok) throw new Error('proxy http '+r.status);
  return await r.text();
}
async function loadBaseSeries(tfMin){
  const csvUrl = elCsvInput?.value?.trim();
  try{
    const txt = await fetchCsvText(csvUrl||'');
    const rows = parseCsv(txt);
    if(rows?.length) return tfMin===5? rows : aggregateOHLC(rows, tfMin);
  }catch(e){}
  try{
    const txt = await fetchStooqViaProxy();
    const rows = parseCsv(txt);
    if(rows?.length) return tfMin===5? rows : aggregateOHLC(rows, tfMin);
  }catch(e){ console.warn('proxy stooq failed', e); }
  return await fetchOhlcFromWorker(tfMin, 12*3600);
}

// ---------- SSE + polling ----------
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
    __evtSrc.onerror = ()=>{ try{__evtSrc.close();}catch{}; __evtSrc=null; setConnStatus('SSE قطع — محاولة','bad'); scheduleSSEReconnect(); };
  }catch(e){ scheduleSSEReconnect(); }
}
function scheduleSSEReconnect(){
  sseRetry++; const wait = Math.min(60, Math.pow(1.8, Math.min(sseRetry,8)));
  setConnStatus(`SSE يحاول خلال ${Math.round(wait)}s`,'warn');
  setTimeout(()=>{ if(!__evtSrc) startSSE(); }, Math.round(wait*1000));
}
async function fetchLiveFallback(){
  try{
    const vals = await Promise.allSettled(LIVE_SOURCES.map(u=>fetchJson(u,2000)));
    const nums = vals.filter(x=>x.status==='fulfilled').map(x=>{
      const v=x.value; if(Array.isArray(v)&&Number.isFinite(v[0])) return +v[0];
      if(v&&Number.isFinite(v.price)) return +v.price; return NaN;
    }).filter(Number.isFinite);
    if(!nums.length) throw new Error('no sources');
    const avg = nums.reduce((a,b)=>a+b,0)/nums.length;
    const clean = nums.filter(v=>Math.abs(v-avg)/avg<0.01);
    const arr = clean.length?clean:nums; arr.sort((a,b)=>a-b);
    const median = arr[Math.floor(arr.length/2)];
    handleLiveTick(median, Date.now());
    setConnStatus('Polling','ok');
  }catch(e){ setConnStatus('Polling فشل','bad'); }
}

// ---------- live merge ----------
function handleLiveTick(price, timeMs){
  if(!Number.isFinite(price)) return;
  const prev = window.__livePrice;
  if(Number.isFinite(prev) && (Date.now()-lastPriceTs)<5000){
    const pct = Math.abs(price-prev)/prev*100;
    if(pct > MAX_JUMP_PCT) return;
  }
  window.__livePrice = price; window.__liveTimeMs = timeMs; LAST_LIVE = {price, timeMs}; lastPriceTs = Date.now();
  paintLive(price, timeMs);
  reprojectWithLive();
}
function paintLive(price, ts){ if(elLivePrice&&Number.isFinite(price)) elLivePrice.textContent = nf2.format(price); if(elLiveTime&&ts) elLiveTime.textContent = fmtLocalDateTime(ts); }

// indicators
function ema(series,p){const out=new Array(series.length).fill(null), k=2/(p+1); let e=null,sum=0; for(let i=0;i<series.length;i++){const v=series[i].close; if(i<p){sum+=v;if(i===p-1){e=sum/p;out[i]=e;}} else{e=v*k+e*(1-k);out[i]=e;}} return out;}
function rsi(series,period=14){const out=new Array(series.length).fill(null); if(series.length<=period) return out; let g=0,l=0; for(let i=1;i<=period;i++){const d=series[i].close-series[i-1].close; if(d>=0)g+=d; else l-=d;} let ag=g/period, al=l/period; out[period]=al===0?100:100-(100/(1+(ag/al))); for(let i=period+1;i<series.length;i++){const d=series[i].close-series[i-1].close, G=d>0?d:0, L=d<0?-d:0; ag=(ag*(period-1)+G)/period; al=(al*(period-1)+L)/period; out[i]=al===0?100:100-(100/(1+(ag/al)));} return out;}
function macd(series,fast=12,slow=26,signal=9){const emaF=ema(series,fast), emaS=ema(series,slow); const m=series.map((_,i)=> (emaF[i]==null||emaS[i]==null)?null:emaF[i]-emaS[i]); const pts=m.map((v,i)=>({ts:series[i].ts,close:(v==null)?NaN:v})), clean=pts.filter(p=>Number.isFinite(p.close)); const sigClean=ema(clean,signal), sigFull=new Array(series.length).fill(null); for(let i=0,j=0;i<series.length;i++){ if(Number.isFinite(pts[i]?.close)) sigFull[i]=sigClean[j++]; } return {emaF,emaS,macd:m,signal:sigFull};}
function atr(series,period=14){ if(!series?.length) return []; const tr=new Array(series.length).fill(null); for(let i=0;i<series.length;i++){const h=series[i].high,l=series[i].low; if(i===0){tr[i]=h-l;continue;} const pc=series[i-1].close; tr[i]=Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc));} const out=new Array(series.length).fill(null); let sum=0; for(let i=0;i<series.length;i++){const v=tr[i]; if(i<period){sum+=v;if(i===period-1) out[i]=sum/period;} else out[i]=(out[i-1]*(period-1)+v)/period;} return out;}

// parse & aggregate
function parseCsv(text){ const lines=text.trim().split(/\r?\n/); if(!lines.length) return []; const header=lines[0].toLowerCase(); const out=[]; if(header.includes('symbol')&&header.includes('date')&&header.includes('time')){ for(let i=1;i<lines.length;i++){const parts=lines[i].split(','); const d=parts[1], t=parts[2], o=+parts[3], h=+parts[4], l=+parts[5], c=+parts[6]; if(!d||!t) continue; const ts=Date.parse(`${d}T${t}Z`); if(Number.isFinite(ts)&&Number.isFinite(c)) out.push({ts,open:Number.isFinite(o)?o:c,high:Number.isFinite(h)?h:c,low:Number.isFinite(l)?l:c,close:c}); } } else { for(let i=1;i<lines.length;i++){const [d,c]=lines[i].split(','); const ts=Date.parse(d), close=+c; if(Number.isFinite(ts)&&Number.isFinite(close)) out.push({ts,open:close,high:close,low:close,close}); } } out.sort((a,b)=>a.ts-b.ts); return out; }
function aggregateOHLC(rows, minutes){ const ms=minutes*60*1000, map=new Map(); for(const r of rows){const b=Math.floor(r.ts/ms)*ms; let rec=map.get(b); if(!rec){rec={ts:b,open:r.open,high:r.high,low:r.low,close:r.close};map.set(b,rec);} else{rec.high=Math.max(rec.high,r.high);rec.low=Math.min(rec.low,r.low);rec.close=r.close;} } return [...map.values()].sort((a,b)=>a.ts-b.ts); }

// signal + chart
function filteredSignal(tf,series,rsiArr,mac,atrArr){ const i=series.length-1; if(i<1) return 'حيادي'; const emaFast=mac.emaF[i], emaSlow=mac.emaS[i], r=rsiArr[i]; if(emaFast!=null && emaSlow!=null){ if(emaFast>emaSlow && r>55) return 'شراء'; if(emaFast<emaSlow && r<45) return 'بيع'; } return 'حيادي'; }

function renderTradeChart(series, lines){
  const cv = document.getElementById('tradeChart'); if(!cv||!series?.length) return;
  const ctx = cv.getContext('2d'); const W=cv.width=cv.clientWidth, H=cv.height=cv.clientHeight;
  ctx.clearRect(0,0,W,H);
  const N = Math.min(series.length, 200);
  const data = series.slice(-N);
  const min = Math.min(...data.map(d=>d.low)), max=Math.max(...data.map(d=>d.high));
  const x = (i)=> i/(N-1)*W; const y = (v)=> H-( (v-min)/(max-min) )*H;
  ctx.lineWidth=1.2; ctx.beginPath();
  data.forEach((d,i)=>{ const yy=y(d.close); if(i===0) ctx.moveTo(x(i),yy); else ctx.lineTo(x(i),yy); });
  ctx.strokeStyle='#cbd5e1'; ctx.stroke();
  if(window.__livePrice){ ctx.strokeStyle='#ffffff'; ctx.beginPath(); const yy=y(window.__livePrice); ctx.moveTo(0,yy); ctx.lineTo(W,yy); ctx.stroke(); }
  if(lines){ ctx.strokeStyle='#3b82f6'; if(lines.entry){ ctx.beginPath(); ctx.moveTo(0,y(lines.entry)); ctx.lineTo(W,y(lines.entry)); ctx.stroke(); }
    ctx.strokeStyle='#ef4444'; if(lines.sl){ ctx.beginPath(); ctx.moveTo(0,y(lines.sl)); ctx.lineTo(W,y(lines.sl)); ctx.stroke(); }
    ctx.strokeStyle='#10b981'; if(lines.tp1){ ctx.beginPath(); ctx.moveTo(0,y(lines.tp1)); ctx.lineTo(W,y(lines.tp1)); ctx.stroke(); }
    ctx.strokeStyle='#10b981'; if(lines.tp2){ ctx.beginPath(); ctx.moveTo(0,y(lines.tp2)); ctx.lineTo(W,y(lines.tp2)); ctx.stroke(); } }
}

function buildAndRender(series){
  const rsiArr=rsi(series,14), mac=macd(series,12,26,9), atrArr=atr(series,14);
  const i=series.length-1;
  elIndRSI.textContent = rsiArr[i]? nf2.format(rsiArr[i]) : '—';
  elIndMACD.textContent = (mac.macd[i]!=null && mac.signal[i]!=null) ? nf2.format(mac.macd[i]-mac.signal[i]) : '—';
  elIndEMAF.textContent = mac.emaF[i]? nf2.format(mac.emaF[i]) : '—';
  elIndEMAS.textContent = mac.emaS[i]? nf2.format(mac.emaS[i]) : '—';
  const sig = filteredSignal(currentTF,series,rsiArr,mac,atrArr);
  elSummaryText.textContent = sig;
  renderTradeChart(series,null);
  elRowsBody.innerHTML='';
  const lastN = series.slice(-TABLE_ROWS);
  for(const r of lastN.reverse()){
    const idx = series.indexOf(r);
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${new Date(r.ts).toLocaleDateString('en-CA')}</td>
      <td>${new Date(r.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</td>
      <td>${nf2.format(r.close)}</td>
      <td>${sig}</td>
      <td>${rsiArr[idx]?nf2.format(rsiArr[idx]):'—'}</td>
      <td>${mac.macd[idx]!=null?nf2.format(mac.macd[idx]):'—'}</td>
      <td>${mac.emaF[idx]?nf2.format(mac.emaF[idx]):'—'}</td>`;
    elRowsBody.appendChild(tr);
  }
  __cache = {tf:currentTF, base:series};
}

function reprojectWithLive(){
  if(!__cache||!LAST_LIVE) return;
  const {tf, base} = __cache;
  const series=mergeLiveIntoSeries(base,tf,LAST_LIVE);
  buildAndRender(series);
}

function mergeLiveIntoSeries(series,tfMin,live){
  if(!series?.length||!live) return series; const ms=tfMin*60*1000;
  const b=Math.floor(live.timeMs/ms)*ms; const out=series.slice(), last={...out[out.length-1]};
  if(b===last.ts){ last.close=live.price; last.high=Math.max(last.high,live.price); last.low=Math.min(last.low,live.price); out[out.length-1]=last; }
  else if(b>last.ts){ out.push({ts:b,open:last.close,high:live.price,low:live.price,close:live.price}); }
  return out;
}

async function runAnalysis(){
  try{
    const base = await loadBaseSeries(currentTF);
    buildAndRender(base);
  }catch(e){
    elSummaryText.textContent = 'خطأ تحميل البيانات';
    console.error(e);
  }
}

// CSV export (merged)
function downloadMergedCsv(){
  if (!__cache) { alert('شغّل "حساب الإشارات الآن" أولاً'); return; }
  const { tf, base } = __cache;
  const merged = LAST_LIVE ? mergeLiveIntoSeries(base, tf, LAST_LIVE) : base;
  let csv = 'Date,Open,High,Low,Close\n';
  for (const r of merged) {
    csv += `${new Date(r.ts).toISOString()},${r.open},${r.high},${r.low},${r.close}\n';
  }
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `XAUUSD_${tf}min_merged.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// UI bindings
function setActiveTF(tf){ currentTF = tf; [elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active')); if(tf===5)elTf5?.classList?.add('active'); if(tf===30)elTf30?.classList?.add('active'); if(tf===60)elTf60?.classList?.add('active'); if(tf===1440)elTfD?.classList?.add('active'); }
elTf5?.addEventListener('click',()=>{setActiveTF(5); runAnalysis();});
elTf30?.addEventListener('click',()=>{setActiveTF(30); runAnalysis();});
elTf60?.addEventListener('click',()=>{setActiveTF(60); runAnalysis();});
elTfD?.addEventListener('click',()=>{setActiveTF(1440); runAnalysis();});
elBtnRun?.addEventListener('click', runAnalysis);
elDl?.addEventListener('click', downloadMergedCsv);

// init
setActiveTF(5);
checkCsvAge('');
startSSE();
setTimeout(runAnalysis, 400); // تشغيل تلقائي بعد الفتح
setInterval(()=>{ if(!__evtSrc){ fetchLiveFallback(); } }, LIVE_REFRESH_SEC*1000);
