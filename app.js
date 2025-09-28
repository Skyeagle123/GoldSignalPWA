/************ GoldSignals - app.js (MTF + ATR Regime + PositionSize + Backtest + Live Candles) ************/

const BUILD_CANDLES_FROM_LIVE = true; // ✅ فعّل بناء الشموع من السعر الحي (Option A)

const LIVE_JSON_URL    = 'https://goldprice-proxy.samer-mourtada.workers.dev/price';
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const TABLE_ROWS       = 80;
const LIVE_REFRESH_SEC = 1;   // تحديث الحي كل ثانية

const $ = (id) => document.getElementById(id);
const elCsvInput   = $('csvInput');
const elTf5        = $('tf5');
const elTf30       = $('tf30');
const elTf60       = $('tf60');
const elTfD        = $('tfD');
const elBtnRun     = $('runBtn');
const elProMode    = $('proMode');
const elMtfConfirm = $('mtfConfirm');

const elLivePrice  = $('livePrice');
const elLiveTime   = $('liveTime');
const elSummaryText= $('summaryText');
const elAdviceText = $('adviceText');

const elIndRSI  = $('indRSI');
const elIndMACD = $('indMACD');
const elIndEMAF = $('indEMAF');
const elIndEMAS = $('indEMAS');

const elPivotP = $('pivotP');
const elR1 = $('r1'), elR2 = $('r2'), elR3 = $('r3');
const elS1 = $('s1'), elS2 = $('s2'), elS3 = $('s3');

const elRowsBody = $('rowsBody');

const elEmaFast   = $('emaFast');
const elEmaSlow   = $('emaSlow');
const elRsiPeriod = $('rsiPeriod');

const elAtrPeriod = $('atrPeriod');
const elSlMult    = $('slMult');
const elTp1Mult   = $('tp1Mult');
const elTp2Mult   = $('tp2Mult');
const elAtrMinPct = $('atrMinPct');
const elAtrMaxPct = $('atrMaxPct');

const elAcctSize  = $('acctSize');
const elRiskPct   = $('riskPct');

const elBtTf      = $('btTf');
const elBtBars    = $('btBars');
const elBtRun     = $('btRun');
const elBtResult  = $('btResult');

let EMA_FAST = parseInt(elEmaFast?.value || '12', 10);
let EMA_SLOW = parseInt(elEmaSlow?.value || '26', 10);
let RSI_PER  = parseInt(elRsiPeriod?.value || '14', 10);

let ATR_PERIOD   = parseInt(elAtrPeriod?.value || '14', 10);
let SL_ATR_MULT  = parseFloat(elSlMult?.value  || '1.5');
let TP1_ATR_MULT = parseFloat(elTp1Mult?.value || '1.0');
let TP2_ATR_MULT = parseFloat(elTp2Mult?.value || '2.0');
let ATR_MIN_PCT  = parseFloat(elAtrMinPct?.value || '0.05');
let ATR_MAX_PCT  = parseFloat(elAtrMaxPct?.value || '0.80');

let ACCT_SIZE    = parseFloat(elAcctSize?.value || '10000');
let RISK_PCT     = parseFloat(elRiskPct?.value  || '1.0');

let PRO_MODE     = !!elProMode?.checked;
let MTF_CONFIRM  = !!elMtfConfirm?.checked;

elProMode?.addEventListener('change',()=>{ PRO_MODE = elProMode.checked; runAnalysis(); });
elMtfConfirm?.addEventListener('change',()=>{ MTF_CONFIRM = elMtfConfirm.checked; runAnalysis(); });

elEmaFast?.addEventListener('input', ()=> { EMA_FAST = parseInt(elEmaFast.value||'12',10); runAnalysis(); });
elEmaSlow?.addEventListener('input', ()=> { EMA_SLOW = parseInt(elEmaSlow.value||'26',10); runAnalysis(); });
elRsiPeriod?.addEventListener('input',()=> { RSI_PER  = parseInt(elRsiPeriod.value||'14',10); runAnalysis(); });

elAtrPeriod?.addEventListener('input', ()=> { ATR_PERIOD  = Math.max(2, parseInt(elAtrPeriod.value||'14',10)); runAnalysis(); });
elSlMult?.addEventListener('input',    ()=> { SL_ATR_MULT  = parseFloat(elSlMult.value||'1.5');  updateAdviceOnly(); });
elTp1Mult?.addEventListener('input',   ()=> { TP1_ATR_MULT = parseFloat(elTp1Mult.value||'1.0'); updateAdviceOnly(); });
elTp2Mult?.addEventListener('input',   ()=> { TP2_ATR_MULT = parseFloat(elTp2Mult.value||'2.0'); updateAdviceOnly(); });
elAtrMinPct?.addEventListener('input', ()=> { ATR_MIN_PCT  = parseFloat(elAtrMinPct.value||'0.05'); runAnalysis(); });
elAtrMaxPct?.addEventListener('input', ()=> { ATR_MAX_PCT  = parseFloat(elAtrMaxPct.value||'0.80'); runAnalysis(); });

elAcctSize?.addEventListener('input',  ()=> { ACCT_SIZE  = parseFloat(elAcctSize.value||'10000'); updateAdviceOnly(); });
elRiskPct?.addEventListener('input',   ()=> { RISK_PCT   = parseFloat(elRiskPct.value||'1.0');   updateAdviceOnly(); });

const nf2 = new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat('en-US', {minimumFractionDigits:4, maximumFractionDigits:4});

function fmtLocalDateTime(ts){
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-CA');
  const time = d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  return `${time} ${date}`;
}
function toLocalDate(ts){ return new Date(ts).toLocaleDateString('en-CA'); }
function toLocalTime(ts){ return new Date(ts).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}); }

let currentTF = 5;
function setActiveTF(tf){
  currentTF = tf;
  [elTf5, elTf30, elTf60, elTfD].forEach(b => b?.classList?.remove('active'));
  if (tf===5)    elTf5?.classList?.add('active');
  if (tf===30)   elTf30?.classList?.add('active');
  if (tf===60)   elTf60?.classList?.add('active');
  if (tf===1440) elTfD?.classList?.add('active');
}
function tfLabel(tf){
  if (tf===5) return '5 دقائق';
  if (tf===30) return '30 دقيقة';
  if (tf===60) return 'ساعة';
  if (tf===1440) return 'يوم';
  return tf+'m';
}

/* CSV */
function parseCsv(text){
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase();
  const out = [];

  if (header.includes('symbol') && header.includes('date') && header.includes('time')) {
    for (let i=1;i<lines.length;i++){
      const [sym,d,t,o,h,l,c] = lines[i].split(',');
      if (!d || !t) continue;
      const ts = Date.parse(`${d}T${t}Z`);
      const open=+o, high=+h, low=+l, close=+c;
      if (Number.isFinite(ts) && Number.isFinite(close)){
        out.push({ ts, open:Number.isFinite(open)?open:close, high:Number.isFinite(high)?high:close, low:Number.isFinite(low)?low:close, close });
      }
    }
  } else {
    for (let i=1;i<lines.length;i++){
      const [d,c] = lines[i].split(',');
      const ts = Date.parse(d);
      const close = +c;
      if (Number.isFinite(ts) && Number.isFinite(close)){
        out.push({ ts, open: close, high: close, low: close, close });
      }
    }
  }
  out.sort((a,b)=>a.ts-b.ts);
  return out;
}
async function fetchCsv(url){
  const u = (url && url.trim()) ? url.trim() : DEFAULT_5M_CSV;
  const full = u.startsWith('http') ? u : `${u}?t=${Date.now()}`;
  const r = await fetch(full, {cache:'no-store'});
  if (!r.ok) throw new Error(`CSV HTTP ${r.status}`);
  return parseCsv(await r.text());
}
function aggregateOHLC(rows, minutes){
  const bucketMs = minutes*60*1000;
  const map = new Map();
  for (const r of rows){
    const b = Math.floor(r.ts/bucketMs)*bucketMs;
    let rec = map.get(b);
    if (!rec){
      rec = { ts:b, open:r.open, high:r.high, low:r.low, close:r.close };
      map.set(b, rec);
    }else{
      rec.high = Math.max(rec.high, r.high);
      rec.low  = Math.min(rec.low,  r.low);
      rec.close= r.close;
    }
  }
  return [...map.values()].sort((a,b)=>a.ts-b.ts);
}

/* ✅ بناء شموع من السعر الحي */
function floorToBucket(ts, minutes){ const ms = minutes*60*1000; return Math.floor(ts/ms)*ms; }
function updateLiveCandle(series, minutes, price, nowTs){
  if (!series || !series.length){
    series.push({ ts: floorToBucket(nowTs, minutes), open:price, high:price, low:price, close:price });
    return;
  }
  const b = floorToBucket(nowTs, minutes);
  const last = series[series.length-1];
  if (!last || last.ts < b){
    series.push({ ts:b, open:price, high:price, low:price, close:price });
  }else{
    last.high = Math.max(last.high, price);
    last.low  = Math.min(last.low , price);
    last.close = price;
  }
}

/* مؤشرات */
function ema(series, period){
  const out = new Array(series.length).fill(null);
  const k = 2/(period+1);
  let e=null,sum=0;
  for (let i=0;i<series.length;i++){
    const p = series[i].close;
    if (i<period){ sum+=p; if(i===period-1){ e=sum/period; out[i]=e; } }
    else { e = p*k + e*(1-k); out[i]=e; }
  }
  return out;
}
function rsi(series, period=14){
  const out = new Array(series.length).fill(null);
  if (series.length <= period) return out;
  let gain=0, loss=0;
  for(let i=1;i<=period;i++){
    const d = series[i].close - series[i-1].close;
    if (d>=0) gain+=d; else loss-=d;
  }
  let avgG=gain/period, avgL=loss/period;
  out[period] = avgL===0?100:100-(100/(1+(avgG/avgL)));
  for(let i=period+1;i<series.length;i++){
    const d = series[i].close - series[i-1].close;
    const g = d>0?d:0, l = d<0?-d:0;
    avgG = (avgG*(period-1)+g)/period;
    avgL = (avgL*(period-1)+l)/period;
    out[i] = avgL===0?100:100-(100/(1+(avgG/avgL)));
  }
  return out;
}
function macd(series, fast=12, slow=26, signal=9){
  const emaF = ema(series, fast);
  const emaS = ema(series, slow);
  const m = series.map((_,i)=>{
    if (emaF[i]==null || emaS[i]==null) return null;
    return emaF[i]-emaS[i];
  });
  const pts = m.map((v,i)=>({ts:series[i].ts, close:(v==null)?NaN:v}));
  const clean = pts.filter(p=>Number.isFinite(p.close));
  const sigClean = ema(clean, signal);
  const sigFull = new Array(series.length).fill(null);
  for(let i=0,j=0;i<series.length;i++){
    if (Number.isFinite(pts[i]?.close)) sigFull[i]=sigClean[j++];
  }
  return { emaF, emaS, macd:m, signal:sigFull };
}
function atr(series, period=14){
  if (!series?.length) return [];
  const tr = new Array(series.length).fill(null);
  for(let i=0;i<series.length;i++){
    const h = series[i].high, l = series[i].low;
    if (i===0){ tr[i] = h-l; continue; }
    const pc = series[i-1].close;
    tr[i] = Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
  }
  const out = new Array(series.length).fill(null);
  let sum=0;
  for(let i=0;i<series.length;i++){
    const v = tr[i];
    if (i<period){ sum+=v; if(i===period-1){ out[i]=sum/period; } }
    else { out[i] = (out[i-1]*(period-1) + v)/period; }
  }
  return out;
}

/* تصنيف */
function classifyBase(rsiVal, macdVal){
  if (macdVal==null || rsiVal==null) return 'حيادي';
  if (macdVal>0 && rsiVal>=50 && rsiVal<=70) return 'شراء';
  if (macdVal<0 && rsiVal<=50) return 'بيع';
  return 'حيادي';
}
function classifyPrecise({rsiVal, macdNow, macdPrev, macdSig, price, emaF, emaS}){
  if ([rsiVal, macdNow, emaF, emaS].some(v=>!Number.isFinite(v))) return 'حيادي';
  const crossUp   = Number.isFinite(macdPrev) && macdPrev<=macdSig && macdNow>macdSig;
  const crossDown = Number.isFinite(macdPrev) && macdPrev>=macdSig && macdNow<macdSig;
  if ((crossUp || macdNow>macdSig) && price>emaF && emaF>emaS && rsiVal>50 && rsiVal<68) return 'شراء';
  if ((crossDown || macdNow<macdSig) && price<emaF && emaF<emaS && rsiVal<50)          return 'بيع';
  return 'حيادي';
}
function classifyFinal(ctx){ return PRO_MODE ? classifyPrecise(ctx) : classifyBase(ctx.rsiVal, ctx.macdNow); }

/* Pivot */
function calcPivots(daily){
  if (!daily || daily.length<2) return null;
  const y = daily[daily.length-2];
  const H=y.high, L=y.low, C=y.close;
  if (![H,L,C].every(Number.isFinite)) return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

/* === الرسم البياني (نفس دالتك) === */
function makeHiDPICanvas(canvas){
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
function renderTradeChart(series, lines){
  const canvas = document.getElementById('tradeChart');
  if (!canvas || !series || !series.length) return;

  const ctx = makeHiDPICanvas(canvas);
  const W = canvas.clientWidth, H = canvas.clientHeight;

  ctx.fillStyle = '#0b1220'; ctx.fillRect(0,0,W,H);

  const MAX_CANDLES = 120;
  const data = series.slice(-MAX_CANDLES);

  let minY = Math.min(...data.map(d=>d.low));
  let maxY = Math.max(...data.map(d=>d.high));
  const add = v => { if (Number.isFinite(v)){ minY = Math.min(minY, v); maxY = Math.max(maxY, v); } };
  add(lines?.entry); add(lines?.sl); add(lines?.tp1); add(lines?.tp2); add(window.__livePrice);

  if (minY === maxY){ minY-=1; maxY+=1; }
  const pad = (maxY-minY)*0.08; minY-=pad; maxY+=pad;

  const x0=46, x1=W-12, y0=16, y1=H-24;
  const plotW=x1-x0, plotH=y1-y0;

  const xAt = i => x0 + (i/(data.length-1))*plotW;
  const yAt = v => y1 - ((v-minY)/(maxY-minY))*plotH;

  // grid
  ctx.strokeStyle='#223047'; ctx.lineWidth=1;
  ctx.font='12px system-ui'; ctx.fillStyle='#9ca3af'; ctx.textAlign='right'; ctx.textBaseline='middle';
  const gridN=4;
  for(let g=0; g<=gridN; g++){
    const yVal=minY+(g/gridN)*(maxY-minY);
    const y=Math.round(yAt(yVal))+0.5;
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
    ctx.fillText(nf2.format(yVal),x0-6,y);
  }

  // candles
  const cw=Math.max(2, plotW/Math.max(30,data.length)*0.7);
  for(let i=0;i<data.length;i++){
    const d=data[i];
    const x=xAt(i);
    const yH=yAt(d.high), yL=yAt(d.low), yO=yAt(d.open), yC=yAt(d.close);
    const bull=d.close>=d.open;
    ctx.strokeStyle=bull?'#16a34a':'#ef4444';
    ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL); ctx.stroke();
    const xL=x-cw/2, xR=x+cw/2;
    ctx.beginPath(); ctx.moveTo(xL,yO); ctx.lineTo(xR,yO); ctx.lineTo(xR,yC); ctx.lineTo(xL,yC); ctx.closePath();
    ctx.fillStyle=bull?'#16a34a':'#ef4444'; ctx.globalAlpha=0.85; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
  }

  function drawHLine(val,color,label){
    if(!Number.isFinite(val)) return;
    const y=Math.round(yAt(val))+0.5;
    ctx.save();
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.setLineDash([6,5]);
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
    ctx.setLineDash([]);
    const tag=`${label}: ${nf2.format(val)}`;
    const tw=ctx.measureText(tag).width+10, th=18, bx=x0+8, by=y-th-6;
    ctx.fillStyle='#0b1220'; ctx.strokeStyle=color; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect?.(bx,by,tw,th,6); if(!ctx.roundRect){ ctx.rect(bx,by,tw,th); }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle=color; ctx.font='12px system-ui'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(tag,bx+6,by+th/2);
    ctx.restore();
  }

  // Entry/TP/SL
  drawHLine(lines?.entry,'#60a5fa','Entry');
  drawHLine(lines?.tp1,'#22c55e','TP1');
  drawHLine(lines?.tp2,'#22c55e','TP2');
  drawHLine(lines?.sl ,'#f87171','SL');

  // Live
  if (Number.isFinite(window.__livePrice)) {
    drawHLine(window.__livePrice,'#67e8f9','Live');
  }
}
window.addEventListener('resize', ()=>{
  if (window.__lastSeriesForChart) renderTradeChart(window.__lastSeriesForChart, window.__lastLinesForChart);
});

function rsiMacdContext(series, rsiArr, macdObj, i){
  return {
    rsiVal: rsiArr[i],
    macdNow: macdObj.macd[i],
    macdPrev: macdObj.macd[i-1],
    macdSig: macdObj.signal[i],
    price: series[i].close,
    emaF: macdObj.emaF[i],
    emaS: macdObj.emaS[i],
  };
}
function atrPct(atrVal, price){ return (Number.isFinite(atrVal) && Number.isFinite(price) && price>0) ? (100*atrVal/price) : NaN; }
function mtfOkIfEnabled(rows5, rows30, idx30, signal){
  if (!MTF_CONFIRM) return true;
  if (!rows30?.length) return true;
  const emaF30 = ema(rows30, EMA_FAST);
  const emaS30 = ema(rows30, EMA_SLOW);
  const j = (idx30!=null)? idx30 : (rows30.length-1);
  const f = emaF30[j], s = emaS30[j];
  if (!Number.isFinite(f) || !Number.isFinite(s)) return true;
  if (signal === 'شراء') return f > s;
  if (signal === 'بيع')  return f < s;
  return true;
}

/* نصيحة + Position Size */
function calcPositionSize(entry, sl){
  const riskAmt = ACCT_SIZE * (RISK_PCT/100);
  const dist    = Math.abs(entry - sl);
  if (!Number.isFinite(riskAmt) || !Number.isFinite(dist) || dist<=0) return null;
  const units   = riskAmt / dist;
  return { riskAmt, units };
}
function classifyForAdvice(series, rsiArr, macdObj){
  const i = series.length-1;
  const ctx = rsiMacdContext(series, rsiArr, macdObj, i);
  return classifyFinal(ctx);
}
function buildAdvice(tf, series, rsiArr, macdObj, pivots, liveInfo, atrArr, rows5Ref, rows30Ref){
  if (!series?.length) return '—';
  const i = series.length-1;
  const emaS   = macdObj.emaS[i];
  const lastClose = series[i].close;
  const nowPx = (liveInfo && (Date.now()-liveInfo.timeMs) < 20000 && Number.isFinite(liveInfo.price))
    ? liveInfo.price : lastClose;

  let sig = classifyForAdvice(series, rsiArr, macdObj);
  const atrV = atrArr?.[i] ?? Math.max(0.3, Math.abs(series[i].high - series[i].low));
  const atrp = atrPct(atrV, nowPx);
  if (Number.isFinite(atrp) && (atrp < ATR_MIN_PCT || atrp > ATR_MAX_PCT)) sig = 'حيادي';

  if (tf===5 && sig!=='حيادي' && rows5Ref && rows30Ref){
    const ok = mtfOkIfEnabled(rows5Ref, rows30Ref);
    if (!ok) sig = 'حيادي';
  }

  let entry = nowPx, sl, tp1, tp2;
  if (sig === 'شراء'){
    entry = Math.max(nowPx, Number.isFinite(emaS)?emaS:nowPx);
    sl  = entry - SL_ATR_MULT*atrV;
    tp1 = entry + TP1_ATR_MULT*atrV;
    tp2 = entry + TP2_ATR_MULT*atrV;
    if (pivots){ tp1 = Math.max(tp1, pivots.R1 ?? tp1); tp2 = Math.max(tp2, pivots.R2 ?? tp2); }
  } else if (sig === 'بيع'){
    entry = Math.min(nowPx, Number.isFinite(emaS)?emaS:nowPx);
    sl  = entry + SL_ATR_MULT*atrV;
    tp1 = entry - TP1_ATR_MULT*atrV;
    tp2 = entry - TP2_ATR_MULT*atrV;
    if (pivots){ tp1 = Math.min(tp1, pivots.S1 ?? tp1); tp2 = Math.min(tp2, pivots.S2 ?? tp2); }
  } else {
    let base = `الإطار: ${tfLabel(tf)} • الإشارة: حيادي. `;
    if (Number.isFinite(atrp)) base += `ATR%: ${nf2.format(atrp)} ضمن [${ATR_MIN_PCT}–${ATR_MAX_PCT}]؟ `;
    base += `آخر سعر: ${nf2.format(nowPx)}.`;
    return base;
  }

  const ps = calcPositionSize(entry, sl);
  const sizeTxt = ps ? ` • حجم تقريبي: ${nf2.format(ps.units)} وحدة (مخاطرة ≈ ${nf2.format(ps.riskAmt)}$)` : '';

  return `الإطار: ${tfLabel(tf)} • الإشارة: ${sig}.
سعر الدخول: ${nf2.format(entry)} • وقف الخسارة (ATR×${SL_ATR_MULT}): ${nf2.format(sl)} • الأهداف: ${nf2.format(tp1)} ثم ${nf2.format(tp2)}.${sizeTxt}`;
}

let LAST_LIVE = null;
let __cache = null;

/* التحليل */
async function runAnalysis(){
  try{
    const csvUrl = elCsvInput?.value?.trim() || '';
    let rows5 = await fetchCsv(csvUrl);
    if (!rows5.length) throw new Error('ملف CSV فارغ');

    const rows30   = aggregateOHLC(rows5, 30);
    const rows60   = aggregateOHLC(rows5, 60);
    const rowsDay  = aggregateOHLC(rows5, 1440);

    let series = rows5;
    if (currentTF===30)   series = rows30;
    if (currentTF===60)   series = rows60;
    if (currentTF===1440) series = rowsDay;

    const rsiArr  = rsi(series, RSI_PER);
    const macdObj = macd(series, EMA_FAST, EMA_SLOW, 9);
    const atrArr  = atr(series, ATR_PERIOD);

    const i = series.length-1;
    const priceNow = series[i].close;
    const rsiNow   = rsiArr[i];
    const macdNow  = macdObj.macd[i];
    const macdPrev = macdObj.macd[i-1];
    const macdSig  = macdObj.signal[i];
    const emaFnow  = macdObj.emaF[i];
    const emaSnow  = macdObj.emaS[i];

    paintSummary(rsiNow, macdNow, {macdPrev, macdSig, price:priceNow, emaF:emaFnow, emaS:emaSnow});
    paintIndicators(rsiNow, macdNow, emaFnow, emaSnow);

    const piv = calcPivots(rowsDay);
    paintPivots(piv);

    const tableRows = series.map((p,idx)=>({
      ts:p.ts, date: toLocalDate(p.ts), time: toLocalTime(p.ts),
      price:p.close, rsi:rsiArr[idx], macd:macdObj.macd[idx], emaF:macdObj.emaF[idx]
    }));
    paintTable(tableRows);

    const sNow = classifyFinal({rsiVal:rsiNow, macdNow, macdPrev, macdSig, price:priceNow, emaF:emaFnow, emaS:emaSnow});
    const aNow = atrArr?.[i] ?? 0;
    const entryLine = (sNow==='شراء')
      ? Math.max(priceNow, Number.isFinite(emaSnow)?emaSnow:priceNow)
      : (sNow==='بيع')
        ? Math.min(priceNow, Number.isFinite(emaSnow)?emaSnow:priceNow)
        : null;
    const lines = {
      entry: entryLine,
      sl : (sNow==='شراء') ? entryLine - SL_ATR_MULT*aNow
          : (sNow==='بيع') ? entryLine + SL_ATR_MULT*aNow : undefined,
      tp1: (sNow==='شراء') ? entryLine + TP1_ATR_MULT*aNow
          : (سNow==='بيع') ? entryLine - TP1_ATR_MULT*aNow : undefined,
      tp2: (sNow==='شراء') ? entryLine + TP2_ATR_MULT*aNow
          : (sNow==='بيع') ? entryLine - TP2_ATR_MULT*aNow : undefined,
    };

    window.__lastSeriesForChart = series;
    window.__lastLinesForChart  = lines;
    renderTradeChart(series, lines);

    if (elAdviceText){
      elAdviceText.textContent = buildAdvice(currentTF, series, rsiArr, macdObj, piv, LAST_LIVE, atrArr, rows5, rows30);
    }

    __cache = {tf: currentTF, series, rsiArr, macdObj, piv, atrArr, rows5, rows30, rows60, rowsDay};

  }catch(err){
    alert(`تعذّر تحميل/تحليل البيانات: ${err.message||err}`);
    console.error(err);
  }
}

/* تحديث النصيحة فقط + إعادة رسم الخطوط */
function updateAdviceOnly(){
  if (!__cache) return;
  const {tf, series, rsiArr, macdObj, piv, atrArr, rows5, rows30} = __cache;
  if (elAdviceText){
    elAdviceText.textContent = buildAdvice(tf, series, rsiArr, macdObj, piv, LAST_LIVE, atrArr, rows5, rows30);
  }
  if (window.__lastSeriesForChart){
    const i = series.length-1;
    const priceNow = series[i].close;
    const ctx = rsiMacdContext(series, rsiArr, macdObj, i);
    const sNow = classifyFinal(ctx);
    const aNow = atrArr?.[i] ?? 0;
    const emaS = macdObj.emaS[i];
    const entryLine = (sNow==='شراء')
      ? Math.max(priceNow, Number.isFinite(emaS)?emaS:priceNow)
      : (sNow==='بيع')
        ? Math.min(priceNow, Number.isFinite(emaS)?emaS:priceNow)
        : null;
    const lines = {
      entry: entryLine,
      sl : (sNow==='شراء') ? entryLine - SL_ATR_MULT*aNow
          : (sNow==='بيع') ? entryLine + SL_ATR_MULT*aNow : undefined,
      tp1: (سNow==='شراء') ? entryLine + TP1_ATR_MULT*aNow
          : (sNow==='بيع') ? entryLine - TP1_ATR_MULT*aNow : undefined,
      tp2: (sNow==='شراء') ? entryLine + TP2_ATR_MULT*aNow
          : (sNow==='بيع') ? entryLine - TP2_ATR_MULT*aNow : undefined,
    };
    window.__lastLinesForChart = lines;
    renderTradeChart(window.__lastSeriesForChart, lines);
  }
}

/* السعر الحي + دمج الشموع اللايف */
async function refreshLive(){
  try{
    const r = await fetch(LIVE_JSON_URL, {cache:'no-store'});
    if (!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    if (j && j.ok && Number.isFinite(j.price)){
      const t = Date.now();
      paintLive(j.price, t);
      window.__livePrice   = j.price;
      window.__liveTimeMs  = t;
      LAST_LIVE            = {price:j.price, timeMs:t};

      if (BUILD_CANDLES_FROM_LIVE && __cache){
        // 1) عدّل rows5 مباشرة من الحي
        updateLiveCandle(__cache.rows5, 5, j.price, t);

        // 2) أعِد توليد بقية الفريمات اعتمادًا على rows5
        __cache.rows30  = aggregateOHLC(__cache.rows5, 30);
        __cache.rows60  = aggregateOHLC(__cache.rows5, 60);
        __cache.rowsDay = aggregateOHLC(__cache.rows5, 1440);

        // 3) اختر السلسلة وفق الفريم الحالي
        let series = __cache.rows5;
        if (currentTF===30)   series = __cache.rows30;
        if (currentTF===60)   series = __cache.rows60;
        if (currentTF===1440) series = __cache.rowsDay;
        __cache.series = series;

        // 4) أعِد حساب مؤشرات آخر جزء فقط (خفيف)
        const tail = series.slice(-Math.max(EMA_SLOW+5, RSI_PER+5));
        const rsiTail  = rsi(tail, RSI_PER);
        const macdTail = macd(tail, EMA_FAST, EMA_SLOW, 9);

        // وسّع أو استبدل آخر القيم
        __cache.rsiArr = __cache.rsiArr || [];
        __cache.macdObj = __cache.macdObj || {emaF:[], emaS:[], macd:[], signal:[]};

        const i = series.length-1;
        __cache.rsiArr[i]        = rsiTail[rsiTail.length-1];
        __cache.macdObj.emaF[i]  = macdTail.emaF[macdTail.emaF.length-1];
        __cache.macdObj.emaS[i]  = macdTail.emaS[macdTail.emaS.length-1];
        __cache.macdObj.macd[i]  = macdTail.macd[macdTail.macd.length-1];
        __cache.macdObj.signal[i]= macdTail.signal[macdTail.signal.length-1];

        // 5) Pivot من اليومي (لازم يوم مكتمل)
        const piv = calcPivots(__cache.rowsDay);
        __cache.piv = piv; paintPivots(piv);

        // 6) حدّث النصيحة/المؤشرات/الجدول
        const rsiNow   = __cache.rsiArr[i];
        const macdNow  = __cache.macdObj.macd[i];
        const macdPrev = __cache.macdObj.macd[i-1];
        const macdSig  = __cache.macdObj.signal[i];
        const emaFnow  = __cache.macdObj.emaF[i];
        const emaSnow  = __cache.macdObj.emaS[i];

        paintSummary(rsiNow, macdNow, {macdPrev, macdSig, price:series[i].close, emaF:emaFnow, emaS:emaSnow});
        paintIndicators(rsiNow, macdNow, emaFnow, emaSnow);

        const tableRows = series.map((p,idx)=>({
          ts:p.ts, date: toLocalDate(p.ts), time: toLocalTime(p.ts),
          price:p.close, rsi:__cache.rsiArr[idx], macd:__cache.macdObj.macd[idx], emaF:__cache.macdObj.emaF[idx]
        }));
        paintTable(tableRows);

        // 7) أعِد خطوط Entry/SL/TP للرسم
        const sNow = classifyFinal({rsiVal:rsiNow, macdNow, macdPrev, macdSig, price:series[i].close, emaF:emaFnow, emaS:emaSnow});
        const atrArr = atr(series, ATR_PERIOD);
        const aNow = atrArr?.[i] ?? 0;
        const entryLine = (sNow==='شراء')
          ? Math.max(series[i].close, Number.isFinite(emaSnow)?emaSnow:series[i].close)
          : (sNow==='بيع')
            ? Math.min(series[i].close, Number.isFinite(emaSnow)?emaSnow:series[i].close)
            : null;
        const lines = {
          entry: entryLine,
          sl : (sNow==='شراء') ? entryLine - SL_ATR_MULT*aNow
              : (sNow==='بيع') ? entryLine + SL_ATR_MULT*aNow : undefined,
          tp1: (sNow==='شراء') ? entryLine + TP1_ATR_MULT*aNow
              : (sNow==='بيع') ? entryLine - TP1_ATR_MULT*aNow : undefined,
          tp2: (sNow==='شراء') ? entryLine + TP2_ATR_MULT*aNow
              : (sNow==='بيع') ? entryLine - TP2_ATR_MULT*aNow : undefined,
        };
        window.__lastSeriesForChart = series;
        window.__lastLinesForChart  = lines;
        renderTradeChart(series, lines);

        // 8) نصيحة مكتوبة
        if (elAdviceText){
          elAdviceText.textContent = buildAdvice(currentTF, series, __cache.rsiArr, __cache.macdObj, piv, LAST_LIVE, atrArr, __cache.rows5, __cache.rows30);
        }
      } else {
        // بدون بناء شموع: فقط خط لايف
        if (window.__lastSeriesForChart) renderTradeChart(window.__lastSeriesForChart, window.__lastLinesForChart);
      }
    }
  }catch(e){ console.warn('Live error:', e); }
}

/* أحداث */
elBtnRun?.addEventListener('click', runAnalysis);
elTf5?.addEventListener('click',  ()=>{ setActiveTF(5);    runAnalysis(); });
elTf30?.addEventListener('click', ()=>{ setActiveTF(30);   runAnalysis(); });
elTf60?.addEventListener('click', ()=>{ setActiveTF(60);   runAnalysis(); });
elTfD?.addEventListener('click',  ()=>{ setActiveTF(1440); runAnalysis(); });

const LS_KEY='gs_csv_url';
if (elCsvInput){
  const saved = localStorage.getItem(LS_KEY)||'';
  if (!elCsvInput.value && saved) elCsvInput.value = saved;
  elCsvInput.addEventListener('input', ()=>{
    const v = elCsvInput.value.trim();
    if (v) localStorage.setItem(LS_KEY, v); else localStorage.removeItem(LS_KEY);
  });
}

/* تشغيل */
setActiveTF(5);
runAnalysis();
refreshLive();
setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
