/************ GoldSignals - app.js (fixed & complete) ************/
/* يعمل مع IDs التالية في الـHTML:
   csvInput, tf5, tf30, tf60, tfD, runBtn,
   livePrice, liveTime, summaryText,
   indRSI, indMACD, indEMAF, indEMAS,
   pivotP, r1, r2, r3, s1, s2, s3,
   rowsBody,
   emaFast, emaSlow, rsiPeriod,
   advBox, chartBox, chartCanvas
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

const elAdvBox    = $('advBox');   // صندوق نصيحة الدخول/الخروج (اختياري إن وُجد)
const elChartBox  = $('chartBox'); // كارت الرسم (اختياري)
const elCanvas    = $('chartCanvas'); // <canvas> للرسم (اختياري)

/* إعدادات المؤشرات (قابلة للتغيير من HTML) */
let EMA_FAST = parseInt(elEmaFast?.value || '12', 10);
let EMA_SLOW = parseInt(elEmaSlow?.value || '26', 10);
let RSI_PER  = parseInt(elRsiPeriod?.value || '14', 10);

elEmaFast?.addEventListener('input', ()=> EMA_FAST = parseInt(elEmaFast.value||'12',10));
elEmaSlow?.addEventListener('input', ()=> EMA_SLOW = parseInt(elEmaSlow.value||'26',10));
elRsiPeriod?.addEventListener('input',()=> RSI_PER  = parseInt(elRsiPeriod.value||'14',10));

/*--------- تنسيقات أرقام ووقت ---------*/
const nf0 = new Intl.NumberFormat('en-US', {maximumFractionDigits:0});
const nf2 = new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat('en-US', {minimumFractionDigits:4, maximumFractionDigits:4});
const dtDate = new Intl.DateTimeFormat(undefined, {year:'numeric',month:'2-digit',day:'2-digit'});
const dtTime = new Intl.DateTimeFormat(undefined, {hour:'2-digit',minute:'2-digit',hour12:false});
const fmtLocal = (ts)=>`${dtDate.format(ts)} ${dtTime.format(ts)}`;
const fmtIso    = (iso) => { try { return fmtLocal(new Date(iso)); } catch { return String(iso); } };

/*--------- حالة الإطار الزمني ---------*/
let currentTF = 5;
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

/*--------- ATR مبسّط ---------*/
function atr(series, period=14){
  if (series.length===0) return [];
  const tr = series.map((p,i)=>{
    if (i===0) return p.high - p.low;
    const prevClose = series[i-1].close;
    return Math.max(
      p.high - p.low,
      Math.abs(p.high - prevClose),
      Math.abs(p.low  - prevClose)
    );
  });
  // EMA على TR
  const arr = tr.map(v=>({close:v}));
  return ema(arr, period);
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

/*--------- طباعة الواجهة ---------*/
function paintLive(price, iso){
  if (elLivePrice && Number.isFinite(price)) elLivePrice.textContent = nf2.format(price);
  if (elLiveTime  && iso)                    elLiveTime.textContent  = fmtIso(iso);
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
      <td>${fmtLocal(new Date(r.ts))}</td>
      <td>${nf2.format(r.price)}</td>
      <td style="color:${color};font-weight:600">${s}</td>
      <td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td>
      <td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td>
      <td>${nf2.format(r.emaF)}</td>
    `;
    elRowsBody.appendChild(tr);
  }
}

/*--------- نصيحة الدخول/الخروج (ATR + EMA + Pivot) ---------*/
function buildAdvice(series, rsiArr, macdObj, daily){
  if (!series.length) return null;

  const i = series.length-1;
  const priceNow = series[i].close;
  const rsiNow   = rsiArr[i];
  const macdNow  = macdObj.macd[i];
  const emaFnow  = macdObj.emaF[i];
  const emaSnow  = macdObj.emaS[i];

  // تصنيف عام
  const sNow = classify(rsiNow, macdNow);

  // ATR
  const atrArr = atr(series, 14);
  const aNow = atrArr[i] ?? 0;

  // Entry line (بسيط: EMA سريع)
  const entryLine = emaFnow ?? priceNow;

  // SL/TP مضاعفات ATR
  const SL_ATR_MULT  = 1.0;
  const TP1_ATR_MULT = 1.0;
  const TP2_ATR_MULT = 2.0;

  let entry, sl, tp1, tp2, note = '';

  if (sNow==='شراء'){
    entry = Math.max(priceNow, entryLine);
    sl    = entry - SL_ATR_MULT * aNow;
    tp1   = entry + TP1_ATR_MULT* aNow; // ✅ fixed atrV -> aNow
    tp2   = entry + TP2_ATR_MULT* aNow;
    note  = `شراء عند اختراق/ارتداد قرب EMA: ${nf2.format(entry)}.`;
  } else if (sNow==='بيع'){
    entry = Math.min(priceNow, entryLine);
    sl    = entry + SL_ATR_MULT * aNow;
    tp1   = entry - TP1_ATR_MULT* aNow;
    tp2   = entry - TP2_ATR_MULT* aNow;
    note  = `بيع عند كسر/ارتداد قرب EMA: ${nf2.format(entry)}.`;
  } else {
    entry = entryLine;
    sl = tp1 = tp2 = undefined;
    note = 'إشارة حيادية حالياً.';
  }

  const piv = calcPivots(daily);

  return {
    side   : sNow,
    entry  : entry,
    sl     : sl,
    tp1    : tp1,
    tp2    : tp2,
    price  : priceNow,
    emaF   : emaFnow,
    emaS   : emaSnow,
    atr    : aNow,
    pivot  : piv?.P,
    text   : `${note} وقف: ${sl?nf2.format(sl):'—'} • أهداف: ${tp1?nf2.format(tp1):'—'} ثم ${tp2?nf2.format(tp2):'—'}.`
  };
}

function paintAdvice(a){
  if (!elAdvBox || !a) return;
  elAdvBox.innerHTML = `
    <div>نصيحة الدخول: <b>${a.side==='شراء'?'شراء':'بيع'}</b> قرب EMA ${nf2.format(a.emaF||a.entry)}.</div>
    <div>نصيحة الخروج: وقف <b>${a.sl?nf2.format(a.sl):'—'}</b> • أهداف:
      <b>${a.tp1?nf2.format(a.tp1):'—'}</b> ثم <b>${a.tp2?nf2.format(a.tp2):'—'}</b>.
    </div>
    <div class="muted" style="margin-top:6px">* تعتمد على EMA و ATR و Pivot وآخر قاع/قمّة؛ ليست نصيحة استثمارية.</div>
  `;
}

/*--------- الرسم البياني البسيط (Canvas) ---------*/
function drawChart(series, lines){
  if (!elCanvas || !series?.length) return;
  const ctx = elCanvas.getContext('2d');
  const W = elCanvas.clientWidth || 680;
  const H = elCanvas.clientHeight || 360;
  elCanvas.width = W * devicePixelRatio;
  elCanvas.height= H * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);

  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0,0,W,H);

  // حدود
  const padL=40, padR=20, padT=20, padB=30;
  const x0=padL, y0=padT, x1=W-padR, y1=H-padB, w=x1-x0, h=y1-y0;

  // نطاق الأسعار
  const hi = Math.max(...series.map(s=>s.high));
  const lo = Math.min(...series.map(s=>s.low));
  const pad = (hi-lo)*0.1 || 1;
  const max = hi+pad, min=lo-pad;

  const X = (i)=> x0 + (i/(series.length-1))*w;
  const Y = (v)=> y1 - ( (v-min)/(max-min) )*h;

  // محاور خفيفة
  ctx.strokeStyle='#253144';
  ctx.lineWidth=1;
  ctx.beginPath();
  for (let k=0;k<=4;k++){
    const yy = y0 + (k/4)*h;
    ctx.moveTo(x0,yy); ctx.lineTo(x1,yy);
  }
  ctx.stroke();

  // شموع (جسم-فتيل)
  const barW = Math.max(2, w/series.length*0.6);
  for (let i=0;i<series.length;i++){
    const p = series[i];
    const up = p.close>=p.open;
    ctx.strokeStyle = up ? '#10b981' : '#ef4444';
    ctx.fillStyle   = up ? '#10b981' : '#ef4444';

    // فتيل
    ctx.beginPath();
    ctx.moveTo(X(i), Y(p.high));
    ctx.lineTo(X(i), Y(p.low));
    ctx.stroke();

    // جسم
    const x = X(i) - barW/2;
    const y = Y(Math.max(p.open,p.close));
    const hh= Math.abs(Y(p.open)-Y(p.close));
    if (hh<1){ // خط رفيع إذا الجسم صغير جداً
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x+barW, y);
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, barW, hh);
    }
  }

  // خطوط Entry/SL/TP
  if (lines){
    const dash = (y,color,label)=>{
      if (!Number.isFinite(y)) return;
      ctx.setLineDash([6,6]);
      ctx.strokeStyle=color;
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x0,Y(y)); ctx.lineTo(x1,Y(y)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle=color;
      ctx.font='12px system-ui';
      ctx.fillText(`${label}: ${nf2.format(y)}`, x0+6, Y(y)-4);
    };
    dash(lines.entry, '#38bdf8', 'Entry');
    dash(lines.sl,    '#ef4444', 'SL');
    dash(lines.tp1,   '#22c55e', 'TP1');
    dash(lines.tp2,   '#16a34a', 'TP2');
  }

  // سعر حي (نقطة وخط أبيض)
  if (window.__livePriceNow && Number.isFinite(window.__livePriceNow)){
    const y = Y(window.__livePriceNow);
    ctx.strokeStyle='#ffffff';
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.arc(x1-10,y,4,0,Math.PI*2); ctx.fill();
  }
}

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
    if (currentTF===30)   series = aggregateOHLC(rows5, 30);
    if (currentTF===60)   series = aggregateOHLC(rows5, 60);
    if (currentTF===1440) series = daily;

    // مؤشرات
    const rsiArr  = rsi(series, RSI_PER);
    const macdObj = macd(series, EMA_FAST, EMA_SLOW, 9);

    // آخر نقطة
    const i = series.length-1;
    const rsiNow   = rsiArr[i];
    const macdNow  = macdObj.macd[i];
    const emaFnow  = macdObj.emaF[i];
    const emaSnow  = macdObj.emaS[i];

    paintSummary(rsiNow, macdNow);
    paintIndicators(rsiNow, macdNow, emaFnow, emaSnow);

    const piv = calcPivots(daily);
    paintPivots(piv);

    // جدول
    const tableRows = series.map((p,idx)=>({
      ts:p.ts, price:p.close, rsi:rsiArr[idx], macd:macdObj.macd[idx], emaF:macdObj.emaF[idx]
    }));
    paintTable(tableRows);

    // نصيحة + رسم
    const adv = buildAdvice(series, rsiArr, macdObj, daily);
    paintAdvice(adv);
    const lines = adv ? {
      entry: adv.entry,
      sl   : adv.sl,
      tp1  : adv.tp1,
      tp2  : adv.tp2
    } : null;
    drawChart(series.slice(-200), lines); // آخر 200 شمعة كفاية للعرض

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
      window.__livePriceNow = j.price; // لاستعماله كرسم خط أبيض على الشارت
      paintLive(j.price, iso);
      // إعادة رسم الخط الأبيض فوق آخر شارت مرسوم
      // (ما بنغيّر الشموع هون، الشموع من CSV)
      // لو حابب نحقن شمعة "حيّة" سريعاً خبرني نفعّل خيار live tick.
    }
  }catch(e){ console.warn('Live error:', e); }
}

/*--------- أحداث ---------*/
elBtnRun?.addEventListener('click', runAnalysis);
elTf5 ?.addEventListener('click', ()=>{ setActiveTF(5);    runAnalysis(); });
elTf30?.addEventListener('click',()=>{ setActiveTF(30);   runAnalysis(); });
elTf60?.addEventListener('click',()=>{ setActiveTF(60);   runAnalysis(); });
elTfD ?.addEventListener('click', ()=>{ setActiveTF(1440); runAnalysis(); });

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
