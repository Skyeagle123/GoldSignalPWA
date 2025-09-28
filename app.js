/************ GoldSignals - app.js (ATR inputs + advice) ************/
const LIVE_JSON_URL    = 'https://goldprice-proxy.samer-mourtada.workers.dev/price';
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const TABLE_ROWS       = 80;
const LIVE_REFRESH_SEC = 30;

const $ = (id) => document.getElementById(id);
const elCsvInput   = $('csvInput');
const elTf5        = $('tf5');
const elTf30       = $('tf30');
const elTf60       = $('tf60');
const elTfD        = $('tfD');
const elBtnRun     = $('runBtn');

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

/* حقلـات ATR/SL/TP الجديدة */
const elAtrPeriod = $('atrPeriod');
const elSlMult    = $('slMult');
const elTp1Mult   = $('tp1Mult');
const elTp2Mult   = $('tp2Mult');

let EMA_FAST = parseInt(elEmaFast?.value || '12', 10);
let EMA_SLOW = parseInt(elEmaSlow?.value || '26', 10);
let RSI_PER  = parseInt(elRsiPeriod?.value || '14', 10);

let ATR_PERIOD = parseInt(elAtrPeriod?.value || '14', 10);
let SL_ATR_MULT  = parseFloat(elSlMult?.value  || '1.5');
let TP1_ATR_MULT = parseFloat(elTp1Mult?.value || '1.0');
let TP2_ATR_MULT = parseFloat(elTp2Mult?.value || '2.0');

elEmaFast?.addEventListener('input', ()=> { EMA_FAST = parseInt(elEmaFast.value||'12',10); runAnalysis(); });
elEmaSlow?.addEventListener('input', ()=> { EMA_SLOW = parseInt(elEmaSlow.value||'26',10); runAnalysis(); });
elRsiPeriod?.addEventListener('input',()=> { RSI_PER  = parseInt(elRsiPeriod.value||'14',10); runAnalysis(); });

elAtrPeriod?.addEventListener('input', ()=> { ATR_PERIOD  = Math.max(2, parseInt(elAtrPeriod.value||'14',10)); runAnalysis(); });
elSlMult?.addEventListener('input',    ()=> { SL_ATR_MULT  = parseFloat(elSlMult.value||'1.5');  updateAdviceOnly(); });
elTp1Mult?.addEventListener('input',   ()=> { TP1_ATR_MULT = parseFloat(elTp1Mult.value||'1.0'); updateAdviceOnly(); });
elTp2Mult?.addEventListener('input',   ()=> { TP2_ATR_MULT = parseFloat(elTp2Mult.value||'2.0'); updateAdviceOnly(); });

/*--------- تنسيقات ---------*/
const nf2 = new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat('en-US', {minimumFractionDigits:4, maximumFractionDigits:4});
const fmtLocal = (ms)=> new Date(ms).toLocaleString([], {hour12:false});

/*--------- حالة الإطار الزمني ---------*/
let currentTF = 5; // دقائق
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

/*--------- CSV helpers ---------*/
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
        out.push({ ts, open: Number.isFinite(open)?open:close, high: Number.isFinite(high)?high:close, low: Number.isFinite(low)?low:close, close });
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

/*--------- مؤشرات ---------*/
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
/* ATR الحقيقي */
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

function classify(rsiVal, macdVal){
  if (macdVal==null || rsiVal==null) return 'حيادي';
  if (macdVal>0 && rsiVal>=50 && rsiVal<=70) return 'شراء';
  if (macdVal<0 && rsiVal<=50) return 'بيع';
  return 'حيادي';
}

/*--------- Pivot ---------*/
function calcPivots(daily){
  if (!daily || daily.length<2) return null;
  const y = daily[daily.length-2];
  const H=y.high, L=y.low, C=y.close;
  if (![H,L,C].every(Number.isFinite)) return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

/*--------- عرض ---------*/
function paintLive(price, ms){
  if (elLivePrice && Number.isFinite(price)) elLivePrice.textContent = nf2.format(price);
  if (elLiveTime  && ms) elLiveTime.textContent  = fmtLocal(ms);
}
function paintIndicators(rsiVal, macdVal, emaFv, emaSv){
  if (elIndRSI)  elIndRSI.textContent  = Number.isFinite(rsiVal)  ? nf2.format(rsiVal)  : '—';
  if (elIndMACD) elIndMACD.textContent = Number.isFinite(macdVal) ? nf4.format(macdVal) : '—';
  if (elIndEMAF) elIndEMAF.textContent = Number.isFinite(emaFv)   ? nf2.format(emaFv)   : '—';
  if (elIndEMAS) elIndEMAS.textContent = Number.isFinite(emaSv)   ? nf2.format(emaSv)   : '—';
}
function paintSummary(rsiVal, macdVal){
  if (!elSummaryText) return;
  const s = classify(rsiVal, macdVal);
  elSummaryText.textContent = s;
  elSummaryText.style.color = s==='شراء' ? '#10b981' : s==='بيع' ? '#ef4444' : '#f59e0b';
}
function paintPivots(p){
  if (!p) return;
  elPivotP&&(elPivotP.textContent=nf2.format(p.P));
  elR1&&(elR1.textContent=nf2.format(p.R1));
  elR2&&(elR2.textContent=nf2.format(p.R2));
  elR3&&(elR3.textContent=nf2.format(p.R3));
  elS1&&(elS1.textContent=nf2.format(p.S1));
  elS2&&(elS2.textContent=nf2.format(p.S2));
  elS3&&(elS3.textContent=nf2.format(p.S3));
}
function paintTable(rows){
  if (!elRowsBody) return;
  elRowsBody.innerHTML='';
  const last = rows.slice(-TABLE_ROWS).reverse();
  for (const r of last){
    const s = classify(r.rsi, r.macd);
    const color = s==='شراء'?'#10b981':s==='بيع'?'#ef4444':'#f59e0b';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${nf2.format(r.emaF)}</td>
      <td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td>
      <td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td>
      <td style="color:${color};font-weight:600">${s}</td>
      <td>${nf2.format(r.price)}</td>
    `;
    elRowsBody.appendChild(tr);
  }
}

/*--------- نصيحة مكتوبة (SL/TP بالـ ATR وتتأثر بالمضاعفات) ---------*/
let LAST_LIVE = null; // {price, timeMs}
let __cache = null;   // نخزّن آخر نتائج التحليل لاستخدامها عند تغيير المضاعفات فقط

function buildAdvice(tf, series, rsiArr, macdObj, pivots, liveInfo, atrArr){
  if (!series?.length) return '—';
  const i = series.length-1;
  const rsiV   = rsiArr[i];
  const macdV  = macdObj.macd[i];
  const emaS   = macdObj.emaS[i];

  const lastClose = series[i].close;
  const nowPx = (liveInfo && (Date.now()-liveInfo.timeMs) < 20000 && Number.isFinite(liveInfo.price))
    ? liveInfo.price : lastClose;

  const sig = classify(rsiV, macdV);
  const atrV = atrArr?.[i] ?? Math.max(0.3, Math.abs(series[i].high - series[i].low));

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
    if (pivots){
      return `الإطار: ${tfLabel(tf)} • الإشارة: حيادي. راقب Pivot ${nf2.format(pivots.P)} واختراقاته. آخر سعر: ${nf2.format(nowPx)}.`;
    }
    return `الإطار: ${tfLabel(tf)} • الإشارة: حيادي. آخر سعر: ${nf2.format(nowPx)}.`;
  }

  return `الإطار: ${tfLabel(tf)} • الإشارة: ${sig}.
سعر الدخول: ${nf2.format(entry)} • وقف الخسارة (ATR×${SL_ATR_MULT}): ${nf2.format(sl)} • الأهداف: ${nf2.format(tp1)} ثم ${nf2.format(tp2)}.`;
}

/* إعادة بناء النصيحة فقط عندما تغيّر المضاعفات دون تحميل CSV من جديد */
function updateAdviceOnly(){
  if (!__cache) return;
  const {tf, series, rsiArr, macdObj, piv, atrArr} = __cache;
  if (elAdviceText){
    elAdviceText.textContent = buildAdvice(tf, series, rsiArr, macdObj, piv, LAST_LIVE, atrArr);
  }
}

/*--------- التحليل ---------*/
async function runAnalysis(){
  try{
    const csvUrl = elCsvInput?.value?.trim() || '';
    let rows5 = await fetchCsv(csvUrl);
    if (!rows5.length) throw new Error('ملف CSV فارغ');

    const daily = aggregateOHLC(rows5, 1440);

    let series = rows5;
    if (currentTF===30)   series = aggregateOHLC(rows5, 30);
    if (currentTF===60)   series = aggregateOHLC(rows5, 60);
    if (currentTF===1440) series = daily;

    const rsiArr  = rsi(series, RSI_PER);
    const macdObj = macd(series, EMA_FAST, EMA_SLOW, 9);
    const atrArr  = atr(series, ATR_PERIOD);

    const i = series.length-1;
    const rsiNow   = rsiArr[i];
    const macdNow  = macdObj.macd[i];
    const emaFnow  = macdObj.emaF[i];
    const emaSnow  = macdObj.emaS[i];

    paintSummary(rsiNow, macdNow);
    paintIndicators(rsiNow, macdNow, emaFnow, emaSnow);

    const piv = calcPivots(daily);
    paintPivots(piv);

    const tableRows = series.map((p,idx)=>({
      ts:p.ts, price:p.close, rsi:rsiArr[idx], macd:macdObj.macd[idx], emaF:macdObj.emaF[idx]
    }));
    paintTable(tableRows);

    if (elAdviceText){
      elAdviceText.textContent = buildAdvice(currentTF, series, rsiArr, macdObj, piv, LAST_LIVE, atrArr);
    }

    // خزّن كاش للنصيحة السريعة عند تغيير مضاعفات ATR فقط
    __cache = {tf: currentTF, series, rsiArr, macdObj, piv, atrArr};

  }catch(err){
    alert(`تعذّر تحميل/تحليل البيانات: ${err.message||err}`);
    console.error(err);
  }
}

/*--------- السعر الحي ---------*/
async function refreshLive(){
  try{
    const r = await fetch(LIVE_JSON_URL, {cache:'no-store'});
    if (!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    if (j && j.ok && Number.isFinite(j.price)){
      const t = Date.now();
      LAST_LIVE = {price:j.price, timeMs:t};
      paintLive(j.price, t);
      // إذا بدك نعيد توليد النصيحة تلقائيًا مع كل تحديث حي، فكّ تعليق السطر التالي:
      // updateAdviceOnly();
    }
  }catch(e){ console.warn('Live error:', e); }
}

/*--------- أحداث ---------*/
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

/*--------- تشغيل ---------*/
setActiveTF(5);
runAnalysis();
refreshLive();
setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
