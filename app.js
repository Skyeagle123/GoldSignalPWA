/************ GoldSignals - app.js (stable + chart fix) ************/
/* يعمل مع IDs التالية في الـHTML:
   csvInput, tf5, tf60, tfD, runBtn,
   livePrice, liveTime, summaryText,
   indRSI, indMACD, indEMAF, indEMAS,
   pivotP, r1, r2, r3, s1, s2, s3,
   rowsBody, gsChart
*/

/*--------- إعدادات عامة ---------*/
const LIVE_JSON_URL    = 'https://goldprice-proxy.samer-mourtada.workers.dev/price';
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';   // إذا تركت الحقل فاضي
const TABLE_ROWS       = 80;
const LIVE_REFRESH_SEC = 30;
const CHART_POINTS     = 150; // عدد الشموع المرسومة

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

/*--------- تنسيقات أرقام EN ---------*/
const nf2 = new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat('en-US', {minimumFractionDigits:4, maximumFractionDigits:4});
const fmtTime = (iso) => { try { return new Date(iso).toISOString().replace('T',' ').replace('Z',''); } catch { return String(iso); } };

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
  const full = u.startsWith('http') ? u : `${u}?t=${Date.now()}`; // cache-bust
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

    // جدول
    const tableRows = series.map((p,idx)=>({
      ts:p.ts, price:p.close, rsi:rsiArr[idx], macd:macdObj.macd[idx], emaF:macdObj.emaF[idx]
    }));
    paintTable(tableRows);

    // رسم الشارت (تصليح القياس فقط)
    drawChart(series);

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

/* ===================================================== */
/*                تصليح رسم الشارت فقط                   */
/* ===================================================== */

// يقرأ ارتفاع الكانفاس الحقيقي من الـDOM/الـCSS لو تغيّر بين الأطر الزمنية
function getCanvasCssHeight(canvas, fallback=320){
  let cssH = canvas.getBoundingClientRect?.().height;
  if (!cssH || cssH < 120) {
    const st = typeof getComputedStyle === 'function' ? getComputedStyle(canvas) : null;
    const h  = st ? parseFloat(st.height) : NaN;
    cssH = Number.isFinite(h) && h > 0 ? h : fallback;
  }
  return cssH;
}

function drawChart(series){
  const canvas = document.getElementById('gsChart');
  if (!canvas || !Array.isArray(series) || !series.length) return;

  // ثبّت الحجم + صفّر التحويلات كل مرة (Fix التمدد)
  const dpr  = Math.max(1, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
  const cssH = getCanvasCssHeight(canvas, canvas.getAttribute('height') ? parseFloat(canvas.getAttribute('height')) : 320);

  const wantW = Math.round(cssW * dpr);
  const wantH = Math.round(cssH * dpr);
  if (canvas.width !== wantW || canvas.height !== wantH) {
    canvas.width  = wantW;   // reset context state
    canvas.height = wantH;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0);           // reset
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.scale(dpr, dpr);

  // نافذة العرض
  const N = Math.min(CHART_POINTS, series.length);
  const data = series.slice(-N);

  // هوامش
  const padL=50, padR=16, padT=12, padB=18;
  const W = cssW - padL - padR;
  const H = cssH - padT - padB;

  // نطاق السعر
  let minY = Math.min(...data.map(p=>Number.isFinite(p.low)?p.low:p.close));
  let maxY = Math.max(...data.map(p=>Number.isFinite(p.high)?p.high:p.close));
  if (!(isFinite(minY)&&isFinite(maxY))) return;
  const padY = (maxY-minY)*0.08 || 1;
  minY -= padY; maxY += padY;

  const xAt = (i) => padL + (i/(N-1))*W;
  const yAt = (v) => padT + (1-(v-minY)/(maxY-minY))*H;

  // خلفية + Grid
  ctx.fillStyle = '#111827'; ctx.fillRect(0,0,cssW,cssH);
  ctx.strokeStyle = '#273449'; ctx.lineWidth=1;
  ctx.beginPath();
  for (let g=0; g<=5; g++){
    const y = padT + (g/5)*H;
    ctx.moveTo(padL, y); ctx.lineTo(padL+W, y);
  }
  ctx.stroke();

  // محور Y
  ctx.fillStyle='#9ca3af'; ctx.font='12px system-ui';
  for (let g=0; g<=5; g++){
    const yv = minY + (1-g/5)*(maxY-minY);
    const y  = padT + (g/5)*H;
    ctx.fillText(nf2.format(yv), 6, y+4);
  }

  // شموع إذا OHLC موجود وإلا خط
  const hasOHLC = data.some(p=>p.high!==p.close || p.low!==p.close || p.open!==p.close);
  if (hasOHLC){
    for (let i=0;i<data.length;i++){
      const p=data[i];
      const x=xAt(i), w=Math.max(1, W/N*0.6);
      const yH=yAt(p.high), yL=yAt(p.low), yO=yAt(p.open), yC=yAt(p.close);
      ctx.strokeStyle='#e5e7eb'; ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL); ctx.stroke();
      const up = p.close>=p.open;
      ctx.fillStyle= up ? '#10b981' : '#ef4444';
      const bx = x - w/2, by = Math.min(yO,yC), bh = Math.max(2, Math.abs(yC-yO));
      ctx.fillRect(bx, by, w, bh);
    }
  } else {
    ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=1.6; ctx.beginPath();
    for (let i=0;i<data.length;i++){
      const x=xAt(i), y=yAt(data[i].close);
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }

  // نقطة آخر سعر
  const lastX = xAt(N-1), lastY = yAt(data[N-1].close);
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI*2); ctx.fill();

  // عنوان صغير
  ctx.fillStyle='#9ca3af'; ctx.font='12px system-ui';
  ctx.fillText(`نطاق عرض: آخر ${N} شمعة`, padL, padT-2+12);
}
