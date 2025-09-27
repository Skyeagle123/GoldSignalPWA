/************ GoldSignals - app.js (stable + local datetime + robust chart) ************/
/* يعمل مع IDs التالية في الـHTML:
   csvInput, tf5, tf60, tfD, runBtn,
   livePrice, liveTime, summaryText,
   indRSI, indMACD, indEMAF, indEMAS,
   pivotP, r1, r2, r3, s1, s2, s3,
   rowsBody, gsChart, adviceIn, adviceOut
*/

/*--------- إعدادات عامة ---------*/
const LIVE_JSON_URL    = 'https://goldprice-proxy.samer-mourtada.workers.dev/price';
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const TABLE_ROWS       = 80;
const LIVE_REFRESH_SEC = 30;
const CHART_POINTS     = 150;

/*--------- التقاط عناصر الواجهة ---------*/
const $ = (id) => document.getElementById(id);
const elCsvInput   = $('csvInput');
const elTf5        = $('tf5');
const elTf60       = $('tf60');
const elTfD        = $('tfD');
const elBtnRun     = $('runBtn');

const elLivePrice  = $('livePrice');
const elLiveTime   = $('liveTime');
const elSummaryText= $('summaryText');

const elIndRSI  = $('indRSI');
const elIndMACD = $('indMACD');
const elIndEMAF = $('indEMAF');
const elIndEMAS = $('indEMAS');

const elPivotP = $('pivotP');
const elR1 = $('r1'), elR2 = $('r2'), elR3 = $('r3');
const elS1 = $('s1'), elS2 = $('s2'), elS3 = $('s3');

const elRowsBody = $('rowsBody');
const elAdviceIn  = $('adviceIn');
const elAdviceOut = $('adviceOut');

/* إعدادات المؤشرات */
const elEmaFast   = $('emaFast');
const elEmaSlow   = $('emaSlow');
const elRsiPeriod = $('rsiPeriod');

let EMA_FAST = parseInt(elEmaFast?.value || '12', 10);
let EMA_SLOW = parseInt(elEmaSlow?.value || '26', 10);
let RSI_PER  = parseInt(elRsiPeriod?.value || '14', 10);

elEmaFast?.addEventListener('input', ()=> EMA_FAST = parseInt(elEmaFast.value||'12',10));
elEmaSlow?.addEventListener('input', ()=> EMA_SLOW = parseInt(elEmaSlow.value||'26',10));
elRsiPeriod?.addEventListener('input',()=> RSI_PER  = parseInt(elRsiPeriod.value||'14',10));

/*--------- تنسيقات ---------*/
const nf2 = new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat('en-US', {minimumFractionDigits:4, maximumFractionDigits:4});
const fmtTime = (iso) => { try { return new Date(iso).toISOString().replace('T',' ').replace('Z',''); } catch { return String(iso); } };
const fmtLocalDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, {year:'numeric', month:'2-digit', day:'2-digit'});
const fmtLocalTime = (ts) =>
  new Date(ts).toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit', hour12:false});

/*--------- إطار زمني ---------*/
let currentTF = 5;
function setActiveTF(tf){
  currentTF = tf;
  [elTf5, elTf60, elTfD].forEach(b => b?.classList?.remove('active'));
  if (tf===5)    elTf5?.classList?.add('active');
  if (tf===60)   elTf60?.classList?.add('active');
  if (tf===1440) elTfD?.classList?.add('active');
}

/*--------- CSV ---------*/
function parseCsv(text){
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase();
  const out = [];

  if (header.includes('symbol') && header.includes('date') && header.includes('time')) {
    // Stooq: Symbol,Date,Time,Open,High,Low,Close,Volume
    for (let i=1;i<lines.length;i++){
      const [sym,d,t,o,h,l,c] = lines[i].split(',');
      if (!d || !t) continue;
      const ts = Date.parse(`${d}T${t}Z`);
      const open=+o, high=+h, low=+l, close=+c;
      if (Number.isFinite(ts) && Number.isFinite(close)){
        out.push({
          ts,
          open: Number.isFinite(open)?open:close,
          high: Number.isFinite(high)?high:close,
          low : Number.isFinite(low )?low :close,
          close
        });
      }
    }
  } else {
    // بسيط: Date,Close
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

/* تجميع OHLC */
function aggregateOHLC(rows, minutes){
  const bucketMs = minutes*60*1000;
  const map = new Map();
  for (const r of rows){
    const b = Math.floor(r.ts/bucketMs)*bucketMs;
    let rec = map.get(b);
    if (!rec){
      rec = { ts:b, open: r.open, high: r.high, low: r.low, close: r.close };
      map.set(b, rec);
    } else {
      rec.high = Math.max(rec.high, r.high);
      rec.low  = Math.min(rec.low , r.low);
      rec.close= r.close;
    }
  }
  return [...map.values()].sort((a,b)=>a.ts-b.ts);
}

/*--------- مؤشرات ---------*/
function ema(series, period){
  const out = new Array(series.length).fill(null);
  const k = 2/(period+1);
  let emaVal=null, sum=0;
  for (let i=0;i<series.length;i++){
    const p = series[i].close;
    if (i<period){ sum+=p; if(i===period-1){ emaVal=sum/period; out[i]=emaVal; } }
    else { emaVal = p*k + emaVal*(1-k); out[i]=emaVal; }
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
function classify(rsiVal, macdVal){
  if (macdVal==null || rsiVal==null) return 'حيادي';
  if (macdVal>0 && rsiVal>=50 && rsiVal<=70) return 'شراء';
  if (macdVal<0 && rsiVal<=50) return 'بيع';
  return 'حيادي';
}

/* ATR للأهداف/الوقف */
function atr(series, period=14){
  if (!series.length) return 0;
  let trs = [];
  for (let i=1;i<series.length;i++){
    const h = series[i].high ?? series[i].close;
    const l = series[i].low  ?? series[i].close;
    const pc= series[i-1].close;
    const tr = Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
    trs.push(tr);
  }
  if (!trs.length) return (series.at(-1).close||0)*0.005;
  const n = Math.min(period, trs.length);
  const last = trs.slice(-n);
  return last.reduce((a,b)=>a+b,0)/n;
}

/* Pivot */
function calcPivots(daily){
  if (!daily || daily.length<2) return null;
  const y = daily[daily.length-2];
  const H=y.high, L=y.low, C=y.close;
  if (![H,L,C].every(Number.isFinite)) return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

/* نصيحة دخول/خروج */
function makeAdvice(dir, priceNow, emaFnow, piv, series){
  const rng = atr(series, 14);
  const step = Math.max(0.5, rng);
  if (dir==='شراء'){
    const entry = Math.max(emaFnow, piv?.P ?? emaFnow);
    const sl    = entry - step*0.7;
    const tp1   = entry + step*1.2;
    const tp2   = entry + step*2.4;
    return {dir, entry, sl, tp1, tp2};
  } else if (dir==='بيع'){
    const entry = Math.min(emaFnow, piv?.P ?? emaFnow);
    const sl    = entry + step*0.7;
    const tp1   = entry - step*1.2;
    const tp2   = entry - step*2.4;
    return {dir, entry, sl, tp1, tp2};
  }
  return {dir:'حيادي'};
}

/*--------- واجهة ---------*/
function paintLive(price, iso){
  if (elLivePrice && Number.isFinite(price)) elLivePrice.textContent = nf2.format(price);
  if (elLiveTime  && iso)                    elLiveTime.textContent  = fmtTime(iso);
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

/* جدول البيانات (تاريخ/وقت محليين) */
function paintTable(rows){
  if (!elRowsBody) return;
  elRowsBody.innerHTML='';
  const last = rows.slice(-TABLE_ROWS).reverse();
  for (const r of last){
    const s = classify(r.rsi, r.macd);
    const color = s==='شراء'?'#10b981':s==='بيع'?'#ef4444':'#f59e0b';
    const dStr = r.ts ? fmtLocalDate(r.ts) : '—';
    const tStr = r.ts ? fmtLocalTime(r.ts) : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${dStr}</td>
      <td>${tStr}</td>
      <td>${nf2.format(r.price)}</td>
      <td style="color:${color};font-weight:600">${s}</td>
      <td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td>
      <td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td>
      <td>${nf2.format(r.emaF)}</td>
    `;
    elRowsBody.appendChild(tr);
  }
}

/*--------- الحالة للرسم ---------*/
let _lastSeries = null, _lastAdvice = null;

/*--------- التحليل ---------*/
async function runAnalysis(){
  try{
    const csvUrl = elCsvInput?.value?.trim() || '';
    let rows5 = await fetchCsv(csvUrl);
    if (!rows5.length) throw new Error('ملف CSV فارغ');

    const daily = aggregateOHLC(rows5, 1440);

    let series = rows5;
    if (currentTF===60)   series = aggregateOHLC(rows5, 60);
    if (currentTF===1440) series = daily;

    const rsiArr  = rsi(series, RSI_PER);
    const macdObj = macd(series, EMA_FAST, EMA_SLOW, 9);

    const i = series.length-1;
    const priceNow = series[i].close;
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

    const dir = classify(rsiNow, macdNow);
    const advice = makeAdvice(dir, priceNow, emaFnow, piv, series);
    if (elAdviceIn && elAdviceOut){
      if (advice.dir==='شراء'){
        elAdviceIn.textContent  = `نصيحة الدخول: شراء عند اختراق/ارتداد قرب EMA ${nf2.format(advice.entry)}.`;
        elAdviceOut.textContent = `نصيحة الخروج: وقف ${nf2.format(advice.sl)} • أهداف: ${nf2.format(advice.tp1)} ثم ${nf2.format(advice.tp2)}.`;
      } else if (advice.dir==='بيع'){
        elAdviceIn.textContent  = `نصيحة الدخول: بيع عند كسر/ارتداد قرب EMA ${nf2.format(advice.entry)}.`;
        elAdviceOut.textContent = `نصيحة الخروج: وقف ${nf2.format(advice.sl)} • أهداف: ${nf2.format(advice.tp1)} ثم ${nf2.format(advice.tp2)}.`;
      } else {
        elAdviceIn.textContent  = 'نصيحة الدخول: حيادي.';
        elAdviceOut.textContent = 'نصيحة الخروج: —';
      }
    }

    _lastSeries = series;
    _lastAdvice = advice;
    drawChart(_lastSeries, _lastAdvice);

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
      const iso = j.isoTime || (j.date && j.time ? `${j.date}T${j.time}Z` : null);
      paintLive(j.price, iso);
    }
  }catch(e){ console.warn('Live error:', e); }
}

/*--------- أحداث ---------*/
elBtnRun?.addEventListener('click', runAnalysis);
elTf5?.addEventListener('click',  ()=>{ setActiveTF(5);    runAnalysis(); });
elTf60?.addEventListener('click', ()=>{ setActiveTF(60);   runAnalysis(); });
elTfD?.addEventListener('click',  ()=>{ setActiveTF(1440); runAnalysis(); });

// إعادة الرسم عند تغيير المقاس/الدوران
window.addEventListener('resize', ()=> drawChart(_lastSeries, _lastAdvice));

// حفظ رابط CSV محلياً
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

/*===================== الرسم البياني (Canvas) =====================*/
function drawChart(series, advice){
  const cvs = document.getElementById('gsChart');
  if (!cvs || !series?.length) return;

  // إذا ما في ارتفاع ستايلي، عيّنه افتراضيًا ثم اقرأ الأبعاد
  let rect = cvs.getBoundingClientRect();
  if (!rect.height) {
    cvs.style.height = '320px';
    rect = cvs.getBoundingClientRect();
  }
  const cssW = Math.max(300, rect.width || 600);
  const cssH = Math.max(220, rect.height || 320);

  // اضبط أبعاد البكسل (بدون مضاعفة DPR حتى ما تتغيّر المقاييس)
  cvs.width  = Math.round(cssW);
  cvs.height = Math.round(cssH);

  const ctx = cvs.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,cvs.width,cvs.height);

  const pad = 14;
  const left = pad+6, right = cvs.width-pad, top = pad, bottom = cvs.height-pad-10;
  const w = right-left, h = bottom-top;

  const data = series.slice(-CHART_POINTS);

  // نطاق Y
  const lows  = data.map(p => (Number.isFinite(p.low)?p.low:p.close));
  const highs = data.map(p => (Number.isFinite(p.high)?p.high:p.close));
  let minY = Math.min(...lows), maxY = Math.max(...highs);
  const addIf = (v)=>{ if (Number.isFinite(v)) { minY=Math.min(minY,v); maxY=Math.max(maxY,v);} };
  if (advice){ addIf(advice.entry); addIf(advice.sl); addIf(advice.tp1); addIf(advice.tp2); }
  const padY = (maxY-minY)*0.08 || 1;
  minY-=padY; maxY+=padY;

  const yFor = (v)=> bottom - ( (v-minY)/(maxY-minY) )*h;
  const dx = w / Math.max(1,(data.length-1));
  const body = Math.max(1, dx*0.55);

  // grid
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  for (let k=0;k<=4;k++){
    const y = top + k*(h/4);
    ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke();
  }

  // شموع
  for (let i=0;i<data.length;i++){
    const p = data[i];
    const o = Number.isFinite(p.open)?p.open:p.close;
    const c = p.close;
    const hi = Number.isFinite(p.high)?p.high:Math.max(o,c);
    const lo = Number.isFinite(p.low) ?p.low :Math.min(o,c);

    const x = left + i*dx;
    const yO = yFor(o), yC = yFor(c), yH = yFor(hi), yL = yFor(lo);

    const up = c>=o;
    ctx.strokeStyle = up ? '#10b981' : '#ef4444';
    ctx.fillStyle   = up ? 'rgba(16,185,129,0.85)' : 'rgba(239,68,68,0.85)';

    ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL); ctx.stroke(); // wick
    const bh = Math.max(1, Math.abs(yC-yO));
    ctx.fillRect(x-body/2, Math.min(yO,yC), body, bh);                  // body
  }

  // خطوط النصيحة
  const dash = (y,color,text) => {
    if (!Number.isFinite(y)) return;
    ctx.setLineDash([6,6]);
    ctx.strokeStyle = color; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(text, left+6, y-6);
  };
  if (advice?.entry) dash(yFor(advice.entry), '#60a5fa', `Entry/Break: ${nf2.format(advice.entry)}`);
  if (advice?.tp1)   dash(yFor(advice.tp1),   '#22c55e', `TP1: ${nf2.format(advice.tp1)}`);
  if (advice?.tp2)   dash(yFor(advice.tp2),   '#16a34a', `TP2: ${nf2.format(advice.tp2)}`);
  if (advice?.sl)    dash(yFor(advice.sl),    '#ef4444', `SL: ${nf2.format(advice.sl)}`);

  // نقطة السعر الأخيرة
  const last = data[data.length-1];
  if (last){
    ctx.fillStyle='#f59e0b';
    ctx.beginPath(); ctx.arc(right-6, yFor(last.close), 4, 0, Math.PI*2); ctx.fill();
  }
}
