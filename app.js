/************ GoldSignals - app.js (local time + crisp chart) ************/
const LIVE_JSON_URL    = 'https://goldprice-proxy.samer-mourtada.workers.dev/price';
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const TABLE_ROWS       = 80;
const LIVE_REFRESH_SEC = 30;
const CHART_POINTS     = 150;

const $ = (id) => document.getElementById(id);
const elCsvInput=$('csvInput'), elTf5=$('tf5'), elTf60=$('tf60'), elTfD=$('tfD'), elBtnRun=$('runBtn');
const elLivePrice=$('livePrice'), elLiveTime=$('liveTime'), elSummaryText=$('summaryText');
const elIndRSI=$('indRSI'), elIndMACD=$('indMACD'), elIndEMAF=$('indEMAF'), elIndEMAS=$('indEMAS');
const elPivotP=$('pivotP'); const elR1=$('r1'), elR2=$('r2'), elR3=$('r3'); const elS1=$('s1'), elS2=$('s2'), elS3=$('s3');
const elRowsBody=$('rowsBody'); const elAdviceIn=$('adviceIn'); const elAdviceOut=$('adviceOut');

const elEmaFast=$('emaFast'), elEmaSlow=$('emaSlow'), elRsiPeriod=$('rsiPeriod');
let EMA_FAST=parseInt(elEmaFast?.value||'12',10);
let EMA_SLOW=parseInt(elEmaSlow?.value||'26',10);
let RSI_PER =parseInt(elRsiPeriod?.value||'14',10);
elEmaFast?.addEventListener('input', ()=> EMA_FAST=parseInt(elEmaFast.value||'12',10));
elEmaSlow?.addEventListener('input', ()=> EMA_SLOW=parseInt(elEmaSlow.value||'26',10));
elRsiPeriod?.addEventListener('input',()=> RSI_PER =parseInt(elRsiPeriod.value||'14',10));

const nf2=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const nf4=new Intl.NumberFormat('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
const fmtLocalDT=(d)=>new Date(d).toLocaleString(undefined,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const fmtLocalDate=(ts)=>new Date(ts).toLocaleDateString(undefined,{year:'numeric',month:'2-digit',day:'2-digit'});
const fmtLocalTime=(ts)=>new Date(ts).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false});

let currentTF=5;
function setActiveTF(tf){ currentTF=tf; [elTf5,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));
  if(tf===5)elTf5?.classList?.add('active'); if(tf===60)elTf60?.classList?.add('active'); if(tf===1440)elTfD?.classList?.add('active'); }

function parseCsv(text){
  const lines=text.trim().split(/\r?\n/); if(!lines.length) return [];
  const header=lines[0].toLowerCase(); const out=[];
  if(header.includes('symbol')&&header.includes('date')&&header.includes('time')){
    for(let i=1;i<lines.length;i++){
      const [sym,d,t,o,h,l,c]=lines[i].split(','); if(!d||!t) continue;
      const ts=Date.parse(`${d}T${t}Z`); const open=+o, high=+h, low=+l, close=+c;
      if(Number.isFinite(ts)&&Number.isFinite(close)){
        out.push({ts, open:Number.isFinite(open)?open:close,
                  high:Number.isFinite(high)?high:close, low:Number.isFinite(low)?low:close, close});
      }
    }
  }else{
    for(let i=1;i<lines.length;i++){
      const [d,c]=lines[i].split(','); const ts=Date.parse(d); const close=+c;
      if(Number.isFinite(ts)&&Number.isFinite(close)){ out.push({ts,open:close,high:close,low:close,close}); }
    }
  }
  out.sort((a,b)=>a.ts-b.ts); return out;
}
async function fetchCsv(url){
  const u=(url&&url.trim())?url.trim():DEFAULT_5M_CSV;
  const full=u.startsWith('http')?u:`${u}?t=${Date.now()}`;
  const r=await fetch(full,{cache:'no-store'}); if(!r.ok)throw new Error(`CSV HTTP ${r.status}`);
  return parseCsv(await r.text());
}
function aggregateOHLC(rows,minutes){
  const bucketMs=minutes*60*1000, map=new Map();
  for(const r of rows){
    const b=Math.floor(r.ts/bucketMs)*bucketMs; let rec=map.get(b);
    if(!rec){ rec={ts:b,open:r.open,high:r.high,low:r.low,close:r.close}; map.set(b,rec); }
    else{ rec.high=Math.max(rec.high,r.high); rec.low=Math.min(rec.low,r.low); rec.close=r.close; }
  }
  return [...map.values()].sort((a,b)=>a.ts-b.ts);
}

function ema(series,period){
  const out=new Array(series.length).fill(null); const k=2/(period+1); let v=null,sum=0;
  for(let i=0;i<series.length;i++){ const p=series[i].close;
    if(i<period){ sum+=p; if(i===period-1){ v=sum/period; out[i]=v; } }
    else{ v=p*k+v*(1-k); out[i]=v; } }
  return out;
}
function rsi(series,period=14){
  const out=new Array(series.length).fill(null); if(series.length<=period) return out;
  let g=0,l=0; for(let i=1;i<=period;i++){ const d=series[i].close-series[i-1].close; if(d>=0)g+=d; else l-=d; }
  let avgG=g/period, avgL=l/period; out[period]=avgL===0?100:100-(100/(1+(avgG/avgL)));
  for(let i=period+1;i<series.length;i++){
    const d=series[i].close-series[i-1].close; const gg=d>0?d:0, ll=d<0?-d:0;
    avgG=(avgG*(period-1)+gg)/period; avgL=(avgL*(period-1)+ll)/period;
    out[i]=avgL===0?100:100-(100/(1+(avgG/avgL)));
  } return out;
}
function macd(series,fast=12,slow=26,signal=9){
  const emaF=ema(series,fast), emaS=ema(series,slow);
  const m=series.map((_,i)=> (emaF[i]==null||emaS[i]==null)?null:emaF[i]-emaS[i]);
  const pts=m.map((v,i)=>({ts:series[i].ts, close:(v==null)?NaN:v}));
  const clean=pts.filter(p=>Number.isFinite(p.close)), sigClean=ema(clean,signal), sigFull=new Array(series.length).fill(null);
  for(let i=0,j=0;i<series.length;i++){ if(Number.isFinite(pts[i]?.close)) sigFull[i]=sigClean[j++]; }
  return {emaF,emaS,macd:m,signal:sigFull};
}
function classify(rsiVal,macdVal){
  if(macdVal==null||rsiVal==null) return 'حيادي';
  if(macdVal>0&&rsiVal>=50&&rsiVal<=70) return 'شراء';
  if(macdVal<0&&rsiVal<=50) return 'بيع';
  return 'حيادي';
}
function atr(series,period=14){
  if(!series.length) return 0; const trs=[];
  for(let i=1;i<series.length;i++){
    const h=series[i].high??series[i].close, l=series[i].low??series[i].close, pc=series[i-1].close;
    trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
  }
  if(!trs.length) return (series.at(-1).close||0)*0.005;
  const n=Math.min(period,trs.length), last=trs.slice(-n);
  return last.reduce((a,b)=>a+b,0)/n;
}
function calcPivots(daily){
  if(!daily||daily.length<2) return null; const y=daily[daily.length-2];
  const H=y.high,L=y.low,C=y.close; if(![H,L,C].every(Number.isFinite)) return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}
function makeAdvice(dir,priceNow,emaFnow,piv,series){
  const rng=Math.max(0.5, atr(series,14));
  if(dir==='شراء'){ const entry=Math.max(emaFnow,piv?.P??emaFnow);
    return {dir, entry, sl:entry-rng*0.7, tp1:entry+rng*1.2, tp2:entry+rng*2.4}; }
  if(dir==='بيع'){  const entry=Math.min(emaFnow,piv?.P??emaFnow);
    return {dir, entry, sl:entry+rng*0.7, tp1:entry-rng*1.2, tp2:entry-rng*2.4}; }
  return {dir:'حيادي'};
}

function paintLive(price, iso){
  if(elLivePrice&&Number.isFinite(price)) elLivePrice.textContent=nf2.format(price);
  if(elLiveTime&&iso) elLiveTime.textContent=fmtLocalDT(iso);
}
function paintIndicators(rsiVal,macdVal,emaFv,emaSv){
  if(elIndRSI)  elIndRSI.textContent =Number.isFinite(rsiVal)?nf2.format(rsiVal):'—';
  if(elIndMACD) elIndMACD.textContent=Number.isFinite(macdVal)?nf4.format(macdVal):'—';
  if(elIndEMAF) elIndEMAF.textContent=Number.isFinite(emaFv)?nf2.format(emaFv):'—';
  if(elIndEMAS) elIndEMAS.textContent=Number.isFinite(emaSv)?nf2.format(emaSv):'—';
}
function paintSummary(rsiVal,macdVal){
  if(!elSummaryText) return; const s=classify(rsiVal,macdVal);
  elSummaryText.textContent=s;
  elSummaryText.style.color = s==='شراء' ? '#10b981' : s==='بيع' ? '#ef4444' : '#f59e0b';
}
function paintPivots(p){
  if(!p) return;
  elPivotP&&(elPivotP.textContent=nf2.format(p.P));
  elR1&&(elR1.textContent=nf2.format(p.R1));
  elR2&&(elR2.textContent=nf2.format(p.R2));
  elR3&&(elR3.textContent=nf2.format(p.R3));
  elS1&&(elS1.textContent=nf2.format(p.S1));
  elS2&&(elS2.textContent=nf2.format(p.S2));
  elS3&&(elS3.textContent=nf2.format(p.S3));
}
function paintTable(rows){
  if(!elRowsBody) return; elRowsBody.innerHTML='';
  const last=rows.slice(-TABLE_ROWS).reverse();
  for(const r of last){
    const s=classify(r.rsi,r.macd);
    const color=s==='شراء'?'#10b981':s==='بيع'?'#ef4444':'#f59e0b';
    const dStr=r.ts?fmtLocalDate(r.ts):'—', tStr=r.ts?fmtLocalTime(r.ts):'—';
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${dStr}</td>
      <td>${tStr}</td>
      <td>${nf2.format(r.price)}</td>
      <td style="color:${color};font-weight:600">${s}</td>
      <td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td>
      <td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td>
      <td>${nf2.format(r.emaF)}</td>`;
    elRowsBody.appendChild(tr);
  }
}

let _lastSeries=null, _lastAdvice=null;

async function runAnalysis(){
  try{
    const csvUrl=elCsvInput?.value?.trim()||'';
    let rows5=await fetchCsv(csvUrl); if(!rows5.length) throw new Error('ملف CSV فارغ');
    const daily=aggregateOHLC(rows5,1440);
    let series=rows5; if(currentTF===60)series=aggregateOHLC(rows5,60); if(currentTF===1440)series=daily;
    const rsiArr=rsi(series,RSI_PER); const macdObj=macd(series,EMA_FAST,EMA_SLOW,9);
    const i=series.length-1; const priceNow=series[i].close; const rsiNow=rsiArr[i]; const macdNow=macdObj.macd[i];
    const emaFnow=macdObj.emaF[i]; const emaSnow=macdObj.emaS[i];

    paintSummary(rsiNow,macdNow); paintIndicators(rsiNow,macdNow,emaFnow,emaSnow);
    const piv=calcPivots(daily); paintPivots(piv);

    const tableRows=series.map((p,idx)=>({ts:p.ts,price:p.close,rsi:rsiArr[idx],macd:macdObj.macd[idx],emaF:macdObj.emaF[idx]}));
    paintTable(tableRows);

    const dir=classify(rsiNow,macdNow); const advice=makeAdvice(dir,priceNow,emaFnow,piv,series);
    if(elAdviceIn&&elAdviceOut){
      if(advice.dir==='شراء'){
        elAdviceIn.textContent = `نصيحة الدخول: شراء عند اختراق/ارتداد قرب EMA ${nf2.format(advice.entry)}.`;
        elAdviceOut.textContent= `نصيحة الخروج: وقف ${nf2.format(advice.sl)} • أهداف: ${nf2.format(advice.tp1)} ثم ${nf2.format(advice.tp2)}.`;
      }else if(advice.dir==='بيع'){
        elAdviceIn.textContent = `نصيحة الدخول: بيع عند كسر/ارتداد قرب EMA ${nf2.format(advice.entry)}.`;
        elAdviceOut.textContent= `نصيحة الخروج: وقف ${nf2.format(advice.sl)} • أهداف: ${nf2.format(advice.tp1)} ثم ${nf2.format(advice.tp2)}.`;
      }else{
        elAdviceIn.textContent='نصيحة الدخول: حيادي.'; elAdviceOut.textContent='نصيحة الخروج: —';
      }
    }

    _lastSeries=series; _lastAdvice=advice; drawChart(_lastSeries,_lastAdvice);
  }catch(err){ alert(`تعذّر تحميل/تحليل البيانات: ${err.message||err}`); console.error(err); }
}

async function refreshLive(){
  try{
    const r=await fetch(LIVE_JSON_URL,{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json();
    if(j&&j.ok&&Number.isFinite(j.price)){
      const iso=j.isoTime || (j.date&&j.time ? `${j.date}T${j.time}Z` : null);
      paintLive(j.price, iso);
    }
  }catch(e){ console.warn('Live error:',e); }
}

elBtnRun?.addEventListener('click',runAnalysis);
elTf5?.addEventListener('click', ()=>{setActiveTF(5);runAnalysis();});
elTf60?.addEventListener('click',()=>{setActiveTF(60);runAnalysis();});
elTfD?.addEventListener('click', ()=>{setActiveTF(1440);runAnalysis();});
window.addEventListener('resize', ()=> drawChart(_lastSeries,_lastAdvice));

const LS_KEY='gs_csv_url';
if(elCsvInput){
  const saved=localStorage.getItem(LS_KEY)||''; if(!elCsvInput.value&&saved) elCsvInput.value=saved;
  elCsvInput.addEventListener('input',()=>{ const v=elCsvInput.value.trim();
    if(v) localStorage.setItem(LS_KEY,v); else localStorage.removeItem(LS_KEY); });
}

setActiveTF(5); runAnalysis(); refreshLive(); setInterval(refreshLive, LIVE_REFRESH_SEC*1000);

/*===================== الرسم البياني (Canvas) =====================*/
function drawChart(series,advice){
  const cvs=document.getElementById('gsChart'); if(!cvs||!series?.length) return;

  // أبعاد CSS
  let rect=cvs.getBoundingClientRect(); if(!rect.height){ cvs.style.height='320px'; rect=cvs.getBoundingClientRect(); }
  const cssW=Math.max(300, rect.width || 600);
  const cssH=Math.max(220, rect.height|| 320);

  // رفع الدقة مع ضبط القياس حتى تبقى المقاييس واضحة
  const dpr=Math.min(2, window.devicePixelRatio||1);
  cvs.width =Math.round(cssW*dpr); cvs.height=Math.round(cssH*dpr);
  const ctx=cvs.getContext('2d'); if(!ctx) return;
  ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cvs.width,cvs.height);
  ctx.scale(dpr,dpr);

  const pad=16, left=pad+34, right=cssW-pad, top=pad, bottom=cssH-pad-8;
  const w=right-left, h=bottom-top;

  const data=series.slice(-CHART_POINTS);

  // نطاق Y (مع خطوط النصيحة)
  const lows =data.map(p=>Number.isFinite(p.low)?p.low:p.close);
  const highs=data.map(p=>Number.isFinite(p.high)?p.high:p.close);
  let minY=Math.min(...lows), maxY=Math.max(...highs);
  const addIf=v=>{ if(Number.isFinite(v)){ minY=Math.min(minY,v); maxY=Math.max(maxY,v);} };
  if(advice){ addIf(advice.entry); addIf(advice.sl); addIf(advice.tp1); addIf(advice.tp2); }
  const padY=(maxY-minY)*0.08 || 1; minY-=padY; maxY+=padY;

  const yFor=v=> bottom - ((v-minY)/(maxY-minY))*h;
  const dx=w/Math.max(1,(data.length-1)); const body=Math.max(2, dx*0.55); // >=2px أوضح

  // grid + تدريج أسعار يسار
  ctx.strokeStyle='#1f2937'; ctx.lineWidth=1;
  ctx.fillStyle='#9ca3af'; ctx.font='12px system-ui,-apple-system,Segoe UI,Roboto';
  for(let k=0;k<=4;k++){
    const y=top+k*(h/4);
    ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke();
    const val=maxY-(k*(maxY-minY)/4);
    ctx.fillText(nf2.format(val), left-32, y-2); // أرقام يسار
  }

  // الشموع
  for(let i=0;i<data.length;i++){
    const p=data[i], o=Number.isFinite(p.open)?p.open:p.close, c=p.close;
    const hi=Number.isFinite(p.high)?p.high:Math.max(o,c), lo=Number.isFinite(p.low)?p.low:Math.min(o,c);
    const x=left+i*dx, yO=yFor(o), yC=yFor(c), yH=yFor(hi), yL=yFor(lo);
    const up=c>=o;
    ctx.strokeStyle=up?'#10b981':'#ef4444'; ctx.fillStyle=up?'rgba(16,185,129,0.9)':'rgba(239,68,68,0.9)';
    ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL); ctx.stroke();           // wick
    const bh=Math.max(1, Math.abs(yC-yO)); ctx.fillRect(x-body/2, Math.min(yO,yC), body, bh); // body
  }

  // دالة رسم خط متقطع مع تسمية (مع حفظ/استرجاع حالة الرسم)
  const dash=(y,color,text)=>{
    if(!Number.isFinite(y)) return;
    ctx.save();
    ctx.setLineDash([6,6]); ctx.strokeStyle=color; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle=color; ctx.font='13px system-ui,-apple-system, Segoe UI, Roboto';
    ctx.fillText(text, left+6, y-8);
    ctx.restore();
  };
  if(advice?.dir==='شراء'||advice?.dir==='بيع'){
    dash(yFor(advice.entry),'#60a5fa',`Entry: ${nf2.format(advice.entry)}`);
    dash(yFor(advice.tp1),  '#22c55e',`TP1: ${nf2.format(advice.tp1)}`);
    dash(yFor(advice.tp2),  '#16a34a',`TP2: ${nf2.format(advice.tp2)}`);
    dash(yFor(advice.sl),   '#ef4444',`SL : ${nf2.format(advice.sl)}`);
  }

  // نقطة آخر سعر
  const last=data.at(-1); if(last){ ctx.fillStyle='#f59e0b'; ctx.beginPath(); ctx.arc(right-6, yFor(last.close), 4, 0, Math.PI*2); ctx.fill(); }
}
