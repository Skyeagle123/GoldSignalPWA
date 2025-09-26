/************ GoldSignals - app.js (stable + local date/time + Smart opt-in) ************/
/* نفس ملفّك مع إضافات فقط */

const LIVE_JSON_URL    = 'https://goldprice-proxy.samer-mourtada.workers.dev/price';
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const TABLE_ROWS       = 80;
const LIVE_REFRESH_SEC = 30;

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

/* مؤشرات قابلة للتعديل */
const elEmaFast   = $('emaFast');
const elEmaSlow   = $('emaSlow');
const elRsiPeriod = $('rsiPeriod');
/* ✅ جديد: خيار تفعيل الإشارات الدقيقة */
const elUseSmart  = $('useSmart');

let EMA_FAST = parseInt(elEmaFast?.value || '12', 10);
let EMA_SLOW = parseInt(elEmaSlow?.value || '26', 10);
let RSI_PER  = parseInt(elRsiPeriod?.value || '14', 10);

elEmaFast?.addEventListener('input', ()=> EMA_FAST = parseInt(elEmaFast.value||'12',10));
elEmaSlow?.addEventListener('input', ()=> EMA_SLOW = parseInt(elEmaSlow.value||'26',10));
elRsiPeriod?.addEventListener('input',()=> RSI_PER  = parseInt(elRsiPeriod.value||'14',10));
elUseSmart?.addEventListener('change', ()=> runAnalysis());

/* تنسيقات أرقام/وقت */
const nf2 = new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat('en-US', {minimumFractionDigits:4, maximumFractionDigits:4});
const fmtTime = (iso) => { try { return new Date(iso).toISOString().replace('T',' ').replace('Z',''); } catch { return String(iso); } };

/* ✅ موجود عندك: تنسيق محلي للجدول */
function fmtLocal(ts){
  const d  = new Date(ts);
  const y  = d.getFullYear();
  const m  = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return { date: `${y}-${m}-${dd}`, time: `${hh}:${mm}` };
}

let currentTF = 5;
function setActiveTF(tf){
  currentTF = tf;
  [elTf5, elTf60, elTfD].forEach(b => b?.classList?.remove('active'));
  if (tf===5)    elTf5?.classList?.add('active');
  if (tf===60)   elTf60?.classList?.add('active');
  if (tf===1440) elTfD?.classList?.add('active');
}

/* CSV helpers (نفسك) */
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

/* مؤشرات (نفسك) */
function ema(series, period){
  const out = new Array(series.length).fill(null);
  const k = 2/(period+1);
  let ema=null, sum=0;
  for (let i=0;i<series.length;i++){
    const p = series[i].close;
    if (i<period){ sum+=p; if(i===period-1){ ema=sum/period; out[i]=ema; } }
    else { ema = p*k + ema*(1-k); out[i]=ema; }
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

/* Pivot */
function calcPivots(daily){
  if (!daily || daily.length<2) return null;
  const y = daily[daily.length-2];
  const H=y.high, L=y.low, C=y.close;
  if (![H,L,C].every(Number.isFinite)) return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

/* رسم واجهة (نفسك + تعديل بسيط بالجدول ليستعمل sig لو موجود) */
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

/* ✅ دوال مساعدة للإشارة الدقيقة (إضافة فقط) */
function crossUp(a, b, i){ return i>0 && a[i-1]!=null && b[i-1]!=null && a[i-1] <= b[i-1] && a[i] > b[i]; }
function crossDown(a,b,i){ return i>0 && a[i-1]!=null && b[i-1]!=null && a[i-1] >= b[i-1] && a[i] < b[i]; }
function atr(series, period=14){
  if (!series || series.length<2) return new Array(series.length).fill(null);
  const tr = new Array(series.length).fill(null);
  for(let i=1;i<series.length;i++){
    const h = series[i].high ?? series[i].close;
    const l = series[i].low  ?? series[i].close;
    const pc= series[i-1].close;
    tr[i] = Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
  }
  const out = new Array(series.length).fill(null);
  const k = 2/(period+1);
  let e=null, sum=0, cnt=0;
  for(let i=0;i<tr.length;i++){
    if (!Number.isFinite(tr[i])) continue;
    if (cnt<period){ sum+=tr[i]; cnt++; if (cnt===period){ e=sum/period; out[i]=e; } }
    else { e = tr[i]*k + e*(1-k); out[i]=e; }
  }
  return out;
}
function smartClassify(idx, tfSeries, rsiArr, macdObj, pivots, ctx){
  const price = tfSeries[idx].close;
  const rsiV  = rsiArr[idx];
  const macdL = macdObj.macd[idx];
  const macSig= macdObj.signal[idx];
  const atrV  = ctx.atr[idx];

  if (![price,rsiV,macdL,macSig].every(x=>x!=null) || !Number.isFinite(price)) return 'حيادي';

  const trendUp   = ctx.trend1hUp && ctx.trendDailyUp;
  const trendDown = ctx.trend1hDown && ctx.trendDailyDown;

  const volOK = Number.isFinite(atrV) ? (atrV/price >= 0.0008) : true;

  const nearRes = pivots ? Math.min(Math.abs(price - pivots.R1), Math.abs(price - pivots.R2)) : Infinity;
  const nearSup = pivots ? Math.min(Math.abs(price - pivots.S1), Math.abs(price - pivots.S2)) : Infinity;
  const atrGuard = Number.isFinite(atrV) ? 0.2*atrV : Infinity;

  const macUp   = (macdL>0 && macdL>macSig) || crossUp(macdObj.macd, macdObj.signal, idx);
  const macDown = (macdL<0 && macdL<macSig) || crossDown(macdObj.macd, macdObj.signal, idx);
  const rsiBuy  = rsiV>=55 && rsiV<=70;
  const rsiSell = rsiV<=45 && rsiV>=30;

  if (trendUp && volOK && macUp && rsiBuy && nearRes > atrGuard)  return 'شراء';
  if (trendDown && volOK && macDown && rsiSell && nearSup > atrGuard) return 'بيع';
  return 'حيادي';
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

/* ✅ تعديل طفيف: استعمل r.sig لو موجود */
function paintTable(rows){
  if (!elRowsBody) return;

  const table = elRowsBody.closest('table');
  if (table && !table.querySelector('thead')){
    table.insertAdjacentHTML('afterbegin', `
      <thead><tr>
        <th>التاريخ</th><th>الوقت (محلي)</th><th>السعر</th>
        <th>الإشارة</th><th>RSI</th><th>MACD</th><th>EMA F</th>
      </tr></thead>
    `);
  }

  elRowsBody.innerHTML='';
  const last = rows.slice(-TABLE_ROWS).reverse();
  for (const r of last){
    const s = r.sig || classify(r.rsi, r.macd);
    const color = s==='شراء'?'#10b981':s==='بيع'?'#ef4444':'#f59e0b';
    const { date, time } = fmtLocal(r.ts);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${date}</td>
      <td>${time}</td>
      <td>${nf2.format(r.price)}</td>
      <td style="color:${color};font-weight:600">${s}</td>
      <td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td>
      <td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td>
      <td>${Number.isFinite(r.emaF)?nf2.format(r.emaF):'—'}</td>
    `;
    elRowsBody.appendChild(tr);
  }
}

/* التحليل (أضفنا بس حسابات إضافية لو الخيار شغّال) */
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

    /* ✅ تجهيز سياق الإشارات الدقيقة (ADD-ONLY) */
    const useSmart = !!(elUseSmart && elUseSmart.checked);
    let ctx=null, piv=null, series60=null, ema200_60=null, ema200_D=null, atrArr=null;
    if (useSmart){
      series60   = aggregateOHLC(rows5, 60);
      ema200_60  = ema(series60, 200);
      ema200_D   = ema(daily, 200);
      atrArr     = atr(series, 14);
      piv        = calcPivots(daily);
      ctx = {
        atr: atrArr,
        trend1hUp:    series60.length && ema200_60.length ? (series60.at(-1).close  > ema200_60.at(-1)) : true,
        trend1hDown:  series60.length && ema200_60.length ? (series60.at(-1).close  < ema200_60.at(-1)) : true,
        trendDailyUp: daily.length  && ema200_D.length  ? (daily.at(-1).close   > ema200_D.at(-1))  : true,
        trendDailyDown:daily.length && ema200_D.length  ? (daily.at(-1).close   < ema200_D.at(-1))  : true
      };
    } else {
      piv = calcPivots(daily);
    }

    const i = series.length-1;
    const priceNow = series[i].close;
    const rsiNow   = rsiArr[i];
    const macdNow  = macdObj.macd[i];
    const emaFnow  = macdObj.emaF[i];
    const emaSnow  = macdObj.emaS[i];

    paintSummary(rsiNow, macdNow); // الألوان تبع الملخص
    paintIndicators(rsiNow, macdNow, emaFnow, emaSnow);
    paintPivots(piv);

    /* صفوف الجدول + إشارة ذكية اختيارية */
    const tableRows = series.map((p,idx)=>{
      const base = {
        ts:p.ts, price:p.close, rsi:rsiArr[idx],
        macd:macdObj.macd[idx], emaF:macdObj.emaF[idx]
      };
      if (useSmart){
        base.sig = smartClassify(idx, series, rsiArr, macdObj, piv, ctx);
      }
      return base;
    });

    /* لو خيار “Smart” مفعّل، عرِضه في الملخّص النصّي */
    if (useSmart){
      const lastSig = tableRows.at(-1)?.sig || classify(rsiNow, macdNow);
      if (elSummaryText) elSummaryText.textContent = lastSig;
    }

    paintTable(tableRows);
  }catch(err){
    alert(`تعذّر تحميل/تحليل البيانات: ${err.message||err}`);
    console.error(err);
  }
}

/* السعر الحي (كما هو) */
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

/* أحداث */
elBtnRun?.addEventListener('click', runAnalysis);
elTf5?.addEventListener('click',  ()=>{ setActiveTF(5);    runAnalysis(); });
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
