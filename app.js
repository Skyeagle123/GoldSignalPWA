/* app.js — يعمل على API شموع 5د، Pivot على America/New_York، لا يعتمد على CSV */
import { DateTime } from 'https://cdn.skypack.dev/luxon';

/* ====== الإعدادات العامة ====== */
const LIVE_JSON_URL    = 'https://goldprice-proxy.samer-mourtada.workers.dev/price'; // سعر حي
const TABLE_ROWS       = 80;
const LIVE_REFRESH_SEC = 1;

const $ = (id) => document.getElementById(id);

/* عناصر واجهة */
const elApi5 = $('api5');
const elTf5 = $('tf5'), elTf30 = $('tf30'), elTf60 = $('tf60'), elTfD = $('tfD');
const elBtnRun = $('runBtn');

const elLivePrice = $('livePrice'), elLiveTime = $('liveTime');
const elSummaryText = $('summaryText'), elAdviceText = $('adviceText');

const elIndRSI = $('indRSI'), elIndMACD = $('indMACD'), elIndEMAF = $('indEMAF'), elIndEMAS = $('indEMAS');

const elPivotP=$('pivotP'), elR1=$('r1'), elR2=$('r2'), elR3=$('r3'), elS1=$('s1'), elS2=$('s2'), elS3=$('s3');
const elRowsBody = $('rowsBody');

const elEmaFast=$('emaFast'), elEmaSlow=$('emaSlow'), elRsiPeriod=$('rsiPeriod');
const elAtrPeriod=$('atrPeriod'), elSlMult=$('slMult'), elTp1Mult=$('tp1Mult'), elTp2Mult=$('tp2Mult');

/* حالة */
let EMA_FAST=+elEmaFast.value||12, EMA_SLOW=+elEmaSlow.value||26, RSI_PER=+elRsiPeriod.value||14;
let ATR_PERIOD=+elAtrPeriod.value||14, SL_ATR_MULT=+elSlMult.value||1.5, TP1_ATR_MULT=+elTp1Mult.value||1.0, TP2_ATR_MULT=+elTp2Mult.value||2.0;

let currentTF = 5;
let LAST_LIVE = null;
let __cache = null;

const nf2 = new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
const fmtDate = ts => new Date(ts).toLocaleDateString('en-CA');
const fmtTime = ts => new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const fmtDT   = ts => `${new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} ${new Date(ts).toLocaleDateString('en-CA')}`;

function setActiveTF(tf){
  currentTF=tf; [elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));
  ({5:elTf5,30:elTf30,60:elTf60,1440:elTfD}[tf])?.classList?.add('active');
}

/* ====== API ====== */
/* توقع استجابة: [{ time:"2025-09-25T13:35:00Z", open:..., high:..., low:..., close:... }, ...] */
async function fetchCandles5m(){
  const url = elApi5?.value?.trim();
  if (!url) throw new Error('الرجاء وضع رابط API للشموع 5د');
  const r = await fetch(url, {cache:'no-store'});
  if (!r.ok) throw new Error('HTTP '+r.status);
  const arr = await r.json();
  // تأكيد الحقول
  return (arr||[]).map(c=>({
    time: c.time,
    open: +c.open, high: +c.high, low: +c.low, close: +c.close
  })).filter(c=>Number.isFinite(Date.parse(c.time)) && Number.isFinite(c.close));
}

/* تجميع إلى 20 دقيقة / ساعة / يوم */
function bucketize(candles5, minutes){
  const out = [];
  if (!candles5?.length) return out;
  const zone = 'utc';
  const map = new Map();
  for (const c of candles5){
    const dt = DateTime.fromISO(c.time, {zone});
    let b;
    if (minutes === 1440){
      // يوم على America/New_York
      const dtNY = dt.setZone('America/New_York');
      const key = dtNY.toFormat('yyyy-LL-dd');
      b = key; // نجمع باليوم (NY)
      const rec = map.get(b);
      if (!rec) map.set(b, { ts: dtNY.startOf('day').toMillis(), open: c.open, high: c.high, low: c.low, close: c.close });
      else { rec.high=Math.max(rec.high,c.high); rec.low=Math.min(rec.low,c.low); rec.close=c.close; }
    } else {
      const bucket = Math.floor((dt.toMillis())/(minutes*60*1000))*(minutes*60*1000);
      b = bucket;
      const rec = map.get(b);
      if (!rec) map.set(b, { ts: bucket, open: c.open, high: c.high, low: c.low, close: c.close });
      else { rec.high=Math.max(rec.high,c.high); rec.low=Math.min(rec.low,c.low); rec.close=c.close; }
    }
  }
  return [...map.values()].sort((a,b)=>a.ts-b.ts);
}

/* انديكاتورات أساسية */
function ema(series,period){ const out=Array(series.length).fill(null), k=2/(period+1); let e=null,sum=0;
  for(let i=0;i<series.length;i++){ const p=series[i].close; if(i<period){ sum+=p; if(i===period-1){ e=sum/period; out[i]=e; } } else { e=p*k+e*(1-k); out[i]=e; } } return out; }
function rsi(series,period=14){ const out=Array(series.length).fill(null); if(series.length<=period) return out;
  let g=0,l=0; for(let i=1;i<=period;i++){ const d=series[i].close-series[i-1].close; if(d>=0) g+=d; else l-=d; }
  let avgG=g/period, avgL=l/period; out[period]=avgL===0?100:100-(100/(1+(avgG/avgL)));
  for(let i=period+1;i<series.length;i++){ const d=series[i].close-series[i-1].close; const G=d>0?d:0, L=d<0?-d:0;
    avgG=(avgG*(period-1)+G)/period; avgL=(avgL*(period-1)+L)/period; out[i]=avgL===0?100:100-(100/(1+(avgG/avgL))); } return out; }
function macd(series,fast=12,slow=26,signal=9){
  const emaF=ema(series,fast), emaS=ema(series,slow);
  const m=series.map((_,i)=> (emaF[i]==null||emaS[i]==null)?null:(emaF[i]-emaS[i]) );
  const pts=m.map((v,i)=>({ts:series[i].ts, close:(v==null)?NaN:v})); const clean=pts.filter(p=>Number.isFinite(p.close));
  const sigClean=ema(clean,signal); const sigFull=Array(series.length).fill(null);
  for(let i=0,j=0;i<series.length;i++){ if(Number.isFinite(pts[i]?.close)) sigFull[i]=sigClean[j++]; }
  return {emaF,emaS,macd:m,signal:sigFull};
}
function atr(series,period=14){
  const tr=Array(series.length).fill(null), out=Array(series.length).fill(null);
  for(let i=0;i<series.length;i++){ const h=series[i].high,l=series[i].low; if(i===0){ tr[i]=h-l; continue; }
    const pc=series[i-1].close; tr[i]=Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)); }
  let sum=0; for(let i=0;i<series.length;i++){ const v=tr[i]; if(i<period){ sum+=v; if(i===period-1) out[i]=sum/period; } else out[i]=(out[i-1]*(period-1)+v)/period; }
  return out;
}

/* تصنيف */
function classifyBase(rsiVal, macdVal){ if(macdVal==null||rsiVal==null) return 'حيادي'; if(macdVal>0&&rsiVal>=50&&rsiVal<=70) return 'شراء'; if(macdVal<0&&rsiVal<=50) return 'بيع'; return 'حيادي'; }
function classifyPrecise({rsiVal, macdNow, macdPrev, macdSig, price, emaF, emaS}){
  if([rsiVal,macdNow,emaF,emaS].some(v=>!Number.isFinite(v))) return 'حيادي';
  const crossUp=Number.isFinite(macdPrev)&&macdPrev<=macdSig&&macdNow>macdSig;
  const crossDn=Number.isFinite(macdPrev)&&macdPrev>=macdSig&&macdNow<macdSig;
  if((crossUp||macdNow>macdSig)&&price>emaF&&emaF>emaS&&rsiVal>50&&rsiVal<68) return 'شراء';
  if((crossDn||macdNow<macdSig)&&price<emaF&&emaF<emaS&&rsiVal<50) return 'بيع';
  return 'حيادي';
}
let PRO_MODE=false;
function classifyFinal(ctx){ return PRO_MODE ? classifyPrecise(ctx) : classifyBase(ctx.rsiVal, ctx.macdNow); }

/* Pivot من اليوم السابق المكتمل (NY) */
function pivotsFromDailyNY(daily){ if(!daily||daily.length<2) return null;
  const y = daily[daily.length-2]; const H=y.high, L=y.low, C=y.close;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

/* عرض */
function paintLive(price,ts){ if(elLivePrice&&Number.isFinite(price)) elLivePrice.textContent=nf2.format(price); if(elLiveTime&&ts) elLiveTime.textContent=fmtDT(ts); }
function paintIndicators(rsiVal,macdVal,emaFv,emaSv){ elIndRSI.textContent=Number.isFinite(rsiVal)?nf2.format(rsiVal):'—'; elIndMACD.textContent=Number.isFinite(macdVal)?nf4.format(macdVal):'—'; elIndEMAF.textContent=Number.isFinite(emaFv)?nf2.format(emaFv):'—'; elIndEMAS.textContent=Number.isFinite(emaSv)?nf2.format(emaSv):'—'; }
function paintSummary(rsiVal, macdVal, extras){ if(!elSummaryText) return; const s=classifyFinal({rsiVal, macdNow:extras?.macdNow, macdPrev:extras?.macdPrev, macdSig:extras?.macdSig, price:extras?.price, emaF:extras?.emaF, emaS:extras?.emaS}); elSummaryText.textContent=s+(PRO_MODE?' (دقيق)':''); elSummaryText.style.color=s==='شراء'?'#10b981':s==='بيع'?'#ef4444':'#f59e0b'; }
function paintPivots(p){ if(!p) return; elPivotP.textContent=nf2.format(p.P); elR1.textContent=nf2.format(p.R1); elR2.textContent=nf2.format(p.R2); elR3.textContent=nf2.format(p.R3); elS1.textContent=nf2.format(p.S1); elS2.textContent=nf2.format(p.S2); elS3.textContent=nf2.format(p.S3); }
function paintTable(rows){ elRowsBody.innerHTML=''; for (const r of rows.slice(-TABLE_ROWS).reverse()){ const s=classifyBase(r.rsi,r.macd); const color=s==='شراء'?'#10b981':s==='بيع'?'#ef4444':'#f59e0b'; const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.date}</td><td>${r.time}</td><td>${nf2.format(r.price)}</td><td style="color:${color};font-weight:600">${s}</td><td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td><td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td><td>${Number.isFinite(r.emaF)?nf2.format(r.emaF):'—'}</td>`; elRowsBody.appendChild(tr);} }

/* شارت */
function makeHiDPICanvas(canvas){ const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,3)); const rect=canvas.getBoundingClientRect(); canvas.width=Math.round(rect.width*dpr); canvas.height=Math.round(rect.height*dpr); const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return ctx; }
function renderTradeChart(series, lines){
  const canvas=document.getElementById('tradeChart'); if(!canvas||!series?.length) return;
  const ctx=makeHiDPICanvas(canvas); const W=canvas.clientWidth, H=canvas.clientHeight;
  ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,W,H);
  const data=series.slice(-120); let minY=Math.min(...data.map(d=>d.low)), maxY=Math.max(...data.map(d=>d.high));
  const add=v=>{ if(Number.isFinite(v)){ minY=Math.min(minY,v); maxY=Math.max(maxY,v); } };
  add(lines?.entry); add(lines?.sl); add(lines?.tp1); add(lines?.tp2); add(window.__livePrice);
  if(minY===maxY){ minY-=1; maxY+=1; } const pad=(maxY-minY)*0.08; minY-=pad; maxY+=pad;
  const x0=46,x1=W-12,y0=16,y1=H-24, plotW=x1-x0, plotH=y1-y0;
  const xAt=i=>x0+(i/(data.length-1))*plotW; const yAt=v=>y1-((v-minY)/(maxY-minY))*plotH;

  ctx.strokeStyle='#223047'; ctx.lineWidth=1; ctx.font='12px system-ui'; ctx.fillStyle='#9ca3af'; ctx.textAlign='right'; ctx.textBaseline='middle';
  for(let g=0; g<=4; g++){ const yVal=minY+(g/4)*(maxY-minY); const y=Math.round(yAt(yVal))+0.5; ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); ctx.fillText(nf2.format(yVal),x0-6,y); }

  const cw=Math.max(2, plotW/Math.max(30,data.length)*0.7);
  for(let i=0;i<data.length;i++){ const d=data[i]; const x=xAt(i); const yH=yAt(d.high), yL=yAt(d.low), yO=yAt(d.open), yC=yAt(d.close); const bull=d.close>=d.open;
    ctx.strokeStyle=bull?'#16a34a':'#ef4444'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL); ctx.stroke();
    const xL=x-cw/2,xR=x+cw/2; ctx.beginPath(); ctx.moveTo(xL,yO); ctx.lineTo(xR,yO); ctx.lineTo(xR,yC); ctx.lineTo(xL,yC); ctx.closePath();
    ctx.fillStyle=bull?'#16a34a':'#ef4444'; ctx.globalAlpha=0.85; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
  }

  function drawHLine(val,color,label){ if(!Number.isFinite(val)) return; const y=Math.round(yAt(val))+0.5;
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=2; ctx.setLineDash([6,5]); ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); ctx.setLineDash([]);
    const tag=`${label}: ${nf2.format(val)}`; const tw=ctx.measureText(tag).width+10, th=18, bx=x0+8, by=y-th-6;
    ctx.fillStyle='#0b1220'; ctx.strokeStyle=color; ctx.lineWidth=1; ctx.beginPath(); (ctx.roundRect?ctx.roundRect(bx,by,tw,th,6):ctx.rect(bx,by,tw,th)); ctx.fill(); ctx.stroke();
    ctx.fillStyle=color; ctx.font='12px system-ui'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(tag,bx+6,by+th/2); ctx.restore(); }

  // خطوط
  drawHLine(lines?.entry,'#60a5fa','Entry');
  drawHLine(lines?.tp1,'#22c55e','TP1');
  drawHLine(lines?.tp2,'#22c55e','TP2');
  drawHLine(lines?.sl,'#f87171','SL');
  if(Number.isFinite(window.__livePrice)) drawHLine(window.__livePrice,'#ffffff','Live'); // أبيض
}

/* مساعدات */
function rsiMacdContext(series, rsiArr, macdObj, i){ return { rsiVal:rsiArr[i], macdNow:macdObj.macd[i], macdPrev:macdObj.macd[i-1], macdSig:macdObj.signal[i], price:series[i].close, emaF:macdObj.emaF[i], emaS:macdObj.emaS[i] }; }
function atrPct(atrVal, price){ return (Number.isFinite(atrVal)&&Number.isFinite(price)&&price>0)?(100*atrVal/price):NaN; }
function adjustEntry(entry, priceNow, atrV, side){ if(!Number.isFinite(entry)||!Number.isFinite(priceNow)||!Number.isFinite(atrV)) return entry; const EPS=0.01; if(Math.abs(entry-priceNow)<EPS){ const bump=0.2*atrV; return (side==='شراء')? priceNow+bump : priceNow-bump; } return entry; }

/* نصيحة */
function filteredSignal(series, rsiArr, macdObj, atrArr){
  const i=series.length-1; const ctx=rsiMacdContext(series, rsiArr, macdObj, i); let sig=classifyFinal(ctx);
  const nowPx=series[i].close; const atrv=atrArr?.[i]; const apct=atrPct(atrv, nowPx);
  if(Number.isFinite(apct)&&(apct<0.05||apct>0.80)) sig='حيادي'; // نفس نطاق الإعدادات الافتراضي
  return sig;
}
function buildAdvice(series, rsiArr, macdObj, pivots, atrArr, liveInfo){
  if(!series?.length) return '—'; const i=series.length-1; const emaS=macdObj.emaS[i];
  const lastClose=series[i].close;
  const nowPx=(liveInfo&&(Date.now()-liveInfo.timeMs)<20000&&Number.isFinite(liveInfo.price))?liveInfo.price:lastClose;

  const sig=filteredSignal(series, rsiArr, macdObj, atrArr);
  const atrV=atrArr?.[i] ?? Math.max(0.3, Math.abs(series[i].high-series[i].low));

  if(sig==='حيادي'){ return `الإطار: ${tfLabel(currentTF)} • الإشارة: حيادي. آخر سعر: ${nf2.format(nowPx)}.`; }

  let entry=nowPx, sl, tp1, tp2;
  if(sig==='شراء'){
    entry = Math.max(nowPx, Number.isFinite(emaS)?emaS:nowPx);
    entry = adjustEntry(entry, nowPx, atrV, 'شراء');
    sl  = entry - SL_ATR_MULT*atrV;
    tp1 = entry + TP1_ATR_MULT*atrV;
    tp2 = entry + TP2_ATR_MULT*atrV;
    if (pivots){ tp1 = Math.max(tp1, pivots.R1 ?? tp1); tp2 = Math.max(tp2, pivots.R2 ?? tp2); }
  } else {
    entry = Math.min(nowPx, Number.isFinite(emaS)?emaS:nowPx);
    entry = adjustEntry(entry, nowPx, atrV, 'بيع');
    sl  = entry + SL_ATR_MULT*atrV;
    tp1 = entry - TP1_ATR_MULT*atrV;
    tp2 = entry - TP2_ATR_MULT*atrV;
    if (pivots){ tp1 = Math.min(tp1, pivots.S1 ?? tp1); tp2 = Math.min(tp2, pivots.S2 ?? tp2); }
  }

  return `الإطار: ${tfLabel(currentTF)} • الإشارة: ${sig}.
سعر الدخول: ${nf2.format(entry)} • وقف الخسارة: ${nf2.format(sl)} • الأهداف: ${nf2.format(tp1)} ثم ${nf2.format(tp2)}.`;
}

/* أدوات */
function tfLabel(tf){ return tf===5?'5 دقائق':tf===30?'20 دقيقة':tf===60?'ساعة':tf===1440?'يوم':(tf+'m'); }
function mergeLiveIntoSeries(series, tfMinutes, live){
  if(!series?.length||!live) return series; const ms=tfMinutes*60*1000; const bucket=Math.floor(live.timeMs/ms)*ms;
  const out=series.slice(); const last={...out[out.length-1]};
  if(bucket===last.ts){ last.close=live.price; last.high=Math.max(last.high,live.price); last.low=Math.min(last.low,live.price); out[out.length-1]=last; }
  else if(bucket>last.ts){ out.push({ ts: bucket, open:last.close, high:live.price, low:live.price, close:live.price }); }
  return out;
}

/* تشغيل التحليل */
async function runAnalysis(){
  try{
    // 1) جلب شموع 5د من API
    const m5 = await fetchCandles5m();
    if (!m5.length) throw new Error('لا توجد شموع 5د من الـAPI');

    // 2) توليد السلاسل بحسب الإطار
    const rows5   = bucketize(m5, 5);
    const rows20  = bucketize(m5, 20);
    const rows60  = bucketize(m5, 60);
    const rowsDay = bucketize(m5, 1440); // يوم على NY

    let base = rows5;
    if (currentTF===30)   base = rows20;
    if (currentTF===60)   base = rows60;
    if (currentTF===1440) base = rowsDay;

    // دمج السعر الحي في الشمعة الحالية
    const merged = LAST_LIVE ? mergeLiveIntoSeries(base, currentTF, LAST_LIVE) : base;

    // 3) مؤشرات
    const rsiArr  = rsi(merged, RSI_PER);
    const macdObj = macd(merged, EMA_FAST, EMA_SLOW, 9);
    const atrArr  = atr(merged, ATR_PERIOD);

    // 4) Pivot يومي على NY من rowsDay
    const piv = pivotsFromDailyNY(rowsDay);

    // 5) عرض المؤشرات
    const i = merged.length-1, priceNow = merged[i].close;
    paintSummary(rsiArr[i], macdObj.macd[i], {macdPrev:macdObj.macd[i-1], macdSig:macdObj.signal[i], price:priceNow, emaF:macdObj.emaF[i], emaS:macdObj.emaS[i]});
    paintIndicators(rsiArr[i], macdObj.macd[i], macdObj.emaF[i], macdObj.emaS[i]);
    paintPivots(piv);

    // جدول
    const tableRows = merged.map((p,idx)=>({ts:p.ts, date:fmtDate(p.ts), time:fmtTime(p.ts), price:p.close, rsi:rsiArr[idx], macd:macdObj.macd[idx], emaF:macdObj.emaF[idx]}));
    paintTable(tableRows);

    // 6) نصيحة + خطوط الشارت
    const advice = buildAdvice(merged, rsiArr, macdObj, piv, atrArr, LAST_LIVE);
    if (elAdviceText) elAdviceText.textContent = advice;

    const aNow = atrArr?.[i] ?? 0;
    let sigNow = classifyFinal({ rsiVal:rsiArr[i], macdNow:macdObj.macd[i], macdPrev:macdObj.macd[i-1], macdSig:macdObj.signal[i], price:priceNow, emaF:macdObj.emaF[i], emaS:macdObj.emaS[i] });
    const apct = atrPct(aNow, priceNow); if(Number.isFinite(apct)&&(apct<0.05||apct>0.80)) sigNow='حيادي';
    let entryLine = (sigNow==='شراء') ? Math.max(priceNow, Number.isFinite(macdObj.emaS[i])?macdObj.emaS[i]:priceNow)
                                       : (sigNow==='بيع')  ? Math.min(priceNow, Number.isFinite(macdObj.emaS[i])?macdObj.emaS[i]:priceNow)
                                       : null;
    entryLine = adjustEntry(entryLine, priceNow, aNow, sigNow==='شراء'?'شراء':sigNow==='بيع'?'بيع':null);
    const lines = {
      entry: entryLine,
      sl : (sigNow==='شراء') ? entryLine - SL_ATR_MULT*aNow : (sigNow==='بيع') ? entryLine + SL_ATR_MULT*aNow : undefined,
      tp1: (sigNow==='شراء') ? entryLine + TP1_ATR_MULT*aNow : (sigNow==='بيع') ? entryLine - TP1_ATR_MULT*aNow : undefined,
      tp2: (sigNow==='شراء') ? entryLine + TP2_ATR_MULT*aNow : (sigNow==='بيع') ? entryLine - TP2_ATR_MULT*aNow : undefined,
    };
    window.__lastSeriesForChart = merged;
    renderTradeChart(merged, lines);

    __cache = { tf: currentTF, series: merged, rsiArr, macdObj, piv, atrArr };
  }catch(err){
    alert('تعذّر التحليل: '+(err.message||err)); console.error(err);
  }
}

/* إعادة إسقاط مع السعر الحي */
function reprojectWithLive(){
  if (!__cache || !LAST_LIVE) return;
  const { tf } = __cache;
  const base = __cache.series;
  const merged = mergeLiveIntoSeries(base, tf, LAST_LIVE);

  const rsiArr  = rsi(merged, RSI_PER);
  const macdObj = macd(merged, EMA_FAST, EMA_SLOW, 9);
  const atrArr  = atr(merged, ATR_PERIOD);

  const i=merged.length-1, priceNow=merged[i].close, emaS=macdObj.emaS[i];
  let sigNow = classifyFinal({ rsiVal:rsiArr[i], macdNow:macdObj.macd[i], macdPrev:macdObj.macd[i-1], macdSig:macdObj.signal[i], price:priceNow, emaF:macdObj.emaF[i], emaS });
  const aNow=atrArr?.[i] ?? 0;
  const apct=atrPct(aNow, priceNow); if(Number.isFinite(apct)&&(apct<0.05||apct>0.80)) sigNow='حيادي';

  let entryLine=(sigNow==='شراء')?Math.max(priceNow, Number.isFinite(emaS)?emaS:priceNow):(sigNow==='بيع')?Math.min(priceNow, Number.isFinite(emaS)?emaS:priceNow):null;
  entryLine = adjustEntry(entryLine, priceNow, aNow, sigNow==='شراء'?'شراء':sigNow==='بيع'?'بيع':null);
  const lines={ entry:entryLine,
    sl:(sigNow==='شراء')?entryLine - SL_ATR_MULT*aNow : (sigNow==='بيع')?entryLine + SL_ATR_MULT*aNow : undefined,
    tp1:(sigNow==='شراء')?entryLine + TP1_ATR_MULT*aNow : (sigNow==='بيع')?entryLine - TP1_ATR_MULT*aNow : undefined,
    tp2:(sigNow==='شراء')?entryLine + TP2_ATR_MULT*aNow : (sigNow==='بيع')?entryLine - TP2_ATR_MULT*aNow : undefined };
  renderTradeChart(merged, lines);

  if (elAdviceText){ elAdviceText.textContent = buildAdvice(merged, rsiArr, macdObj, __cache.piv, atrArr, LAST_LIVE); }
}

/* السعر الحي */
async function refreshLive(){
  try{
    const r = await fetch(LIVE_JSON_URL, {cache:'no-store'});
    if (!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    if (j && j.ok && Number.isFinite(j.price)){
      const t = Date.now();
      paintLive(j.price, t);
      window.__livePrice = j.price;
      LAST_LIVE = {price:j.price, timeMs:t};
      reprojectWithLive();
    }
  }catch(e){ console.warn('Live error:', e); }
}

/* أحداث */
elBtnRun?.addEventListener('click', runAnalysis);
elTf5?.addEventListener('click',  ()=>{ setActiveTF(5);    runAnalysis(); });
elTf30?.addEventListener('click', ()=>{ setActiveTF(30);   runAnalysis(); });
elTf60?.addEventListener('click', ()=>{ setActiveTF(60);   runAnalysis(); });
elTfD?.addEventListener('click',  ()=>{ setActiveTF(1440); runAnalysis(); });

elEmaFast?.addEventListener('input', ()=>{ EMA_FAST=+elEmaFast.value||12; runAnalysis(); });
elEmaSlow?.addEventListener('input', ()=>{ EMA_SLOW=+elEmaSlow.value||26; runAnalysis(); });
elRsiPeriod?.addEventListener('input',()=>{ RSI_PER=+elRsiPeriod.value||14; runAnalysis(); });

elAtrPeriod?.addEventListener('input', ()=>{ ATR_PERIOD=Math.max(2,+elAtrPeriod.value||14); runAnalysis(); });
elSlMult?.addEventListener('input',    ()=>{ SL_ATR_MULT=+elSlMult.value||1.5; });
elTp1Mult?.addEventListener('input',   ()=>{ TP1_ATR_MULT=+elTp1Mult.value||1.0; });
elTp2Mult?.addEventListener('input',   ()=>{ TP2_ATR_MULT=+elTp2Mult.value||2.0; });

/* حفظ رابط الـAPI محلياً */
const LS_API='gs_api5';
if(elApi5){ const saved=localStorage.getItem(LS_API)||''; if(!elApi5.value&&saved) elApi5.value=saved;
  elApi5.addEventListener('input',()=>{ const v=elApi5.value.trim(); if(v) localStorage.setItem(LS_API,v); else localStorage.removeItem(LS_API); }); }

/* تشغيل أولي */
setActiveTF(5);
runAnalysis();
refreshLive();
setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
