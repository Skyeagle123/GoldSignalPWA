/************ GoldSignals - app.js (fixed, chart+advice+live) ************/
const LIVE_JSON_URL    = 'https://goldprice-proxy.samer-mourtada.workers.dev/price';
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const TABLE_ROWS       = 80;
const LIVE_REFRESH_SEC = 1; // حي كل ثانية

/* عناصر */
const $ = (id) => document.getElementById(id);
const elCsvInput = $('csvInput');
const elTf5 = $('tf5'), elTf30 = $('tf30'), elTf60 = $('tf60'), elTfD = $('tfD');
const elBtnRun = $('runBtn');

const elLivePrice = $('livePrice'), elLiveTime  = $('liveTime');
const elSummaryText= $('summaryText'), elAdvBox = $('advBox');

const elIndRSI=$('indRSI'), elIndMACD=$('indMACD'), elIndEMAF=$('indEMAF'), elIndEMAS=$('indEMAS');
const elPivotP=$('pivotP'), elR1=$('r1'), elR2=$('r2'), elR3=$('r3'), elS1=$('s1'), elS2=$('s2'), elS3=$('s3');
const elRowsBody = $('rowsBody');

const elEmaFast=$('emaFast'), elEmaSlow=$('emaSlow'), elRsiPeriod=$('rsiPeriod');

let EMA_FAST = parseInt(elEmaFast?.value || '12', 10);
let EMA_SLOW = parseInt(elEmaSlow?.value || '26', 10);
let RSI_PER  = parseInt(elRsiPeriod?.value || '14', 10);

elEmaFast?.addEventListener('input', ()=> EMA_FAST = parseInt(elEmaFast.value||'12',10));
elEmaSlow?.addEventListener('input', ()=> EMA_SLOW = parseInt(elEmaSlow.value||'26',10));
elRsiPeriod?.addEventListener('input',()=> RSI_PER  = parseInt(elRsiPeriod.value||'14',10));

/* تنسيق */
const nf2 = new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat('en-US', {minimumFractionDigits:4, maximumFractionDigits:4});
const fmtDate = new Intl.DateTimeFormat(undefined, {year:'numeric',month:'2-digit',day:'2-digit'});
const fmtTime = new Intl.DateTimeFormat(undefined, {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const toLocal = (ts)=>`${fmtDate.format(ts)} ${fmtTime.format(ts)}`;

/* إطار زمني */
let currentTF = 5;
function setActiveTF(tf){
  currentTF=tf;
  [elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));
  if(tf===5) elTf5?.classList?.add('active');
  if(tf===30) elTf30?.classList?.add('active');
  if(tf===60) elTf60?.classList?.add('active');
  if(tf===1440) elTfD?.classList?.add('active');
}

/* CSV */
function parseCsv(text){
  const lines = text.trim().split(/\r?\n/);
  if(!lines.length) return [];
  const header = lines[0].toLowerCase();
  const out=[];
  if(header.includes('symbol') && header.includes('date') && header.includes('time')){
    for(let i=1;i<lines.length;i++){
      const [sym,d,t,o,h,l,c] = lines[i].split(',');
      if(!d||!t) continue;
      const ts = Date.parse(`${d}T${t}Z`);
      const open=+o, high=+h, low=+l, close=+c;
      if(Number.isFinite(ts) && Number.isFinite(close)){
        out.push({
          ts,
          open:Number.isFinite(open)?open:close,
          high:Number.isFinite(high)?high:close,
          low :Number.isFinite(low)?low:close,
          close
        });
      }
    }
  }else{
    for(let i=1;i<lines.length;i++){
      const [d,c] = lines[i].split(',');
      const ts = Date.parse(d);
      const close = +c;
      if(Number.isFinite(ts)&&Number.isFinite(close)){
        out.push({ts,open:close,high:close,low:close,close});
      }
    }
  }
  out.sort((a,b)=>a.ts-b.ts);
  return out;
}
async function fetchCsv(url){
  const u = (url && url.trim()) ? url.trim() : DEFAULT_5M_CSV;
  const full = u.startsWith('http') ? u : `${u}?t=${Date.now()}`;
  const r = await fetch(full,{cache:'no-store'});
  if(!r.ok) throw new Error(`CSV HTTP ${r.status}`);
  return parseCsv(await r.text());
}
function aggregateOHLC(rows, minutes){
  const ms = minutes*60*1000;
  const map=new Map();
  for(const r of rows){
    const b=Math.floor(r.ts/ms)*ms;
    let rec=map.get(b);
    if(!rec){ rec={ts:b,open:r.open,high:r.high,low:r.low,close:r.close}; map.set(b,rec); }
    else { rec.high=Math.max(rec.high,r.high); rec.low=Math.min(rec.low,r.low); rec.close=r.close; }
  }
  return [...map.values()].sort((a,b)=>a.ts-b.ts);
}

/* مؤشرات */
function ema(series, period){
  const out=new Array(series.length).fill(null);
  const k=2/(period+1);
  let e=null,sum=0;
  for(let i=0;i<series.length;i++){
    const p=series[i].close;
    if(i<period){ sum+=p; if(i===period-1){ e=sum/period; out[i]=e; } }
    else { e=p*k + e*(1-k); out[i]=e; }
  }
  return out;
}
function rsi(series, period=14){
  const out=new Array(series.length).fill(null);
  if(series.length<=period) return out;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){
    const d=series[i].close - series[i-1].close;
    if(d>=0) gain+=d; else loss-=d;
  }
  let avgG=gain/period, avgL=loss/period;
  out[period]=avgL===0?100:100-(100/(1+(avgG/avgL)));
  for(let i=period+1;i<series.length;i++){
    const d=series[i].close - series[i-1].close;
    const g=d>0?d:0, l=d<0?-d:0;
    avgG=(avgG*(period-1)+g)/period; avgL=(avgL*(period-1)+l)/period;
    out[i]=avgL===0?100:100-(100/(1+(avgG/avgL)));
  }
  return out;
}
function macd(series, fast=12, slow=26, signal=9){
  const emaF=ema(series,fast), emaS=ema(series,slow);
  const m=series.map((_,i)=>{
    if(emaF[i]==null||emaS[i]==null) return null;
    return emaF[i]-emaS[i];
  });
  const pts=m.map((v,i)=>({ts:series[i].ts, close:(v==null)?NaN:v}));
  const clean=pts.filter(p=>Number.isFinite(p.close));
  const sigClean=ema(clean,signal);
  const sigFull=new Array(series.length).fill(null);
  for(let i=0,j=0;i<series.length;i++){
    if(Number.isFinite(pts[i]?.close)) sigFull[i]=sigClean[j++];
  }
  return {emaF,emaS,macd:m,signal:sigFull};
}
function atr(series, period=14){
  if(!series.length) return [];
  const tr=new Array(series.length).fill(null);
  for(let i=0;i<series.length;i++){
    const h=series[i].high, l=series[i].low;
    if(i===0){ tr[i]=h-l; continue; }
    const pc=series[i-1].close;
    tr[i]=Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
  }
  const arr=tr.map(v=>({close:v}));
  return ema(arr,period);
}

/* Pivot */
function calcPivots(daily){
  if(!daily||daily.length<2) return null;
  const y=daily[daily.length-2];
  const H=y.high, L=y.low, C=y.close;
  if(![H,L,C].every(Number.isFinite)) return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

/* عرض */
function paintLive(price, ts){
  if(elLivePrice&&Number.isFinite(price)) elLivePrice.textContent=nf2.format(price);
  if(elLiveTime&&ts) elLiveTime.textContent = toLocal(new Date(ts));
}
function paintIndicators(rsiVal, macdVal, emaFv, emaSv){
  if(elIndRSI)  elIndRSI.textContent  = Number.isFinite(rsiVal)?nf2.format(rsiVal):'—';
  if(elIndMACD) elIndMACD.textContent = Number.isFinite(macdVal)?nf4.format(macdVal):'—';
  if(elIndEMAF) elIndEMAF.textContent = Number.isFinite(emaFv)?nf2.format(emaFv):'—';
  if(elIndEMAS) elIndEMAS.textContent = Number.isFinite(emaSv)?nf2.format(emaSv):'—';
}
function classifyBase(rsiVal, macdVal){
  if (macdVal==null || rsiVal==null) return 'حيادي';
  if (macdVal>0 && rsiVal>=50 && rsiVal<=70) return 'شراء';
  if (macdVal<0 && rsiVal<=50) return 'بيع';
  return 'حيادي';
}
function paintSummary(rsiVal, macdVal){
  if(!elSummaryText) return;
  const s=classifyBase(rsiVal, macdVal);
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
  if(!elRowsBody) return;
  elRowsBody.innerHTML='';
  const last=rows.slice(-TABLE_ROWS).reverse();
  for(const r of last){
    const sig=classifyBase(r.rsi,r.macd);
    const color = sig==='شراء'?'#10b981':sig==='بيع'?'#ef4444':'#f59e0b';
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${toLocal(new Date(r.ts))}</td>
      <td>${nf2.format(r.price)}</td>
      <td style="color:${color};font-weight:600">${sig}</td>
      <td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td>
      <td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td>
      <td>${nf2.format(r.emaF)}</td>
    `;
    elRowsBody.appendChild(tr);
  }
}

/* Advice */
function buildAdvice(series, rsiArr, macdObj, daily){
  if(!series.length) return null;
  const i=series.length-1;
  const price=series[i].close;
  const rsiNow=rsiArr[i], macdNow=macdObj.macd[i], emaF=macdObj.emaF[i], emaS=macdObj.emaS[i];

  const sNow=classifyBase(rsiNow, macdNow);
  const atrArr=atr(series,14); const aNow=atrArr[i]??0;

  const SL_ATR_MULT=1.5, TP1_ATR_MULT=1.0, TP2_ATR_MULT=2.0;
  let entry, sl, tp1, tp2, note='';

  if(sNow==='شراء'){
    entry=Math.max(price, Number.isFinite(emaS)?emaS:price);
    sl = entry - SL_ATR_MULT*aNow;
    tp1= entry + TP1_ATR_MULT*aNow; // ← fixed
    tp2= entry + TP2_ATR_MULT*aNow;
    note='شراء قرب/اختراق EMA';
  }else if(sNow==='بيع'){
    entry=Math.min(price, Number.isFinite(emaS)?emaS:price);
    sl = entry + SL_ATR_MULT*aNow;
    tp1= entry - TP1_ATR_MULT*aNow;
    tp2= entry - TP2_ATR_MULT*aNow;
    note='بيع قرب/كسر EMA';
  }else{
    return {text:'إشارة حيادية حالياً.', entry:undefined, sl:undefined,tp1:undefined,tp2:undefined};
  }

  const piv=calcPivots(daily);
  if(piv){
    if(sNow==='شراء'){ tp1=Math.max(tp1,piv.R1??tp1); tp2=Math.max(tp2,piv.R2??tp2); }
    if(sNow==='بيع'){  tp1=Math.min(tp1,piv.S1??tp1); tp2=Math.min(tp2,piv.S2??tp2); }
  }

  return {
    side:sNow, entry, sl, tp1, tp2, price, emaF, emaS,
    text:`${note}. دخول: ${nf2.format(entry)} • وقف: ${nf2.format(sl)} • أهداف: ${nf2.format(tp1)} ثم ${nf2.format(tp2)}.`
  };
}
function paintAdvice(a){
  if(!elAdvBox) return;
  elAdvBox.textContent = a?.text || '—';
}

/* رسم بسيط كانفاس */
function drawChart(series, lines){
  const canvas = $('chartCanvas');
  if(!canvas || !series?.length) return;
  const dpr = Math.max(1, Math.min(window.devicePixelRatio||1, 3));
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(W*dpr));
  canvas.height= Math.max(1, Math.floor(H*dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);

  ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,W,H);
  const x0=46, x1=W-12, y0=16, y1=H-24, plotW=x1-x0, plotH=y1-y0;

  const data=series.slice(-120);
  let minY=Math.min(...data.map(d=>d.low)), maxY=Math.max(...data.map(d=>d.high));
  [lines?.entry,lines?.sl,lines?.tp1,lines?.tp2,window.__livePrice].forEach(v=>{
    if(Number.isFinite(v)){ minY=Math.min(minY,v); maxY=Math.max(maxY,v); }
  });
  if(minY===maxY){ minY-=1; maxY+=1; }
  const pad=(maxY-minY)*0.08; minY-=pad; maxY+=pad;

  const xAt=i=>x0+(i/(data.length-1))*plotW;
  const yAt=v=>y1-((v-minY)/(maxY-minY))*plotH;

  // grid
  ctx.strokeStyle='#223047'; ctx.lineWidth=1;
  ctx.font='12px system-ui'; ctx.fillStyle='#9ca3af'; ctx.textAlign='right'; ctx.textBaseline='middle';
  for(let g=0; g<=4; g++){
    const yVal=minY+(g/4)*(maxY-minY);
    const y=Math.round(yAt(yVal))+0.5;
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
    ctx.fillText(nf2.format(yVal), x0-6, y);
  }

  // candles
  const cw=Math.max(2, plotW/Math.max(30,data.length)*0.7);
  for(let i=0;i<data.length;i++){
    const d=data[i], x=xAt(i);
    const yH=yAt(d.high), yL=yAt(d.low), yO=yAt(d.open), yC=yAt(d.close);
    const bull=d.close>=d.open;
    ctx.strokeStyle=bull?'#16a34a':'#ef4444';
    ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL); ctx.stroke();
    const xL=x-cw/2, xR=x+cw/2;
    ctx.beginPath(); ctx.moveTo(xL,yO); ctx.lineTo(xR,yO); ctx.lineTo(xR,yC); ctx.lineTo(xL,yC); ctx.closePath();
    ctx.fillStyle=bull?'#16a34a':'#ef4444'; ctx.globalAlpha=0.85; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
  }

  function hline(val,color,label){
    if(!Number.isFinite(val)) return;
    const y=Math.round(yAt(val))+0.5;
    ctx.save();
    ctx.setLineDash([6,5]); ctx.strokeStyle=color; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
    ctx.setLineDash([]);
    const tag=`${label}: ${nf2.format(val)}`;
    ctx.fillStyle=color; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.font='12px system-ui';
    ctx.fillText(tag, x0+8, y-10);
    ctx.restore();
  }
  hline(lines?.entry,'#60a5fa','Entry');
  hline(lines?.tp1,'#22c55e','TP1');
  hline(lines?.tp2,'#22c55e','TP2');
  hline(lines?.sl ,'#f87171','SL');
  if(Number.isFinite(window.__livePrice)){ hline(window.__livePrice,'#ffffff','Live'); }
}

/* تحليل رئيسي */
async function runAnalysis(){
  try{
    const csvUrl=elCsvInput?.value?.trim()||'';
    let rows5=await fetchCsv(csvUrl);
    if(!rows5.length) throw new Error('ملف CSV فارغ');

    const rows30=aggregateOHLC(rows5,30);
    const rows60=aggregateOHLC(rows5,60);
    const rowsD =aggregateOHLC(rows5,1440);

    let series=rows5;
    if(currentTF===30) series=rows30;
    if(currentTF===60) series=rows60;
    if(currentTF===1440) series=rowsD;

    const rsiArr=rsi(series,RSI_PER);
    const macdObj=macd(series,EMA_FAST,EMA_SLOW,9);

    const i=series.length-1;
    paintSummary(rsiArr[i], macdObj.macd[i]);
    paintIndicators(rsiArr[i], macdObj.macd[i], macdObj.emaF[i], macdObj.emaS[i]);

    const piv=calcPivots(rowsD); paintPivots(piv);

    const tableRows=series.map((p,idx)=>({ts:p.ts, price:p.close, rsi:rsiArr[idx], macd:macdObj.macd[idx], emaF:macdObj.emaF[idx]}));
    paintTable(tableRows);

    const adv=buildAdvice(series, rsiArr, macdObj, rowsD); paintAdvice(adv);
    const lines = adv ? {entry:adv.entry, sl:adv.sl, tp1:adv.tp1, tp2:adv.tp2} : null;
    drawChart(series, lines);

    window.__lastSeries = series; // لرسومات تالية
  }catch(err){
    alert(`تعذّر تحميل/تحليل البيانات: ${err.message||err}`);
    console.error(err);
  }
}

/* حي */
async function refreshLive(){
  try{
    const r=await fetch(LIVE_JSON_URL,{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json();
    if(j && j.ok && Number.isFinite(j.price)){
      const t=Date.now();
      window.__livePrice=j.price;
      paintLive(j.price,t);
      // إعادة رسم الخط الحي فوق الشارت الحالي (إن وُجدت بيانات)
      if(window.__lastSeries?.length){
        drawChart(window.__lastSeries, null);
      }
    }
  }catch(e){ console.warn('Live error:',e); }
}

/* أحداث */
elBtnRun?.addEventListener('click', runAnalysis);
elTf5 ?.addEventListener('click', ()=>{ setActiveTF(5); runAnalysis(); });
elTf30?.addEventListener('click', ()=>{ setActiveTF(30); runAnalysis(); });
elTf60?.addEventListener('click', ()=>{ setActiveTF(60); runAnalysis(); });
elTfD ?.addEventListener('click', ()=>{ setActiveTF(1440); runAnalysis(); });

const LS_KEY='gs_csv_url';
if(elCsvInput){
  const saved=localStorage.getItem(LS_KEY)||'';
  if(!elCsvInput.value && saved) elCsvInput.value=saved;
  elCsvInput.addEventListener('input', ()=>{
    const v=elCsvInput.value.trim();
    if(v) localStorage.setItem(LS_KEY,v); else localStorage.removeItem(LS_KEY);
  });
}

/* تشغيل */
setActiveTF(5);
runAnalysis();
refreshLive();
setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
