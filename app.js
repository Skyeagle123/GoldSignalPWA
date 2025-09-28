/************ GoldSignals - app.js (Option A: CSV history + live-built candles) ************/
const BUILD_CANDLES_FROM_LIVE = true; // ✅ فعّل بناء الشموع من السعر الحي

/*--------- إعدادات عامة ---------*/
const LIVE_JSON_URL    = 'https://goldprice-proxy.samer-mourtada.workers.dev/price'; // غيّرها إذا اسم الـWorker مختلف
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const TABLE_ROWS       = 80;
const LIVE_REFRESH_SEC = 1;   // تحديث السعر الحي كل 1 ثانية

/*--------- عناصر الواجهة ---------*/
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

/* إعدادات المؤشرات */
let EMA_FAST = parseInt(elEmaFast?.value || '12', 10);
let EMA_SLOW = parseInt(elEmaSlow?.value || '26', 10);
let RSI_PER  = parseInt(elRsiPeriod?.value || '14', 10);

elEmaFast?.addEventListener('input', ()=> { EMA_FAST = parseInt(elEmaFast.value||'12',10); recomputeIndicators(); });
elEmaSlow?.addEventListener('input', ()=> { EMA_SLOW = parseInt(elEmaSlow.value||'26',10); recomputeIndicators(); });
elRsiPeriod?.addEventListener('input',()=> { RSI_PER  = parseInt(elRsiPeriod.value||'14',10); recomputeIndicators(); });

/*--------- تنسيقات ---------*/
const nf2 = new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat('en-US', {minimumFractionDigits:4, maximumFractionDigits:4});
const dtfDate = new Intl.DateTimeFormat(undefined, {year:'numeric',month:'2-digit',day:'2-digit'});
const dtfTime = new Intl.DateTimeFormat(undefined, {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const fmtLocalParts = (ts)=>({ date: dtfDate.format(ts), time: dtfTime.format(ts) });

/*--------- حالة الإطار الزمني ---------*/
let currentTF = 5; // دقايق
function setActiveTF(tf){
  currentTF = tf;
  [elTf5, elTf30, elTf60, elTfD].forEach(b => b?.classList?.remove('active'));
  if (tf===5)    elTf5?.classList?.add('active');
  if (tf===30)   elTf30?.classList?.add('active');
  if (tf===60)   elTf60?.classList?.add('active');
  if (tf===1440) elTfD?.classList?.add('active');
}

/*--------- CSV helpers ---------*/
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
          ts, open: Number.isFinite(open)?open:close,
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

/* بناء شموع من الحي */
function floorToBucket(ts, minutes){ const ms = minutes*60*1000; return Math.floor(ts/ms)*ms; }
function updateLiveCandle(series, minutes, price, nowTs){
  if (!series || !series.length){ // لو فاضي، افتح أول شمعة
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

/*--------- مؤشرات ---------*/
function ema(series, period){
  const out = new Array(series.length).fill(null);
  const k = 2/(period+1);
  let e=null, sum=0;
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

/*--------- الشارت (Canvas) ---------*/
const canvas = $('chart');
const ctx = canvas.getContext('2d',{alpha:false});
let dpr = window.devicePixelRatio||1;
function resizeCanvas(){
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
}
window.addEventListener('resize', ()=>{ resizeCanvas(); drawChart(); });

let base5m = [];       // من CSV (5m)
let seriesTF = [];     // السلسلة الحالية (قد تُعدّل لايف)
let rsiArr = [];       // RSI للسلسلة الحالية
let macdObj = {};      // MACD للسلسلة الحالية
let pivots = null;     // Pivot
let lastLive = null;   // {price, ts}

function yScale(v, min, max, h, pad){ return h - pad - ( (v-min)/(max-min || 1) )*(h-2*pad); }

function getCss(name, fallback){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }

function drawChart(){
  resizeCanvas();
  const W=canvas.width, H=canvas.height, PAD=Math.round(20*dpr);
  ctx.fillStyle = '#0c1426'; ctx.fillRect(0,0,W,H);
  if (!seriesTF.length) return;

  const left=PAD*2, right=W-PAD, top=PAD, bottom=H-PAD;
  const plotW = right-left, plotH=bottom-top;

  // حدود الأسعار
  let prices = seriesTF.flatMap(d=>[d.open,d.high,d.low,d.close]);
  if (Number.isFinite(lastLive?.price)) prices.push(lastLive.price);
  let min = Math.min(...prices), max=Math.max(...prices);
  if (min===max){ min-=1; max+=1; }
  const y = (val)=> yScale(val, min, max, H, PAD);

  // grid افقي
  ctx.strokeStyle = getCss('--grid','#203047');
  ctx.lineWidth = 1*dpr; ctx.setLineDash([4*dpr,6*dpr]);
  for(let g=0; g<5; g++){
    const gy = top + (g/4)*plotH;
    ctx.beginPath(); ctx.moveTo(left, gy); ctx.lineTo(right, gy); ctx.stroke();
  }
  ctx.setLineDash([]);

  // شموع
  const n = seriesTF.length;
  const gap = Math.max(1*dpr, Math.floor(plotW / Math.max(n,1) * 0.2));
  const cw  = Math.max(3*dpr, Math.floor(plotW/Math.max(n,1) - gap));
  let x = left + (plotW - (cw+gap)*n);

  for (const c of seriesTF){
    const up = c.close>=c.open;
    const col = up ? getCss('--candleUp','#16a34a') : getCss('--candleDn','#ef4444');
    // wick
    ctx.strokeStyle = col; ctx.lineWidth = 1*dpr;
    ctx.beginPath(); ctx.moveTo(x+cw/2, y(c.high)); ctx.lineTo(x+cw/2, y(c.low)); ctx.stroke();
    // body
    ctx.fillStyle = col;
    const y1 = y(c.open), y2 = y(c.close);
    const bh = Math.max(1*dpr, Math.abs(y2 - y1));
    ctx.fillRect(x, Math.min(y1,y2), cw, bh);
    x += cw+gap;
  }

  // EMA سريعة كخط دخول إرشادي
  const i = seriesTF.length-1;
  const emaF = macdObj?.emaF?.[i];
  if (Number.isFinite(emaF)){
    drawHLine(emaF, getCss('--entry','#60a5fa'), 2*dpr);
    drawLabel(emaF, 'Entry/EMA', getCss('--entry','#60a5fa'));
  }
  // Pivots للأهداف والستوب (إشارة تقريبية)
  if (pivots){
    drawHLine(pivots.S1, getCss('--tp','#34d399'), 2*dpr); drawLabel(pivots.S1,'TP1',getCss('--tp','#34d399'));
    drawHLine(pivots.P , getCss('--tp','#34d399'), 2*dpr); drawLabel(pivots.P ,'TP2',getCss('--tp','#34d399'));
    if (Number.isFinite(emaF)) { drawHLine(emaF, getCss('--sl','#f87171'), 1*dpr,[6*dpr,6*dpr]); drawLabel(emaF,'SL',getCss('--sl','#f87171')); }
  }

  // خط السعر الحي (أبيض)
  if (Number.isFinite(lastLive?.price)){
    drawHLine(lastLive.price, getCss('--live','#ffffff'), 2*dpr,[10*dpr,6*dpr]);
    ctx.fillStyle = getCss('--live','#ffffff');
    ctx.beginPath(); ctx.arc(right-8*dpr, y(lastLive.price), 4*dpr, 0, Math.PI*2); ctx.fill();
  }

  function drawHLine(price, color, width=1, dash=[]){
    if (!Number.isFinite(price)) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
    const yy = y(price);
    ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke();
    ctx.restore();
  }
  function drawLabel(price, text, color){
    if (!Number.isFinite(price)) return;
    const yy = y(price);
    ctx.fillStyle = color; ctx.font = `${12*dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${text}: ${nf2.format(price)}`, left+8*dpr, yy);
  }
}

/*--------- عرض نصّي ---------*/
function paintLive(price, iso){
  if (elLivePrice && Number.isFinite(price)) elLivePrice.textContent = nf2.format(price);
  if (elLiveTime){
    if (iso){
      const d = new Date(iso);
      const {date,time} = fmtLocalParts(d);
      elLiveTime.textContent = `${date} • ${time}`;
    }else{
      elLiveTime.textContent = '—';
    }
  }
}
function paintIndicators(rsiVal, macdVal, emaFv, emaSv){
  elIndRSI.textContent  = Number.isFinite(rsiVal)  ? nf2.format(rsiVal)  : '—';
  elIndMACD.textContent = Number.isFinite(macdVal) ? nf4.format(macdVal) : '—';
  elIndEMAF.textContent = Number.isFinite(emaFv)   ? nf2.format(emaFv)   : '—';
  elIndEMAS.textContent = Number.isFinite(emaSv)   ? nf2.format(emaSv)   : '—';
}
function paintSummary(rsiVal, macdVal){
  const s = classify(rsiVal, macdVal);
  elSummaryText.textContent = s;
  elSummaryText.style.color = s==='شراء' ? '#10b981' : s==='بيع' ? '#ef4444' : '#f59e0b';
}
function paintPivots(p){
  if (!p) return;
  elPivotP.textContent=nf2.format(p.P);
  elR1.textContent=nf2.format(p.R1);
  elR2.textContent=nf2.format(p.R2);
  elR3.textContent=nf2.format(p.R3);
  elS1.textContent=nf2.format(p.S1);
  elS2.textContent=nf2.format(p.S2);
  elS3.textContent=nf2.format(p.S3);
}
function paintTable(rows){
  elRowsBody.innerHTML='';
  const last = rows.slice(-TABLE_ROWS).reverse();
  let idx = 1;
  for (const r of last){
    const s = classify(r.rsi, r.macd);
    const color = s==='شراء'?'#10b981':s==='بيع'?'#ef4444':'#f59e0b';
    const d = new Date(r.ts);
    const parts = fmtLocalParts(d);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx++}</td>
      <td>${parts.date}</td>
      <td>${parts.time}</td>
      <td>${nf2.format(r.price)}</td>
      <td style="color:${color};font-weight:600">${s}</td>
      <td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td>
      <td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td>
      <td>${Number.isFinite(r.emaF)?nf2.format(r.emaF):'—'}</td>
    `;
    elRowsBody.appendChild(tr);
  }
}

/*--------- التحليل ---------*/
function pickTF(rows5, tf){
  if (tf===5) return rows5.slice();
  if (tf===30) return aggregateOHLC(rows5, 30);
  if (tf===60) return aggregateOHLC(rows5, 60);
  if (tf===1440) return aggregateOHLC(rows5, 1440);
  return rows5.slice();
}

async function runAnalysis(){
  try{
    const csvUrl = elCsvInput?.value?.trim() || '';
    base5m = await fetchCsv(csvUrl);
    if (!base5m.length) throw new Error('ملف CSV فارغ');

    // pivots من يومي
    const daily = aggregateOHLC(base5m, 1440);
    pivots = calcPivots(daily);
    paintPivots(pivots);

    // اختر السلسلة للفريم الحالي
    seriesTF = pickTF(base5m, currentTF);

    // مؤشرات
    recomputeIndicators();

    // جدول
    const tableRows = seriesTF.map((p,idx)=>({
      ts:p.ts, price:p.close, rsi:rsiArr[idx], macd:macdObj.macd[idx], emaF:macdObj.emaF[idx]
    }));
    paintTable(tableRows);

    // ارسم
    drawChart();
  }catch(err){
    alert(`تعذّر تحميل/تحليل البيانات: ${err.message||err}`);
    console.error(err);
  }
}

function recomputeIndicators(){
  if (!seriesTF.length) return;
  rsiArr  = rsi(seriesTF, RSI_PER);
  macdObj = macd(seriesTF, EMA_FAST, EMA_SLOW, 9);
  const i = seriesTF.length-1;
  paintSummary(rsiArr[i], macdObj.macd[i]);
  paintIndicators(rsiArr[i], macdObj.macd[i], macdObj.emaF[i], macdObj.emaS[i]);
  drawChart();
}

/*--------- السعر الحي + بناء الشموع ---------*/
async function refreshLive(){
  try{
    const r = await fetch(LIVE_JSON_URL, {cache:'no-store'});
    if (!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    if (j && j.ok && Number.isFinite(j.price)){
      const nowTs = Date.now();
      const iso = j.isoTime || (j.date && j.time ? `${j.date}T${j.time}Z` : null);
      paintLive(j.price, iso);
      lastLive = { price: j.price, ts: nowTs };

      if (BUILD_CANDLES_FROM_LIVE){
        // حدّث شمعة 5 دقائق الأساسية
        updateLiveCandle(base5m, 5, j.price, nowTs);

        // أعِد بناء السلسلة للإطار الحالي من base5m
        seriesTF = pickTF(base5m, currentTF);

        // حسّب مؤشرات آخر مقطع فقط لتخفيف الكلفة
        const tail = seriesTF.slice(-Math.max(EMA_SLOW+5, RSI_PER+5));
        const rsiTail = rsi(tail, RSI_PER);
        const macdTail= macd(tail, EMA_FAST, EMA_SLOW, 9);

        // وسّع المصفوفات أو حدّث آخر عنصر
        const i = seriesTF.length-1;
        rsiArr[i]             = rsiTail[rsiTail.length-1];
        macdObj.emaF[i]       = macdTail.emaF[macdTail.emaF.length-1];
        macdObj.emaS[i]       = macdTail.emaS[macdTail.emaS.length-1];
        macdObj.macd[i]       = macdTail.macd[macdTail.macd.length-1];

        // تحديث واجهة
        paintSummary(rsiArr[i], macdObj.macd[i]);
        paintIndicators(rsiArr[i], macdObj.macd[i], macdObj.emaF[i], macdObj.emaS[i]);

        // جدول (يمكنك تعليق السطر التالي لو بدك أقل تحديث)
        const tableRows = seriesTF.map((p,idx)=>({
          ts:p.ts, price:p.close, rsi:rsiArr[idx], macd:macdObj.macd[idx], emaF:macdObj.emaF[idx]
        }));
        paintTable(tableRows);

        drawChart();
      } else {
        // فقط حدّث الخط الأبيض
        drawChart();
      }
    }
  }catch(e){ console.warn('Live error:', e); }
}

/*--------- أحداث ---------*/
elBtnRun?.addEventListener('click', runAnalysis);
elTf5?.addEventListener('click',  ()=>{ setActiveTF(5);    seriesTF = pickTF(base5m,5);   recomputeIndicators(); });
elTf30?.addEventListener('click', ()=>{ setActiveTF(30);   seriesTF = pickTF(base5m,30);  recomputeIndicators(); });
elTf60?.addEventListener('click', ()=>{ setActiveTF(60);   seriesTF = pickTF(base5m,60);  recomputeIndicators(); });
elTfD?.addEventListener('click',  ()=>{ setActiveTF(1440); seriesTF = pickTF(base5m,1440);recomputeIndicators(); });

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
