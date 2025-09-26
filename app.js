/************ GoldSignals - app.js (fixed) ************/
/* الأرقام بالإنجليزي + مؤشرات ظاهرة + سعر حي كل 30 ثانية */

/*----------- إعدادات -----------*/
const LIVE_JSON_URL = 'https://goldprice-proxy.samer-mourtada.workers.dev/price';
const DEFAULT_5M_CSV = 'XAUUSD_5min.csv';
const TABLE_ROWS = 60;
const LIVE_REFRESH_SEC = 30;

/*----------- التقاط عناصر الواجهة -----------*/
const elCsvInput   = document.getElementById('csvInput') || document.getElementById('csvUrl');
const elBtnRun     = document.getElementById('runBtn')   || document.querySelector('[data-run]');
const elTf5        = document.getElementById('tf5')      || document.querySelector('[data-tf="5"]');
const elTf60       = document.getElementById('tf60')     || document.querySelector('[data-tf="60"]');
const elTfD        = document.getElementById('tfD')      || document.querySelector('[data-tf="1440"]');
const elSourceHint = document.getElementById('sourceHint') || document.getElementById('sourceNow');

const elEmaFast    = document.getElementById('emaFast')  || document.querySelector('[data-ema-fast]');
const elEmaSlow    = document.getElementById('emaSlow')  || document.querySelector('[data-ema-slow]');
const elRsiPeriod  = document.getElementById('rsiPeriod')|| document.querySelector('[data-rsi]');

const elLivePrice  = document.getElementById('livePrice')|| document.querySelector('[data-live-price]');
const elLiveTime   = document.getElementById('liveTime') || document.querySelector('[data-live-time]');
const elSummaryText= document.getElementById('summaryText')|| document.querySelector('[data-summary]');

// مؤشرات (صندوق صغير)
const elIndRSI   = document.getElementById('indRSI');
const elIndMACD  = document.getElementById('indMACD');
const elIndEMAF  = document.getElementById('indEMAF');
const elIndEMAS  = document.getElementById('indEMAS');

// Pivot
const elPivotP = document.getElementById('pivotP') || document.querySelector('[data-pivot]');
const elR1 = document.getElementById('r1') || document.querySelector('[data-r1]');
const elR2 = document.getElementById('r2') || document.querySelector('[data-r2]');
const elR3 = document.getElementById('r3') || document.querySelector('[data-r3]');
const elS1 = document.getElementById('s1') || document.querySelector('[data-s1]');
const elS2 = document.getElementById('s2') || document.querySelector('[data-s2]');
const elS3 = document.getElementById('s3') || document.querySelector('[data-s3]');

// جدول “البيانات الأخيرة”
const elTableBody = document.getElementById('rowsBody') || document.querySelector('#rowsBody tbody') || document.querySelector('#rowsBody');

let currentTF = 5;

/*----------- أدوات تنسيق (EN digits) -----------*/
const fmt  = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmtTime = (iso) => {
  try { return new Date(iso).toISOString().replace('T', ' ').replace('Z', ''); }
  catch { return String(iso); }
};

/*----------- Helpers -----------*/
function setActiveTF(tf){
  currentTF = tf;
  [elTf5,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));
  if(tf===5) elTf5?.classList.add('active');
  if(tf===60) elTf60?.classList.add('active');
  if(tf===1440) elTfD?.classList.add('active');
}

function parseCsv(text){
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase();
  const out = [];
  if (header.includes('symbol') && header.includes('date') && header.includes('time')) {
    for (let i=1;i<lines.length;i++){
      const [sym,d,t,o,h,l,c/*,v*/] = lines[i].split(',');
      const ts = Date.parse(`${d}T${t}Z`);
      const close = Number(c), high = Number(h), low = Number(l), open = Number(o);
      if (Number.isFinite(ts) && Number.isFinite(close))
        out.push({ ts, open: Number.isFinite(open)?open:close, high: Number.isFinite(high)?high:close, low: Number.isFinite(low)?low:close, close });
    }
  } else {
    // Date,Close
    for (let i=1;i<lines.length;i++){
      const [d,c] = lines[i].split(',');
      const ts = Date.parse(d); const close = Number(c);
      if (Number.isFinite(ts) && Number.isFinite(close)) out.push({ ts, close });
    }
  }
  out.sort((a,b)=>a.ts-b.ts);
  return out;
}

async function fetchCsv(url){
  const u = (url && url.trim()) ? url.trim() : DEFAULT_5M_CSV;
  elSourceHint && (elSourceHint.textContent = `المصدر الحالي: ${u}`);
  const r = await fetch(u + (u.includes('?')?'&':'?') + 't=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error(`CSV HTTP ${r.status}`);
  return parseCsv(await r.text());
}

function aggregateOHLC(rows, unitMinutes){
  const ms = unitMinutes*60*1000;
  const map = new Map();
  for (const row of rows){
    const bucket = Math.floor(row.ts/ms)*ms;
    const rec = map.get(bucket);
    if (!rec) {
      map.set(bucket,{ ts: bucket, open: row.open ?? row.close, high: row.high ?? row.close, low: row.low ?? row.close, close: row.close });
    } else {
      rec.high = Math.max(rec.high, row.high ?? row.close);
      rec.low  = Math.min(rec.low,  row.low  ?? row.close);
      rec.close = row.close;
    }
  }
  return [...map.values()].sort((a,b)=>a.ts-b.ts);
}
const toCloseArray = rows => rows.map(r=>({ts:r.ts, close:r.close}));

/*----------- مؤشرات -----------*/
function calcEMA(prices, period){
  const out = new Array(prices.length).fill(null);
  const k = 2/(period+1);
  let ema=null,sum=0;
  for(let i=0;i<prices.length;i++){
    const p=prices[i].close;
    if(i<period){ sum+=p; if(i===period-1){ ema=sum/period; out[i]=ema; } }
    else{ ema=p*k+ema*(1-k); out[i]=ema; }
  }
  return out;
}
function calcRSI(prices, period=14){
  const out=new Array(prices.length).fill(null);
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){
    const d=prices[i].close-prices[i-1].close;
    if(d>=0) gain+=d; else loss-=d;
  }
  let avgG=gain/period, avgL=loss/period;
  out[period]=avgL===0?100:100-(100/(1+(avgG/avgL)));
  for(let i=period+1;i<prices.length;i++){
    const d=prices[i].close-prices[i-1].close;
    const g=d>0?d:0, l=d<0?-d:0;
    avgG=(avgG*(period-1)+g)/period;
    avgL=(avgL*(period-1)+l)/period;
    out[i]=avgL===0?100:100-(100/(1+(avgG/avgL)));
  }
  return out;
}
function calcMACD(prices, fast=12, slow=26, signal=9){
  const emaF=calcEMA(prices, fast);
  const emaS=calcEMA(prices, slow);
  const macd=prices.map((_,i)=>{
    const f=emaF[i], s=emaS[i];
    return (f!=null && s!=null)?(f-s):null;
  });
  const macdPts=macd.map((v,i)=>({ts:prices[i].ts, close: (v==null)?NaN:v}));
  const clean=macdPts.filter(p=>Number.isFinite(p.close));
  const sigClean=calcEMA(clean, signal);
  const signalFull=new Array(prices.length).fill(null);
  let j=0;
  for(let i=0;i<prices.length;i++){
    if (Number.isFinite(macdPts[i]?.close)) signalFull[i]=sigClean[j++];
  }
  return { emaF, emaS, macd, signal: signalFull };
}
function classifySignal(rsi, macdVal){
  if (macdVal==null || rsi==null) return 'حيادي';
  if (macdVal>0 && rsi>=50 && rsi<=70) return 'شراء';
  if (macdVal<0 && rsi<=50) return 'بيع';
  return 'حيادي';
}

/*----------- Pivots -----------*/
function calcPivotsFromDaily(daily){
  if (!daily || daily.length<2) return null;
  const y=daily[daily.length-2];
  const H=y.high, L=y.low, C=y.close;
  if (![H,L,C].every(Number.isFinite)) return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

/*----------- UI paint -----------*/
function paintPivots(p){
  if (!p) return;
  elPivotP&&(elPivotP.textContent=fmt.format(p.P));
  elR1&&(elR1.textContent=fmt.format(p.R1));
  elR2&&(elR2.textContent=fmt.format(p.R2));
  elR3&&(elR3.textContent=fmt.format(p.R3));
  elS1&&(elS1.textContent=fmt.format(p.S1));
  elS2&&(elS2.textContent=fmt.format(p.S2));
  elS3&&(elS3.textContent=fmt.format(p.S3));
}
function paintSummary(price,rsi,macdVal){
  if(!elSummaryText) return;
  const sig=classifySignal(rsi,macdVal);
  elSummaryText.textContent=sig;
  elSummaryText.style.color = sig==='شراء' ? '#10b981' : sig==='بيع' ? '#ef4444' : '#f59e0b';
}
function paintIndicators(rsi,macdVal,emaF,emaS){
  if (elIndRSI)  elIndRSI.textContent  = Number.isFinite(rsi)   ? fmt.format(rsi)   : '—';
  if (elIndMACD) elIndMACD.textContent = Number.isFinite(macdVal)? fmt4.format(macdVal): '—';
  if (elIndEMAF) elIndEMAF.textContent = Number.isFinite(emaF)  ? fmt.format(emaF)  : '—';
  if (elIndEMAS) elIndEMAS.textContent = Number.isFinite(emaS)  ? fmt.format(emaS)  : '—';
}
function paintLive(price, isoTime){
  elLivePrice && Number.isFinite(price) && (elLivePrice.textContent = fmt.format(price));
  elLiveTime && isoTime && (elLiveTime.textContent = fmtTime(isoTime));
}
const tr = (h)=>{const x=document.createElement('tr'); x.innerHTML=h; return x;};
function paintTable(rows){
  if(!elTableBody) return;
  elTableBody.innerHTML='';
  const last = rows.slice(-TABLE_ROWS).reverse();
  for (const r of last){
    const sig = classifySignal(r.rsi,r.macd);
    const sigStyle = sig==='شراء'?'color:#10b981;font-weight:600':sig==='بيع'?'color:#ef4444;font-weight:600':'color:#f59e0b;font-weight:600';
    elTableBody.appendChild(tr(`
      <td>${fmt.format(r.price)}</td>
      <td style="${sigStyle}">${sig}</td>
      <td>${Number.isFinite(r.rsi)?fmt.format(r.rsi):'—'}</td>
      <td>${Number.isFinite(r.macd)?fmt4.format(r.macd):'—'}</td>
      <td>${Number.isFinite(r.emaF)?fmt.format(r.emaF):'—'}</td>
    `));
  }
}

/*----------- التحليل -----------*/
async function runAnalysis(){
  try{
    const csvUrl = elCsvInput?.value?.trim() || '';
    const emaFper = parseInt(elEmaFast?.value || '12',10);
    const emaSper = parseInt(elEmaSlow?.value || '26',10);
    const rsiPer  = parseInt(elRsiPeriod?.value|| '14',10);

    const raw5 = await fetchCsv(csvUrl);
    let series = raw5;
    const dailyOHLC = aggregateOHLC(raw5,1440);
    if(currentTF===60) series = toCloseArray(aggregateOHLC(raw5,60));
    else if(currentTF===1440) series = toCloseArray(dailyOHLC);

    if (!series || series.length < Math.max(emaSper,rsiPer)+5) throw new Error('بيانات غير كافية.');

    const emaFarr = calcEMA(series, emaFper);
    const emaSarr = calcEMA(series, emaSper);
    const rsiArr  = calcRSI(series, rsiPer);
    const macdObj = calcMACD(series, emaFper, emaSper, 9);

    const i = series.length-1;
    const priceNow = series[i].close;
    const rsiNow   = rsiArr[i];
    const macdNow  = macdObj.macd[i];
    const emaFnow  = emaFarr[i];
    const emaSnow  = emaSarr[i];

    paintSummary(priceNow, rsiNow, macdNow);
    paintIndicators(rsiNow, macdNow, emaFnow, emaSnow);

    const piv = calcPivotsFromDaily(dailyOHLC);
    paintPivots(piv);

    const rows = series.map((p,idx)=>({
      ts:p.ts, price:p.close, rsi:rsiArr[idx], macd:macdObj.macd[idx], emaF:emaFarr[idx]
    }));
    paintTable(rows);

  }catch(e){
    alert(`تعذّر تحميل/تحليل البيانات: ${e.message||e}`);
    console.error(e);
  }
}

/*----------- السعر الحي -----------*/
async function refreshLivePrice(){
  try{
    const r = await fetch(LIVE_JSON_URL, { cache:'no-store' });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    if(j && j.ok && Number.isFinite(j.price)){
      paintLive(j.price, j.isoTime || (j.date && j.time ? `${j.date}T${j.time}Z` : null));
    }
  }catch(e){ console.warn('Live price error:',e); }
}

/*----------- ربط الأحداث -----------*/
if (elTf5)  elTf5.addEventListener('click', ()=>{ setActiveTF(5); runAnalysis(); });
if (elTf60) elTf60.addEventListener('click',()=>{ setActiveTF(60); runAnalysis(); });
if (elTfD)  elTfD.addEventListener('click', ()=>{ setActiveTF(1440); runAnalysis(); });
elBtnRun && elBtnRun.addEventListener('click', runAnalysis);

// حفظ رابط CSV (اختياري)
const LS_KEY='gs_csv_url';
if (elCsvInput){
  const saved = localStorage.getItem(LS_KEY)||'';
  if(!elCsvInput.value && saved) elCsvInput.value=saved;
  elCsvInput.addEventListener('input', ()=>{
    const v=elCsvInput.value.trim();
    if(v) localStorage.setItem(LS_KEY,v); else localStorage.removeItem(LS_KEY);
  });
}

// بدء التشغيل
setActiveTF(5);
runAnalysis();
refreshLivePrice();
setInterval(refreshLivePrice, LIVE_REFRESH_SEC*1000);
