/* GoldSignals app.js (v16) — preserve layout, worker live price, Import/Export CSV, Excel-friendly vertical CSV */
const WORKER_BASE   = 'https://gold-ticks.samer-mourtada.workers.dev';
const LIVE_PRICE_URL= WORKER_BASE + '/price';   // يعتمد حصريًا على الوركر تبعك
const DEFAULT_5M_CSV= 'XAUUSD_5min.csv';
const TABLE_ROWS    = 80;

const $=(id)=>document.getElementById(id);

/* DOM */
const elCsvInput=$('csvInput'), elBtnRun=$('runBtn');
const elTf5=$('tf5'), elTf30=$('tf30'), elTf60=$('tf60'), elTfD=$('tfD');
const elProMode=$('proMode'), elMtfConfirm=$('mtfConfirm');
const elLivePrice=$('livePrice'), elLiveTime=$('liveTime');
const elSummaryText=$('summaryText'), elAdviceText=$('adviceText');
const elIndRSI=$('indRSI'), elIndMACD=$('indMACD'), elIndEMAF=$('indEMAF'), elIndEMAS=$('indEMAS');
const elRowsBody=$('rowsBody');

/* Floating panel controls */
const btnImport=$('btnImportCsv'), btnExport=$('btnExportCsv'), hiddenCsv=$('hiddenCsvFile');

/* Numbers/Formats */
const nf2=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function fmtLocalDateTime(ts){const d=new Date(ts);return `${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} ${d.toLocaleDateString('en-CA')}`;}
function fmtExcel(ts){const d=new Date(ts);const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;}

let currentTF=5, LAST_LIVE=null, __cache=null;

/* ---------- CSV helpers ---------- */
function parseCsv(text){
  const lines=text.trim().split(/\r?\n/); if(!lines.length) return [];
  const header=lines[0].toLowerCase(); const out=[];
  if(header.includes('symbol')&&header.includes('date')&&header.includes('time')){
    for(let i=1;i<lines.length;i++){
      const parts=lines[i].split(',');
      const d=parts[1], t=parts[2], o=+parts[3], h=+parts[4], l=+parts[5], c=+parts[6];
      if(!d||!t) continue;
      const ts=Date.parse(`${d}T${t}Z`);
      if(Number.isFinite(ts)&&Number.isFinite(c))
        out.push({ts,open:Number.isFinite(o)?o:c,high:Number.isFinite(h)?h:c,low:Number.isFinite(l)?l:c,close:c});
    }
  }else{
    for(let i=1;i<lines.length;i++){
      const [d,c]=lines[i].split(',');
      const ts=Date.parse(d), close=+c;
      if(Number.isFinite(ts)&&Number.isFinite(close)) out.push({ts,open:close,high:close,low:close,close});
    }
  }
  out.sort((a,b)=>a.ts-b.ts); return out;
}
async function fetchCsv(url){
  const u=(url&&url.trim())?url.trim():DEFAULT_5M_CSV;
  const full=u.startsWith('http')?u:`${u}?t=${Date.now()}`;
  const r=await fetch(full,{cache:'no-store'});
  if(!r.ok) throw new Error('CSV HTTP '+r.status);
  const text=await r.text();
  return parseCsv(text);
}
function aggregateOHLC(rows, minutes){
  const ms=minutes*60*1000, map=new Map();
  for(const r of rows){const b=Math.floor(r.ts/ms)*ms; let rec=map.get(b);
    if(!rec){rec={ts:b,open:r.open,high:r.high,low:r.low,close:r.close};map.set(b,rec);}
    else{rec.high=Math.max(rec.high,r.high);rec.low=Math.min(rec.low,r.low);rec.close=r.close;}}
  return [...map.values()].sort((a,b)=>a.ts-b.ts);
}

/* ---------- Indicators (minimal needed) ---------- */
function ema(series,p){const out=new Array(series.length).fill(null), k=2/(p+1); let e=null,sum=0;
  for(let i=0;i<series.length;i++){const v=series[i].close; if(i<p){sum+=v;if(i===p-1){e=sum/p;out[i]=e;}} else{e=v*k+e*(1-k);out[i]=e;}} return out;}
function rsi(series,period=14){const out=new Array(series.length).fill(null); if(series.length<=period) return out;
  let g=0,l=0; for(let i=1;i<=period;i++){const d=series[i].close-series[i-1].close; if(d>=0)g+=d; else l-=d;}
  let ag=g/period, al=l/period; out[period]=al===0?100:100-(100/(1+(ag/al)));
  for(let i=period+1;i<series.length;i++){const d=series[i].close-series[i-1].close, G=d>0?d:0, L=d<0?-d:0; ag=(ag*(period-1)+G)/period; al=(al*(period-1)+L)/period; out[i]=al===0?100:100-(100/(1+(ag/al)));}
  return out;}
function macd(series,fast=12,slow=26,signal=9){const emaF=ema(series,fast), emaS=ema(series,slow);
  const m=series.map((_,i)=> (emaF[i]==null||emaS[i]==null)?null:emaF[i]-emaS[i]);
  const pts=m.map((v,i)=>({ts:series[i].ts,close:(v==null)?NaN:v})), clean=pts.filter(p=>Number.isFinite(p.close));
  const sigClean=ema(clean,signal), sigFull=new Array(series.length).fill(null);
  for(let i=0,j=0;i<series.length;i++){ if(Number.isFinite(pts[i]?.close)) sigFull[i]=sigClean[j++]; }
  return {emaF,emaS,macd:m,signal:sigFull};}

/* --------- UI helpers ---------- */
function setActiveTF(tf){ currentTF=tf;
  [elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));
  if(tf===5)elTf5?.classList?.add('active'); if(tf===30)elTf30?.classList?.add('active'); if(tf===60)elTf60?.classList?.add('active'); if(tf===1440)elTfD?.classList?.add('active');
}
function paintLive(price,ts){ if(elLivePrice) elLivePrice.textContent=Number.isFinite(price)?nf2.format(price):'—'; if(elLiveTime&&ts) elLiveTime.textContent=fmtLocalDateTime(ts); }

/* --------- Chart (keep simple, with live dashed overlay) ---------- */
function makeHiDPICanvas(c){const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,3)), r=c.getBoundingClientRect(); c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr); const ctx=c.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return ctx;}
function renderTradeChart(series){
  const canvas=document.getElementById('tradeChart'); if(!canvas||!series?.length) return;
  const ctx=makeHiDPICanvas(canvas), W=canvas.clientWidth, H=canvas.clientHeight;
  ctx.clearRect(0,0,W,H);
  const data=series.slice(-170);
  let min=Math.min(...data.map(d=>d.low)), max=Math.max(...data.map(d=>d.high)); if(min===max){min-=1;max+=1;} const pad=(max-min)*0.08; min-=pad; max+=pad;
  const x0=46,x1=W-12,y0=16,y1=H-24, plotW=x1-x0, plotH=y1-y0;
  const x=i=>x0+(i/(data.length-1))*plotW, y=v=>y1-((v-min)/(max-min))*plotH;
  // grid
  ctx.strokeStyle='#223047'; ctx.lineWidth=1; ctx.font='12px system-ui'; ctx.fillStyle='#9ca3af'; ctx.textAlign='right'; ctx.textBaseline='middle';
  for(let g=0;g<=4;g++){const yv=min+(g/4)*(max-min), yy=Math.round(y(yv))+0.5; ctx.beginPath(); ctx.moveTo(x0,yy); ctx.lineTo(x1,yy); ctx.stroke(); ctx.fillText(nf2.format(yv),x0-6,yy);}
  // price polyline (close)
  ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1.2; ctx.beginPath();
  data.forEach((d,i)=>{const yy=y(d.close); if(i===0)ctx.moveTo(x(i),yy); else ctx.lineTo(x(i),yy);}); ctx.stroke();
  // live dashed overlay
  if (Number.isFinite(window.__livePrice)) {
    const yy=y(window.__livePrice);
    ctx.save();
    ctx.globalAlpha=0.6; ctx.setLineDash([8,6]); ctx.strokeStyle='#ffffff'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x0,yy); ctx.lineTo(x1,yy); ctx.stroke();
    ctx.setLineDash([]);
    // label
    const label=`Live: ${nf2.format(window.__livePrice)}`; const padLab=6, th=18; ctx.font='12px system-ui';
    const tw=ctx.measureText(label).width;
    const bx=x0+10, by=Math.max(y0+2, Math.min(y1-th-2, yy-th/2));
    ctx.fillStyle='rgba(0,0,0,.55)'; if(ctx.roundRect) ctx.roundRect(bx,by,tw+padLab*2,th,8); else {ctx.fillRect(bx,by,tw+padLab*2,th);}
    ctx.fillStyle='#e6f2ff'; ctx.fillText(label,bx+padLab,by+th-6);
    ctx.restore();
  }
}

/* --------- Live price (via your Worker) ---------- */
async function fetchLivePrice(){
  const r=await fetch(LIVE_PRICE_URL,{cache:'no-store'});
  if(!r.ok) throw new Error('HTTP '+r.status);
  const j=await r.json();
  const p=Number(j?.price);
  if(!Number.isFinite(p)) throw new Error('Bad payload from worker');
  return p;
}

/* --------- Merge live into series ---------- */
function mergeLive(series,tfMin,live){
  if(!series?.length||!live) return series; const ms=tfMin*60*1000; const b=Math.floor(live.timeMs/ms)*ms;
  const out=series.slice(); const last={...out[out.length-1]};
  if(b===last.ts){last.close=live.price; last.high=Math.max(last.high,live.price); last.low=Math.min(last.low,live.price); out[out.length-1]=last;}
  else if(b>last.ts){out.push({ts:b,open:last.close,high:live.price,low:live.price,close:live.price});}
  return out;
}

/* --------- Signals (simple summary to keep your layout) ---------- */
function classifyBase(rsiVal,macdVal){
  if(macdVal==null||rsiVal==null) return 'حيادي';
  if(macdVal>0&&rsiVal>=50&&rsiVal<=70) return 'شراء';
  if(macdVal<0&&rsiVal<=50) return 'بيع';
  return 'حيادي';
}
function paintSummary(rsiVal,macdVal){
  const s=classifyBase(rsiVal,macdVal);
  if(elSummaryText){ elSummaryText.textContent=s; elSummaryText.style.color=(s==='شراء')?'#10b981':(s==='بيع')?'#ef4444':'#f59e0b'; }
}

/* --------- Table ---------- */
function toLocalDate(ts){return new Date(ts).toLocaleDateString('en-CA');}
function toLocalTime(ts){return new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
function paintTable(series,rsiArr,mac){
  if(!elRowsBody) return; elRowsBody.innerHTML='';
  const lastN=series.slice(-TABLE_ROWS).reverse();
  for(const r of lastN){
    const idx = series.indexOf(r);
    const base = classifyBase(rsiArr[idx], mac.macd[idx]);
    const color=(base==='شراء')?'#10b981':(base==='بيع')?'#ef4444':'#f59e0b';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${toLocalDate(r.ts)}</td><td>${toLocalTime(r.ts)}</td><td>${nf2.format(r.close)}</td>
      <td style="color:${color};font-weight:600">${base}</td>
      <td>${rsiArr[idx]?nf2.format(rsiArr[idx]):'—'}</td>
      <td>${mac.macd[idx]!=null?nf2.format(mac.macd[idx]):'—'}</td>
      <td>${mac.emaF[idx]?nf2.format(mac.emaF[idx]):'—'}</td>`;
    elRowsBody.appendChild(tr);
  }
}

/* --------- Core run ---------- */
async function runAnalysis(){
  try{
    const csvUrl=elCsvInput?.value?.trim()||'';
    const base5 = await fetchCsv(csvUrl);
    const base  = (currentTF===30)?aggregateOHLC(base5,30):(currentTF===60)?aggregateOHLC(base5,60):(currentTF===1440)?aggregateOHLC(base5,1440):base5;
    const withLive = LAST_LIVE ? mergeLive(base,currentTF,LAST_LIVE) : base;
    const rsiArr=rsi(withLive,14), mac=macd(withLive,12,26,9);
    const i=withLive.length-1;
    paintSummary(rsiArr[i],mac.macd[i]);
    paintTable(withLive,rsiArr,mac);
    renderTradeChart(withLive);
  }catch(e){ alert('تعذّر تحميل/تحليل البيانات: '+(e.message||e)); console.error(e); }
}
function reprojectWithLive(){
  if(!__cache||!LAST_LIVE) return;
  runAnalysis();
}

/* --------- Import/Export CSV ---------- */
function downloadMergedCsv(){
  try{
    const table = window.__lastSeries || null;
    const series = table || window.__seriesForExport || null;
    const s = series && series.length ? series : window.__seriesCache;
    if(!s?.length){ alert('شغّل التحليل أولاً'); return; }
    const DELIM=';'; const CRLF='\r\n'; const BOM='\ufeff';
    const header=['Date','Open','High','Low','Close'];
    const rows=s.map(r=>[fmtExcel(r.ts), r.open, r.high, r.low, r.close]);
    const q=v=>`"${String(v).replace(/"/g,'""')}"`;
    const csv=[header.map(q).join(DELIM)].concat(rows.map(row=>row.map(q).join(DELIM))).join(CRLF)+CRLF;
    const blob=new Blob([BOM+csv],{type:'application/vnd.ms-excel;charset=utf-8'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`XAUUSD_${currentTF}min_merged.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }catch(e){ alert('فشل التصدير: '+(e.message||e)); }
}
function onCsvPicked(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const rows=parseCsv(String(reader.result));
      if(!rows?.length){ alert('CSV فارغ أو غير مقروء'); return; }
      window.__seriesCache = (currentTF===5? rows : aggregateOHLC(rows, currentTF));
      LAST_LIVE=null; // لا ندمج لايف عند الاستيراد اليدوي
      elCsvInput.value=''; // نترك الحقل فاضي لأنه صار في بيانات محلية
      // استخدم الكاش المحلي
      const withLive=window.__seriesCache;
      const rsiArr=rsi(withLive,14), mac=macd(withLive,12,26,9);
      const i=withLive.length-1;
      paintSummary(rsiArr[i],mac.macd[i]); paintTable(withLive,rsiArr,mac); renderTradeChart(withLive);
    }catch(e){ alert('تعذّر قراءة CSV: '+(e.message||e)); }
  };
  reader.readAsText(file,'utf-8');
}

/* --------- Events ---------- */
elBtnRun?.addEventListener('click',runAnalysis);
elTf5?.addEventListener('click',()=>{setActiveTF(5);runAnalysis();});
elTf30?.addEventListener('click',()=>{setActiveTF(30);runAnalysis();});
elTf60?.addEventListener('click',()=>{setActiveTF(60);runAnalysis();});
elTfD?.addEventListener('click',()=>{setActiveTF(1440);runAnalysis();});

btnImport?.addEventListener('click',()=>hiddenCsv?.click());
hiddenCsv?.addEventListener('change',()=>{ if(hiddenCsv.files?.length) onCsvPicked(hiddenCsv.files[0]); });
btnExport?.addEventListener('click',downloadMergedCsv);

/* --------- Live loop ---------- */
async function tickLive(){ try{
  const p=await fetchLivePrice(); const t=Date.now();
  window.__livePrice=p; window.__liveTime=t; LAST_LIVE={price:p,timeMs:t};
  paintLive(p,t);
  // تحديث الرسم إذا كنا مستخدمين بيانات الشبكة (مش ملف مستورد)
  if(!window.__seriesCache){ reprojectWithLive(); }
}catch(e){ /* صامت */ } finally{ setTimeout(tickLive, 1000); } }

/* --------- Init ---------- */
function init(){ setActiveTF(5); runAnalysis(); tickLive(); }
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
