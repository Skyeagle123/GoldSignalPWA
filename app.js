/************ GoldSignals - app.js (stable) ************/
/* يعمل مع IDs التالية في الـHTML:
   csvInput, tf5, tf60, tfD, runBtn,
   livePrice, liveTime, summaryText,
   indRSI, indMACD, indEMAF, indEMAS,
   pivotP, r1, r2, r3, s1, s2, s3,
   rowsBody, tradeChart
*/

/*--------- إعدادات عامة ---------*/
const LIVE_JSON_URL    = 'https://goldprice-proxy.samer-mourtada.workers.dev/price';
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';   // إذا تركت الحقل فاضي
const TABLE_ROWS       = 80;
const LIVE_REFRESH_SEC = 30;

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

/* إعدادات المؤشرات (قابلة للتغيير من HTML إذا بدك) */
const elEmaFast   = $('emaFast');
const elEmaSlow   = $('emaSlow');
const elRsiPeriod = $('rsiPeriod');

let EMA_FAST = parseInt(elEmaFast?.value || '12', 10);
let EMA_SLOW = parseInt(elEmaSlow?.value || '26', 10);
let RSI_PER  = parseInt(elRsiPeriod?.value || '14', 10);

elEmaFast?.addEventListener('input', ()=> EMA_FAST = parseInt(elEmaFast.value||'12',10));
elEmaSlow?.addEventListener('input', ()=> EMA_SLOW = parseInt(elEmaSlow.value||'26',10));
elRsiPeriod?.addEventListener('input',()=> RSI_PER  = parseInt(elRsiPeriod.value||'14',10));

/*--------- تنسيقات أرقام + وقت محلي ---------*/
const nf2 = new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat('en-US', {minimumFractionDigits:4, maximumFractionDigits:4});

function toLocalDate(ts){
  // ISO محلي yyyy-mm-dd (مثل لقطاتك)
  return new Date(ts).toLocaleDateString('en-CA'); // 2025-09-26
}
function toLocalTime(ts){
  return new Date(ts).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}); // 23:05
}
function fmtLocalDateTime(isoOrTs){
  const d = new Date(isoOrTs);
  const date = d.toLocaleDateString('en-CA');
  const time = d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  return `${time} ${date}`;
}

/*--------- حالة الإطار الزمني ---------*/
let currentTF = 5;
function setActiveTF(tf){
  currentTF = tf;
  [elTf5, elTf60, elTfD].forEach(b => b?.classList?.remove('active'));
  if (tf===5)    elTf5?.classList?.add('active');
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
    // صيغة Stooq: Symbol,Date,Time,Open,High,Low,Close,Volume
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
    // صيغة بسيطة: Date,Close
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
  // ضمان https ومسار صحيح
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
  let emaV=null, sum=0;
  for (let i=0;i<series.length;i++){
    const p = series[i].close;
    if (i<period){ sum+=p; if(i===period-1){ emaV=sum/period; out[i]=emaV; } }
    else { emaV = p*k + emaV*(1-k); out[i]=emaV; }
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

/*--------- رسم الواجهة ---------*/
function paintLive(price, iso){
  if (elLivePrice && Number.isFinite(price)) elLivePrice.textContent = nf2.format(price);
  if (elLiveTime  && iso){
    elLiveTime.textContent = fmtLocalDateTime(iso); // محلي
  }
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
      <td>${r.date}</td>
      <td>${r.time}</td>
      <td>${nf2.format(r.price)}</td>
      <td style="color:${color};font-weight:600">${s}</td>
      <td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td>
      <td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td>
      <td>${nf2.format(r.emaF)}</td>
    `;
    elRowsBody.appendChild(tr);
  }
}

/* =====================[ HiDPI Chart Rendering — رسم فقط ]===================== */
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
  add(lines?.entry); add(lines?.sl); add(lines?.tp1); add(lines?.tp2);

  if (minY === maxY){ minY-=1; maxY+=1; }
  const pad = (maxY-minY)*0.08; minY-=pad; maxY+=pad;

  const x0=46, x1=W-12, y0=16, y1=H-24;
  const plotW=x1-x0, plotH=y1-y0;

  const xAt = i => x0 + (i/(data.length-1))*plotW;
  const yAt = v => y1 - ((v-minY)/(maxY-minY))*plotH;

  // grid
  ctx.strokeStyle='#223047'; ctx.lineWidth=1; ctx.setLineDash([]);
  ctx.font='12px system-ui'; ctx.fillStyle='#9ca3af'; ctx.textAlign='right'; ctx.textBaseline='middle';
  const gridN=4;
  for(let g=0; g<=gridN; g++){
    const yVal=minY+(g/gridN)*(maxY-minY);
    const y=Math.round(yAt(yVal))+0.5;
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
    const txt=nf2.format(yVal);
    ctx.fillText(txt,x0-6,y);
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
    // wick
    ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL); ctx.stroke();
    // body
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
    ctx.beginPath(); ctx.roundRect?.(bx,by,tw,th,6); // بعض المتصفحات القديمة ما فيها roundRect
    if(!ctx.roundRect){ ctx.rect(bx,by,tw,th); }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle=color; ctx.font='12px system-ui'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(tag,bx+6,by+th/2);
    ctx.restore();
  }

  drawHLine(lines?.entry,'#60a5fa','Entry');
  drawHLine(lines?.tp1,'#22c55e','TP1');
  drawHLine(lines?.tp2,'#22c55e','TP2');
  drawHLine(lines?.sl,'#f87171','SL');

  const last=data[data.length-1];
  if(last){
    const x=xAt(data.length-1), y=yAt(last.close);
    ctx.fillStyle='#f59e0b'; ctx.beginPath(); ctx.arc(x,y,4.5,0,Math.PI*2); ctx.fill();
  }
}
window.addEventListener('resize', ()=>{
  if (window.__lastSeriesForChart) {
    renderTradeChart(window.__lastSeriesForChart, window.__lastLinesForChart);
  }
});
/* ===================[ نهاية قسم الرسم ]=================== */

/*--------- التحليل ---------*/
async function runAnalysis(){
  try{
    const csvUrl = elCsvInput?.value?.trim() || '';
    let rows5 = await fetchCsv(csvUrl);           // 5m OHLC(أو Close-only)
    if (!rows5.length) throw new Error('ملف CSV فارغ');

    // يومي من 5 دقائق
    const daily = aggregateOHLC(rows5, 1440);

    // اختيار الإطار الزمني
    let series = rows5;
    if (currentTF===60)   series = aggregateOHLC(rows5, 60);
    if (currentTF===1440) series = daily;

    // مؤشرات
    const rsiArr  = rsi(series, RSI_PER);
    const macdObj = macd(series, EMA_FAST, EMA_SLOW, 9);

    // آخر نقطة
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

    // جدول (مع تاريخ/وقت محلي)
    const tableRows = series.map((p,idx)=>({
      ts:p.ts,
      date: toLocalDate(p.ts),
      time: toLocalTime(p.ts),
      price:p.close,
      rsi:rsiArr[idx],
      macd:macdObj.macd[idx],
      emaF:macdObj.emaF[idx]
    }));
    paintTable(tableRows);

    // ==== رسم الشارت (لا يغيّر منطقك) ====
    const lines = {
      entry: Number.isFinite(emaFnow) ? emaFnow : undefined, // الأزرق
      sl:    piv?.P,   // الأحمر
      tp1:   piv?.S1,  // الأخضر
      tp2:   piv?.S2   // الأخضر
    };
    window.__lastSeriesForChart = series;
    window.__lastLinesForChart  = lines;
    renderTradeChart(series, lines);

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
      const iso = j.isoTime || (j.date && j.time ? `${j.date}T${j.time}Z` : Date.now());
      paintLive(j.price, iso); // محلي
    }
  }catch(e){ console.warn('Live error:', e); }
}

/*--------- أحداث ---------*/
elBtnRun?.addEventListener('click', runAnalysis);
elTf5?.addEventListener('click',  ()=>{ setActiveTF(5);    runAnalysis(); });
elTf60?.addEventListener('click', ()=>{ setActiveTF(60);   runAnalysis(); });
elTfD?.addEventListener('click',  ()=>{ setActiveTF(1440); runAnalysis(); });

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
