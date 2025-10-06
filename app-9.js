/* GoldSignals app.js — SSE + loaders + live-merge + Excel-friendly CSV export */
const SSE_URL = 'https://gold-ticks.samer-mourtada.workers.dev/ticks';
const WORKER_BASE = 'https://gold-ticks.samer-mourtada.workers.dev';
const DEFAULT_5M_CSV = 'XAUUSD_5min.csv';
const STQ_CSV = 'https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv';
const TABLE_ROWS = 80;
const MAX_JUMP_PCT = 2.0;

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
function fmtExcel(ts){const d=new Date(ts);const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;}

let currentTF=5, LAST_LIVE=null, __evtSrc=null, lastPriceTs=0, __cache=null;

// ---------- data loaders ----------
async function fetchCsvText(url){
  const u=(url&&url.trim())?url.trim():DEFAULT_5M_CSV; const full=u.startsWith('http')?u:`${u}?t=${Date.now()}`;
  const r=await fetch(full, {cache:'no-store'}); if(!r.ok) throw new Error('CSV HTTP '+r.status); return await r.text();
}
async function fetchStooqViaProxy(){
  const url = `${WORKER_BASE}/proxy?url=${encodeURIComponent(STQ_CSV)}`;
  const r = await fetch(url, {cache:'no-store'}); if(!r.ok) throw new Error('proxy http '+r.status); return await r.text();
}
async function fetchOhlcFromWorker(tfMin = 5, lookbackSec = 12 * 3600) {
  const tfSec = tfMin * 60; const url = `${WORKER_BASE}/ohlc?tf=${tfSec}&lookback=${lookbackSec}`;
  const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('ohlc http ' + r.status);
  const j = await r.json(); return j.candles.map(c => ({ ts:c.ts, open:c.open, high:c.high, low:c.low, close:c.close }));
}
async function loadBaseSeries(tfMin){
  const csvUrl = elCsvInput?.value?.trim();
  try{ const txt = await fetchCsvText(csvUrl||''); const rows=parseCsv(txt); if(rows?.length) return tfMin===5?rows:aggregateOHLC(rows,tfMin); }catch{}
  try{ const txt = await fetchStooqViaProxy(); const rows=parseCsv(txt); if(rows?.length) return tfMin===5?rows:aggregateOHLC(rows,tfMin); }catch{}
  return await fetchOhlcFromWorker(tfMin, 12*3600);
}

// ---------- SSE live ----------
function setConnStatus(text,cls){ if(elConn){ elConn.textContent=`الاتصال: ${text}`; elConn.className='status '+(cls||''); } }
function startSSE(){
  try{ if(__evtSrc) __evtSrc.close(); __evtSrc=new EventSource(SSE_URL);
    __evtSrc.onopen=()=>{ setConnStatus('SSE متصل','ok'); };
    __evtSrc.onmessage=(ev)=>{ try{ const j=JSON.parse(ev.data); if(Number.isFinite(j.price)) handleLiveTick(j.price, j.timeMs||Date.now()); }catch{} };
    __evtSrc.onerror=()=>{ try{__evtSrc.close();}catch{}; __evtSrc=null; setConnStatus('SSE قطع','bad'); };
  }catch{ setConnStatus('SSE خطأ','bad'); }
}
function handleLiveTick(price, timeMs){
  if(!Number.isFinite(price)) return;
  const prev = window.__livePrice;
  if(Number.isFinite(prev) && (Date.now()-lastPriceTs)<5000){
    const pct = Math.abs(price-prev)/prev*100; if(pct>MAX_JUMP_PCT) return;
  }
  window.__livePrice=price; LAST_LIVE={price, timeMs}; lastPriceTs=Date.now();
  if(elLivePrice) elLivePrice.textContent=nf2.format(price);
  if(elLiveTime) elLiveTime.textContent=fmtLocalDateTime(timeMs);
  reprojectWithLive();
}

// ---------- indicators ----------
function ema(series,p){const out=new Array(series.length).fill(null), k=2/(p+1); let e=null,sum=0; for(let i=0;i<series.length;i++){const v=series[i].close; if(i<p){sum+=v;if(i===p-1){e=sum/p;out[i]=e;}} else{e=v*k+e*(1-k);out[i]=e;}} return out;}
function rsi(series,period=14){const out=new Array(series.length).fill(null); if(series.length<=period) return out; let g=0,l=0; for(let i=1;i<=period;i++){const d=series[i].close-series[i-1].close; if(d>=0)g+=d; else l-=d;} let ag=g/period, al=l/period; out[period]=al===0?100:100-(100/(1+(ag/al))); for(let i=period+1;i<series.length;i++){const d=series[i].close-series[i-1].close, G=d>0?d:0, L=d<0?-d:0; ag=(ag*(period-1)+G)/period; al=(al*(period-1)+L)/period; out[i]=al===0?100:100-(100/(1+(ag/al)));} return out;}
function macd(series,fast=12,slow=26,signal=9){const emaF=ema(series,fast), emaS=ema(series,slow); const m=series.map((_,i)=> (emaF[i]==null||emaS[i]==null)?null:emaF[i]-emaS[i]); const pts=m.map((v,i)=>({ts:series[i].ts,close:(v==null)?NaN:v})), clean=pts.filter(p=>Number.isFinite(p.close)); const sigClean=ema(clean,signal), sigFull=new Array(series.length).fill(null); for(let i=0,j=0;i<series.length;i++){ if(Number.isFinite(pts[i]?.close)) sigFull[i]=sigClean[j++]; } return {emaF,emaS,macd:m,signal:sigFull};}
function atr(series,period=14){ if(!series?.length) return []; const tr=new Array(series.length).fill(null); for(let i=0;i<series.length;i++){const h=series[i].high,l=series[i].low; if(i===0){tr[i]=h-l;continue;} const pc=series[i-1].close; tr[i]=Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc));} const out=new Array(series.length).fill(null); let sum=0; for(let i=0;i<series.length;i++){const v=tr[i]; if(i<period){sum+=v;if(i===period-1) out[i]=sum/period;} else out[i]=(out[i-1]*(period-1)+v)/period;} return out;}

// ---------- parse & aggregate ----------
function parseCsv(text){ const lines=text.trim().split(/\r?\n/); if(!lines.length) return []; const header=lines[0].toLowerCase(); const out=[]; if(header.includes('symbol')&&header.includes('date')&&header.includes('time')){ for(let i=1;i<lines.length;i++){const parts=lines[i].split(','); const d=parts[1], t=parts[2], o=+parts[3], h=+parts[4], l=+parts[5], c=+parts[6]; if(!d||!t) continue; const ts=Date.parse(`${d}T${t}Z`); if(Number.isFinite(ts)&&Number.isFinite(c)) out.push({ts,open:Number.isFinite(o)?o:c,high:Number.isFinite(h)?h:c,low:Number.isFinite(l)?l:c,close:c}); } } else { for(let i=1;i<lines.length;i++){const [d,c]=lines[i].split(','); const ts=Date.parse(d), close=+c; if(Number.isFinite(ts)&&Number.isFinite(close)) out.push({ts,open:close,high:close,low:close,close}); } } out.sort((a,b)=>a.ts-b.ts); return out; }
function aggregateOHLC(rows, minutes){ const ms=minutes*60*1000, map=new Map(); for(const r of rows){const b=Math.floor(r.ts/ms)*ms; let rec=map.get(b); if(!rec){rec={ts:b,open:r.open,high:r.high,low:r.low,close:r.close};map.set(b,rec);} else{rec.high=Math.max(rec.high,r.high);rec.low=Math.min(rec.low,r.low);rec.close=r.close;} } return [...map.values()].sort((a,b)=>a.ts-b.ts); }

// ---------- signals + chart + table ----------
function filteredSignal(tf,series,rsiArr,mac,atrArr){ const i=series.length-1; if(i<1) return 'حيادي'; const emaFast=mac.emaF[i], emaSlow=mac.emaS[i], r=rsiArr[i]; if(emaFast!=null && emaSlow!=null){ if(emaFast>emaSlow && r>55) return 'شراء'; if(emaFast<emaSlow && r<45) return 'بيع'; } return 'حيادي'; }

function renderTradeChart(series){
  const cv=document.getElementById('tradeChart'); if(!cv||!series?.length) return;
  const ctx=cv.getContext('2d'); const W=cv.width=cv.clientWidth, H=cv.height=cv.clientHeight;
  ctx.clearRect(0,0,W,H);
  const N=Math.min(series.length,200), data=series.slice(-N);
  const min=Math.min(...data.map(d=>d.low)), max=Math.max(...data.map(d=>d.high));
  const x=i=>i/(N-1)*W, y=v=>H-((v-min)/(max-min))*H;
  ctx.lineWidth=1.2; ctx.beginPath(); data.forEach((d,i)=>{const yy=y(d.close); if(i===0)ctx.moveTo(x(i),yy); else ctx.lineTo(x(i),yy);}); ctx.strokeStyle='#cbd5e1'; ctx.stroke();
  if(window.__livePrice){ ctx.strokeStyle='#ffffff'; ctx.beginPath(); const yy=y(window.__livePrice); ctx.moveTo(0,yy); ctx.lineTo(W,yy); ctx.stroke(); }
}
function fillTable(series, rsiArr, mac){
  if(!elRowsBody) return;
  elRowsBody.innerHTML=''; const lastN=series.slice(-TABLE_ROWS);
  for(const r of lastN.reverse()){
    const idx=series.indexOf(r);
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${new Date(r.ts).toLocaleDateString('en-CA')}</td>
      <td>${new Date(r.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</td>
      <td>${nf2.format(r.close)}</td>
      <td>${elSummaryText?elSummaryText.textContent:''}</td>
      <td>${rsiArr[idx]?nf2.format(rsiArr[idx]):'—'}</td>
      <td>${mac.macd[idx]!=null?nf2.format(mac.macd[idx]):'—'}</td>
      <td>${mac.emaF[idx]?nf2.format(mac.emaF[idx]):'—'}</td>`;
    elRowsBody.appendChild(tr);
  }
}
function buildAndRender(series){
  const rsiArr=rsi(series,14), mac=macd(series,12,26,9), atrArr=atr(series,14);
  const i=series.length-1;
  if(elIndRSI) elIndRSI.textContent = rsiArr[i]? nf2.format(rsiArr[i]) : '—';
  if(elIndMACD) elIndMACD.textContent = (mac.macd[i]!=null && mac.signal[i]!=null) ? nf2.format(mac.macd[i]-mac.signal[i]) : '—';
  if(elIndEMAF) elIndEMAF.textContent = mac.emaF[i]? nf2.format(mac.emaF[i]) : '—';
  if(elIndEMAS) elIndEMAS.textContent = mac.emaS[i]? nf2.format(mac.emaS[i]) : '—';
  const sig = filteredSignal(currentTF,series,rsiArr,mac,atrArr);
  if(elSummaryText) elSummaryText.textContent = sig;
  renderTradeChart(series);
  fillTable(series, rsiArr, mac);
  __cache={tf:currentTF, base:series};
}

// ---------- live merge ----------
function reprojectWithLive(){
  if(!__cache||!LAST_LIVE) return;
  const {tf, base}=__cache; const ms=tf*60*1000; const b=Math.floor(LAST_LIVE.timeMs/ms)*ms;
  const out=base.slice(); const last={...out[out.length-1]};
  if(b===last.ts){ last.close=LAST_LIVE.price; last.high=Math.max(last.high,LAST_LIVE.price); last.low=Math.min(last.low,LAST_LIVE.price); out[out.length-1]=last; }
  else if(b>last.ts){ out.push({ts:b,open:last.close,high:LAST_LIVE.price,low:LAST_LIVE.price,close:LAST_LIVE.price}); }
  buildAndRender(out);
}

// ---------- CSV export (Excel-friendly) ----------
function downloadMergedCsv(){
  if(!__cache){ alert('شغّل التحليل أولاً'); return; }
  const { tf, base } = __cache;
  const merged = LAST_LIVE ? (function(series,live){ const ms=tf*60*1000; const b=Math.floor((live.timeMs||Date.now())/ms)*ms; const out=series.slice(); const last={...out[out.length-1]}; if(b===last.ts){ last.close=live.price; last.high=Math.max(last.high,live.price); last.low=Math.min(last.low,live.price); out[out.length-1]=last; } else if(b>last.ts){ out.push({ts:b,open:last.close,high:live.price,low:live.price,close:live.price}); } return out; })(base,LAST_LIVE) : base;

  const DELIM = ';'; // semicolon for locales where comma is decimal
  const CRLF = '\r\n';
  const header = ['Date','Open','High','Low','Close'];
  const rows = merged.map(r => [fmtExcel(r.ts), r.open, r.high, r.low, r.close]);

  function q(v){ const s=String(v).replace(/"/g,'""'); return `"${s}"`; }
  const csv = [header.map(q).join(DELIM)].concat(rows.map(row=>row.map(q).join(DELIM))).join(CRLF) + CRLF;

  const BOM = '\ufeff';
  const blob = new Blob([BOM + csv], {type:'application/vnd.ms-excel;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`XAUUSD_${tf}min_merged.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ---------- UI wiring ----------
function setActiveTF(tf){ currentTF=tf;
  [elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));
  if(tf===5)elTf5?.classList?.add('active'); if(tf===30)elTf30?.classList?.add('active'); if(tf===60)elTf60?.classList?.add('active'); if(tf===1440)elTfD?.classList?.add('active');
}
elTf5?.addEventListener('click',()=>{setActiveTF(5); runAnalysis();});
elTf30?.addEventListener('click',()=>{setActiveTF(30); runAnalysis();});
elTf60?.addEventListener('click',()=>{setActiveTF(60); runAnalysis();});
elTfD?.addEventListener('click',()=>{setActiveTF(1440); runAnalysis();});
elBtnRun?.addEventListener('click', runAnalysis);
elDl?.addEventListener('click', downloadMergedCsv);

// ---------- main ----------
async function runAnalysis(){
  setConnStatus('تحميل...','warn');
  try{
    const base=await loadBaseSeries(currentTF);
    setConnStatus(__evtSrc? 'SSE متصل':'جاهز','ok');
    buildAndRender(base);
  }catch(e){
    setConnStatus('فشل التحميل','bad');
    console.error(e);
  }
}
function init(){
  (async()=>{
    try{ const txt = await fetchCsvText(elCsvInput?.value||''); const lines=txt.trim().split(/\r?\n/).filter(Boolean); let d=null;
      if(lines.length>1){ const p=lines[1].split(','); const v=p[0]||p[1]; if(v && !isNaN(Date.parse(v))) d=Date.parse(v); }
      if(elCsvAge) elCsvAge.textContent = d? `CSV: ${Math.round((Date.now()-d)/3600000)}h` : 'CSV: —';
    }catch{ if(elCsvAge) elCsvAge.textContent='CSV: —'; }
  })();
  setActiveTF(5);
  startSSE();
  setTimeout(runAnalysis, 250);
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
