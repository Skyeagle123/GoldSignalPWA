/* ===========================
   GoldSignals - app.js (Final)
   =========================== */

/* ---------- Utilities ---------- */

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 2) => (isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const nowLocal = () => new Date();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- DOM Elements ---------- */

// Top cards
const elLivePrice = $('livePrice');
const elLiveTime  = $('liveTime');
const elPivotP    = $('pivotP');

// Pivots pills
const elR1=$('r1'), elR2=$('r2'), elR3=$('r3'), elS1=$('s1'), elS2=$('s2'), elS3=$('s3');

// Summary / advice
const elSummaryText = $('summaryText');
const elAdviceText  = $('adviceText');

// Controls
const elCsvInput     = $('csvInput');
const elRunBtn       = $('runBtn');
const elAlertEnable  = $('alertEnable');
const elAlertDist    = $('alertDistance');
const elTogglePivot  = $('togglePivotFilter');
const elToggleNY     = $('toggleNyHours');

const elTf5  = $('tf5');
const elTf30 = $('tf30');
const elTf60 = $('tf60');
const elTfD  = $('tfD');

// Indicators table
const elRSI  = $('indRSI');
const elMACD = $('indMACD');
const elEMAF = $('indEMAF');
const elEMAS = $('indEMAS');
const elStoch= $('indStoch');
const elBB   = $('indBB');

// Settings
const elEmaFast = $('emaFast');
const elEmaSlow = $('emaSlow');
const elRsiPer  = $('rsiPeriod');
const elAtrPer  = $('atrPeriod');

const elSlMult  = $('slMult');
const elTp1Mult = $('tp1Mult');
const elTp2Mult = $('tp2Mult');
const elAtrMin  = $('atrMinPct');
const elAtrMax  = $('atrMaxPct');

const elAcctSize= $('acctSize');
const elRiskPct = $('riskPct');

const elUseStoch= $('useStoch');
const elK       = $('stochK');
const elD       = $('stochD');

const elUseBB   = $('useBB');
const elBBPer   = $('bbPeriod');
const elBBStd   = $('bbStd');

// Table of recent
const elRowsBody = $('rowsBody');

// Chart
const cvs = $('tradeChart');
const ctx = cvs.getContext('2d');

// Backtest
const elBtCsv   = $('btCsv');
const elBtTf    = $('btTf');
const elBtStrict= $('btStrict');
const elBtWalk  = $('btWalk');
const elBtCap   = $('btDailyRiskCap');
const elBtRun   = $('btRun');
const elBtStats = $('btStats');
const elBtRows  = $('btRows');
const elBtEquity= $('btEquity');
const eqCtx     = elBtEquity.getContext('2d');

/* ---------- State ---------- */

let ACTIVE_TF_MIN = 5; // 5 | 30 | 60 | 1440
let SERIES = [];       // {t:Date, o,h,l,c}
let LIVE_PRICE = NaN;
let LAST_CALC = null;
let PIVOT_OBJ = null;
let LAST_ENTRY = null; // {price, side:'BUY'|'SELL'}
let alertArmed = false;

const LIVE_REFRESH_SEC = 15;
const LS_KEY = 'gs_csv_url';

/* ---------- CSV Parsing ---------- */

function parseCSV(text) {
  // Accept two formats:
  // 1) Symbol,Date,Time,Open,High,Low,Close
  // 2) Date,Close  (or Timestamp,Price)
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',').map(s => s.trim().toLowerCase());
  const out = [];

  const idx = {
    date: header.indexOf('date'),
    time: header.indexOf('time'),
    open: header.indexOf('open'),
    high: header.indexOf('high'),
    low : header.indexOf('low'),
    close: header.indexOf('close'),
    price: header.indexOf('price'),
    symbol: header.indexOf('symbol'),
    timestamp: header.indexOf('timestamp')
  };

  for (let i=1;i<lines.length;i++){
    const cols = lines[i].split(',');
    let t, o,h,l,c;

    if (idx.close>=0 && idx.open>=0 && idx.high>=0 && idx.low>=0) {
      const d = idx.date>=0 ? cols[idx.date].trim() : '';
      const tm= idx.time>=0 ? cols[idx.time].trim() : '';
      t = new Date((d+' '+tm).trim());
      if (isNaN(t)) t = new Date(d || tm);
      o = parseFloat(cols[idx.open]);
      h = parseFloat(cols[idx.high]);
      l = parseFloat(cols[idx.low]);
      c = parseFloat(cols[idx.close]);
    } else {
      // minimal: date/ts + price
      const d = idx.date>=0 ? cols[idx.date].trim() :
                (idx.timestamp>=0 ? cols[idx.timestamp].trim() : '');
      t = new Date(d);
      c = parseFloat(idx.price>=0 ? cols[idx.price] : cols[1]);
      // fabricate OHLC around close (not ideal, but allows plotting)
      o = l = h = c;
    }

    if (!isNaN(c) && t instanceof Date && !isNaN(+t)) {
      out.push({ t, o, h, l, c });
    }
  }
  // sort by time ascending
  out.sort((a,b)=>a.t-b.t);
  return out;
}

/* ---------- Indicators ---------- */

function ema(values, period) {
  if (period<=1) return values.slice();
  const k = 2/(period+1);
  const out = [];
  let prev;
  for (let i=0;i<values.length;i++){
    const v = values[i];
    if (i===0) prev = v;
    const e = (v - prev)*k + prev;
    out.push(e);
    prev = e;
  }
  return out;
}

function rsi(values, period) {
  const out = [];
  let gains=0, losses=0;
  for(let i=1;i<values.length;i++){
    const ch = values[i]-values[i-1];
    gains += ch>0 ? ch : 0;
    losses+= ch<0 ? -ch: 0;
    if (i===period) {
      let rs = (gains/period)/((losses/period)||1e-9);
      out.push(100 - (100/(1+rs)));
    } else if (i>period) {
      const chPrev = values[i]-values[i-1];
      const g = chPrev>0 ? chPrev : 0;
      const l = chPrev<0 ? -chPrev:0;
      gains = (gains*(period-1)+g)/period;
      losses= (losses*(period-1)+l)/period;
      let rs = gains/((losses)||1e-9);
      out.push(100 - (100/(1+rs)));
    } else {
      out.push(NaN);
    }
  }
  out.unshift(NaN);
  return out;
}

function macd(values, fast=12, slow=26, signal=9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_,i)=> emaFast[i]-emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const hist = macdLine.map((v,i)=> v - signalLine[i]);
  return { macdLine, signalLine, hist };
}

function atr(ohlc, period=14) {
  const trs = [];
  for (let i=0;i<ohlc.length;i++){
    const a = ohlc[i];
    if (i===0){ trs.push(a.h-a.l); continue; }
    const p = ohlc[i-1];
    const tr = Math.max(
      a.h - a.l,
      Math.abs(a.h - p.c),
      Math.abs(a.l - p.c)
    );
    trs.push(tr);
  }
  // Wilder's ATR
  const out = [];
  let prev;
  for(let i=0;i<trs.length;i++){
    if (i<period){
      out.push(NaN);
      if (i===period-1){
        const s = trs.slice(0,period).reduce((x,y)=>x+y,0);
        prev = s/period;
        out[i]=prev;
      }
    } else {
      const a = (prev*(period-1)+trs[i])/period;
      out.push(a);
      prev = a;
    }
  }
  return out;
}

function stoch(ohlc, kPeriod=14, dPeriod=3) {
  const kArr = [];
  for (let i=0;i<ohlc.length;i++){
    const from = Math.max(0, i-kPeriod+1);
    const slice = ohlc.slice(from, i+1);
    const hi = Math.max(...slice.map(x=>x.h));
    const lo = Math.min(...slice.map(x=>x.l));
    const c  = ohlc[i].c;
    const k = (hi===lo) ? 50 : ((c - lo)/(hi - lo))*100;
    kArr.push(k);
  }
  const dArr = ema(kArr, dPeriod);
  return { k:kArr, d:dArr };
}

function bollinger(values, period=20, stdMul=2) {
  const ma = ema(values, period); // EMA as a smooth MA
  const out = values.map((_,i)=>{
    const from = Math.max(0, i-period+1);
    const slice = values.slice(from, i+1);
    if (slice.length<period) return { mid: NaN, up: NaN, dn: NaN };
    const m = ma[i];
    const mean = slice.reduce((a,b)=>a+b,0)/slice.length;
    const variance = slice.reduce((a,b)=>a+(b-mean)*(b-mean),0)/slice.length;
    const sd = Math.sqrt(variance);
    return { mid:m, up:m + stdMul*sd, dn:m - stdMul*sd };
  });
  return out;
}

/* ---------- Pivot (New York Day) ---------- */

function nyDayPivot(ohlc) {
  // Use last completed New York session (17:00 NY close baseline commonly used).
  // We'll take previous calendar day in America/New_York and compute from all bars in that day.
  try {
    const tz = 'America/New_York';
    const fmtNY = (d)=> new Intl.DateTimeFormat('en-CA',{ timeZone:tz, year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
    const last = ohlc[ohlc.length-1];
    const nyDateStr = fmtNY(last.t);
    // use previous day (completed)
    const lastNY = new Date(new Date(nyDateStr+'T00:00:00').getTime() - 24*3600*1000);
    const prevStr = fmtNY(lastNY);

    const inPrev = ohlc.filter(b => fmtNY(b.t)===prevStr);
    if (!inPrev.length) return null;

    const high = Math.max(...inPrev.map(b=>b.h));
    const low  = Math.min(...inPrev.map(b=>b.l));
    const close= inPrev[inPrev.length-1].c;

    const P = (high+low+close)/3;
    const R1 = 2*P - low;
    const S1 = 2*P - high;
    const R2 = P + (high - low);
    const S2 = P - (high - low);
    const R3 = high + 2*(P - low);
    const S3 = low  - 2*(high - P);

    return { P,R1,R2,R3,S1,S2,S3 };
  } catch(e){
    return null;
  }
}

/* ---------- Live Price ---------- */

async function getLivePriceFallback(lastClose) {
  // Try multiple public endpoints (CORS may fail on some).
  const trials = [
    // Yahoo Finance gold futures GC=F
    () => fetch('https://query1.finance.yahoo.com/v7/finance/quote?symbols=GC=F').then(r=>r.json()).then(j=>j.quoteResponse.result[0]?.regularMarketPrice),
    // Alternative: XAUUSD via Stooq (CSV last)
    () => fetch('https://stooq.com/q/l/?s=xauusd&i=5').then(r=>r.text()).then(t=>{
      const lines=t.trim().split('\n'); const last=lines[lines.length-1]?.split(','); return parseFloat(last?.[4]);
    }),
  ];

  for (let fn of trials){
    try {
      const p = await Promise.race([
        fn(),
        new Promise((_,rej)=> setTimeout(()=>rej(new Error('timeout')), 4000))
      ]);
      if (isFinite(p)) return p;
    } catch(e){}
  }
  return lastClose; // fallback
}

/* ---------- Chart Drawing ---------- */

function clearCanvas(c,ctx){
  const dpr = window.devicePixelRatio||1;
  const w = Math.floor(c.clientWidth*dpr);
  const h = Math.floor(c.clientHeight*dpr);
  if (c.width!==w) c.width=w;
  if (c.height!==h) c.height=h;
  ctx.clearRect(0,0,w,h);
  return {w,h,dpr};
}

function drawChart(ohlc, livePrice, levels){
  const {w,h} = clearCanvas(cvs, ctx);
  if (!ohlc?.length) return;

  const padL=40, padR=15, padT=18, padB=26;
  const xs = ohlc.map((_,i)=>i);
  const ys = ohlc.map(b=>b.c);
  const minY = Math.min(...ohlc.map(b=>b.l), isFinite(livePrice)?livePrice:Infinity);
  const maxY = Math.max(...ohlc.map(b=>b.h), isFinite(livePrice)?livePrice:-Infinity);

  const X = (i)=> padL + (i/(ohlc.length-1))*(w-padL-padR);
  const Y = (v)=> padT + (1-(v-minY)/(maxY-minY+1e-9))*(h-padT-padB);

  // grid
  ctx.strokeStyle = '#22314a';
  ctx.lineWidth = 1;
  ctx.setLineDash([2,4]);
  const gridN=4;
  for(let i=1;i<=gridN;i++){
    const yy = padT + i*(h-padT-padB)/gridN;
    ctx.beginPath(); ctx.moveTo(padL,yy); ctx.lineTo(w-padR,yy); ctx.stroke();
  }
  ctx.setLineDash([]);

  // price line
  ctx.strokeStyle = '#29f0c8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(ys[0]));
  for (let i=1;i<ys.length;i++){
    ctx.lineTo(X(i), Y(ys[i]));
  }
  ctx.stroke();

  // live price dashed
  if (isFinite(livePrice)){
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([6,6]);
    ctx.lineWidth = 2;
    const yy = Y(livePrice);
    ctx.beginPath(); ctx.moveTo(padL,yy); ctx.lineTo(w-padR,yy); ctx.stroke();
    ctx.setLineDash([]);
    // bubble
    ctx.fillStyle='#0b1220';
    ctx.strokeStyle='#99aacc';
    ctx.lineWidth=1;
    const txt = 'Live: '+fmt(livePrice,2);
    ctx.font='12px system-ui';
    const tw = ctx.measureText(txt).width+10;
    ctx.beginPath(); ctx.roundRect(padL+6, yy-16, tw, 18, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#cfe8ff'; ctx.fillText(txt, padL+11, yy-3);
  }

  // SL/TP & entry (if available)
  if (levels?.entry){
    // entry
    ctx.strokeStyle = '#3da6ff';
    ctx.setLineDash([4,4]); ctx.lineWidth=2;
    const yE = Y(levels.entry);
    ctx.beginPath(); ctx.moveTo(padL,yE); ctx.lineTo(w-padR,yE); ctx.stroke();

    // TP1/TP2
    ctx.strokeStyle = '#24d17e';
    const y1 = Y(levels.tp1); const y2 = Y(levels.tp2);
    ctx.beginPath(); ctx.moveTo(padL,y1); ctx.lineTo(w-padR,y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL,y2); ctx.lineTo(w-padR,y2); ctx.stroke();

    // SL
    ctx.strokeStyle = '#ef4444';
    const ys_ = Y(levels.sl);
    ctx.beginPath(); ctx.moveTo(padL,ys_); ctx.lineTo(w-padR,ys_); ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* ---------- Advice / Signals ---------- */

function withinNYHours(d){
  if (!elToggleNY.checked) return true;
  try {
    const tz='America/New_York';
    const opt={timeZone:tz,hour:'2-digit',hour12:false};
    const h = parseInt(new Intl.DateTimeFormat('en-US',opt).format(d),10);
    // active hours 8:00-17:00 NY (example)
    return h>=8 && h<=17;
  } catch(e){ return true; }
}

function generateAdvice(ohlc) {
  const closes = ohlc.map(b=>b.c);
  const fast = parseInt(elEmaFast.value,10);
  const slow = parseInt(elEmaSlow.value,10);
  const rsiP = parseInt(elRsiPer.value,10);
  const atrP = parseInt(elAtrPer.value,10);

  const emaF = ema(closes, fast);
  const emaS = ema(closes, slow);
  const rsiV = rsi(closes, rsiP);
  const atrV = atr(ohlc, atrP);

  // Optional indicators
  let st=null, bb=null;
  if (elUseStoch.checked) st = stoch(ohlc, parseInt(elK.value,10), parseInt(elD.value,10));
  if (elUseBB.checked)    bb = bollinger(closes, parseInt(elBBPer.value,10), parseFloat(elBBStd.value));

  const i = closes.length-1;
  const c = closes[i];
  const atrAbs = atrV[i];
  const atrPct = atrAbs ? (atrAbs/c)*100 : NaN;

  // Pivot
  const piv = nyDayPivot(ohlc);
  PIVOT_OBJ = piv;
  if (piv){
    elPivotP.textContent = fmt(piv.P,2);
    elR1.textContent = fmt(piv.R1,2);
    elR2.textContent = fmt(piv.R2,2);
    elR3.textContent = fmt(piv.R3,2);
    elS1.textContent = fmt(piv.S1,2);
    elS2.textContent = fmt(piv.S2,2);
    elS3.textContent = fmt(piv.S3,2);
  }

  // Fill indicator labels
  elEMAF.textContent = fmt(emaF[i],2);
  elEMAS.textContent = fmt(emaS[i],2);
  elRSI.textContent  = fmt(rsiV[i],2);
  const { macdLine, signalLine } = macd(closes, fast, slow, 9);
  elMACD.textContent = fmt(macdLine[i]-signalLine[i],4);
  if (st) elStoch.textContent = `${fmt(st.k[i],2)} / ${fmt(st.d[i],2)}`;
  else elStoch.textContent='—';
  if (bb) elBB.textContent = `${fmt(bb[i].dn,2)} • ${fmt(bb[i].mid,2)} • ${fmt(bb[i].up,2)}`;
  else elBB.textContent='—';

  // ATR sanity & filter window
  const minPct = parseFloat(elAtrMin.value);
  const maxPct = parseFloat(elAtrMax.value);

  let allow = true;
  let reasons = [];

  if (!withinNYHours(ohlc[i].t)) {
    allow = false;
    reasons.push('خارج ساعات نيويورك');
  }
  if (isFinite(atrPct) && (atrPct<minPct || atrPct>maxPct)) {
    allow = false;
    reasons.push(`ATR% خارج النطاق [${minPct}–${maxPct}]`);
  }
  if (elTogglePivot.checked && piv){
    // simple: avoid long if below P; avoid short if above P
    if (c < piv.P) reasons.push('تحت Pivot (NY)');
  }

  // Signal logic (simple EMA cross + RSI confirmation)
  let side = 'NONE';
  if (emaF[i] > emaS[i] && rsiV[i] >= 50) side = 'BUY';
  else if (emaF[i] < emaS[i] && rsiV[i] <= 50) side = 'SELL';

  if (!allow) side = 'NONE';

  // Levels
  const slMult = parseFloat(elSlMult.value);
  const tp1Mul = parseFloat(elTp1Mult.value);
  const tp2Mul = parseFloat(elTp2Mult.value);

  let entry=null, sl=null, tp1=null, tp2=null;
  if (side==='BUY'){
    entry = c; sl = c - slMult*atrAbs; tp1 = c + tp1Mul*atrAbs; tp2 = c + tp2Mul*atrAbs;
  } else if (side==='SELL'){
    entry = c; sl = c + slMult*atrAbs; tp1 = c - tp1Mul*atrAbs; tp2 = c - tp2Mul*atrAbs;
  }

  LAST_ENTRY = entry ? { price: entry, side } : null;

  // Advice text
  if (side==='NONE'){
    elSummaryText.textContent = reasons.length ? reasons.join(' • ') : 'لا توجد إشارة حالياً';
    elAdviceText.textContent  = `* إطّلاع فقط: لا إشارة تداول فعّالة. ATR%: ${fmt(atrPct,2)} • آخر سعر: ${fmt(c,2)}.`;
  } else {
    const atrStr = `ضمن ATR%: ${fmt(atrPct,2)}`;
    elSummaryText.textContent = `${side==='BUY'?'شراء':'بيع'} • ${atrStr}`;
    elAdviceText.textContent  = `الإطار: ${ACTIVE_TF_MIN===1440?'يوم':ACTIVE_TF_MIN+' دقائق'} • الملخّص: ${side==='BUY'?'شراء':'بيع'} • دخول (إطّلاع فقط): ${fmt(entry,2)} • SL: ${fmt(sl,2)} • TP1/TP2: ${fmt(tp1,2)} / ${fmt(tp2,2)} • آخر سعر: ${fmt(c,2)}.`;
  }

  LAST_CALC = {
    side, entry, sl, tp1, tp2, close:c
  };

  drawChart(ohlc, LIVE_PRICE, LAST_CALC);
  updateRecentTable([LAST_CALC], ohlc[i].t);

  // Alert near entry
  if (elAlertEnable.checked && LAST_CALC?.entry && isFinite(LIVE_PRICE)) {
    const dist = Math.abs(LIVE_PRICE - LAST_CALC.entry);
    const th = Math.abs(parseFloat(elAlertDist.value)||0);
    if (dist<=th) {
      if (!alertArmed){
        alertArmed = true;
        try { new AudioContext(); } catch(e){}
        alert(`تنبيه: السعر الحي اقترب من نقطة الدخول (${fmt(LAST_CALC.entry,2)}).`);
        setTimeout(()=> alertArmed=false, 10000);
      }
    }
  }
}

/* ---------- Table ---------- */

function updateRecentTable(items, t){
  // Append row (limit ~80)
  if (!items || !items.length) return;
  const ex = items[0];
  const tr = document.createElement('tr');
  const idx = elRowsBody.children.length+1;

  const add = (s, cls='')=>{
    const td = document.createElement('td');
    td.textContent = s;
    if (cls) td.className=cls;
    tr.appendChild(td);
  };

  add(String(idx));
  add(t ? t.toLocaleString() : '—');
  add(ex.side||'—');
  add(isFinite(ex.entry)?fmt(ex.entry,2):'—','r');
  add(isFinite(ex.sl)?fmt(ex.sl,2):'—','r'); // نعرض SL في عمود Exit مؤقتًا
  add('—','r');
  add('—','r');

  elRowsBody.appendChild(tr);

  // cap
  while (elRowsBody.children.length>80){
    elRowsBody.removeChild(elRowsBody.firstChild);
  }
}

/* ---------- Load CSV (auto or manual) ---------- */

async function loadPrimaryCSV() {
  const url = (elCsvInput.value||'').trim() || 'XAUUSD_5min.csv';
  try {
    const res = await fetch(url, { cache:'no-store' });
    if (!res.ok) throw new Error(res.statusText);
    const text = await res.text();
    return parseCSV(text);
  } catch(e){
    console.warn('CSV fetch failed:', e.message);
    return [];
  }
}

/* ---------- Main Analysis Flow ---------- */

async function runAnalysis(){
  // Load base series from CSV (does not include live)
  const base = await loadPrimaryCSV();
  if (!base.length){ 
    alert('تعذّر تحميل/تحليل البيانات: تأكد من وجود XAUUSD_5min.csv أو رابط CSV صحيح.');
    return;
  }

  // Resample to active TF if needed
  SERIES = resample(base, ACTIVE_TF_MIN);

  // Live price
  const lastClose = SERIES[SERIES.length-1].c;
  LIVE_PRICE = await getLivePriceFallback(lastClose);
  elLivePrice.textContent = fmt(LIVE_PRICE,2);
  elLiveTime.textContent  = nowLocal().toLocaleTimeString();

  // Merge live price as a horizontal guide only (لا نعدل CSV)
  generateAdvice(SERIES);
}

function resample(ohlc, tfMin){
  if (tfMin===5) return ohlc.slice(-250); // limit
  if (tfMin===1440){
    // daily candle NY-aligned
    const byDay = {};
    ohlc.forEach(b=>{
      const d = new Intl.DateTimeFormat('en-CA',{ timeZone:'America/New_York', year:'numeric',month:'2-digit',day:'2-digit' }).format(b.t);
      if (!byDay[d]) byDay[d] = { t:new Date(b.t), o:b.o, h:b.h, l:b.l, c:b.c };
      const a = byDay[d];
      a.h = Math.max(a.h, b.h);
      a.l = Math.min(a.l, b.l);
      a.c = b.c;
    });
    return Object.values(byDay).sort((a,b)=>a.t-b.t).slice(-200);
  }
  // generic aggregation
  const out=[];
  const bucket = (ms)=> Math.floor(ms/(tfMin*60*1000));
  let cur=null, curB=-1;
  for (const b of ohlc){
    const k = bucket(+b.t);
    if (k!==curB){
      if (cur) out.push(cur);
      curB=k;
      cur={ t:new Date(k*tfMin*60*1000), o:b.o, h:b.h, l:b.l, c:b.c };
    } else {
      cur.h=Math.max(cur.h,b.h);
      cur.l=Math.min(cur.l,b.l);
      cur.c=b.c;
    }
  }
  if (cur) out.push(cur);
  return out.slice(-250);
}

/* ---------- Live Refresh ---------- */

async function refreshLive() {
  if (!SERIES.length) return;
  const lastClose = SERIES[SERIES.length-1].c;
  LIVE_PRICE = await getLivePriceFallback(lastClose);
  elLivePrice.textContent = fmt(LIVE_PRICE,2);
  elLiveTime.textContent  = nowLocal().toLocaleTimeString();
  drawChart(SERIES, LIVE_PRICE, LAST_CALC);
}

/* ---------- Backtest ---------- */

function equityPlot(points){
  const {w,h} = (function(){ // clear
    const dpr = window.devicePixelRatio||1;
    const W = Math.floor(elBtEquity.clientWidth*dpr);
    const H = Math.floor(elBtEquity.clientHeight*dpr);
    if (elBtEquity.width!==W) elBtEquity.width=W;
    if (elBtEquity.height!==H) elBtEquity.height=H;
    eqCtx.clearRect(0,0,W,H);
    return {w:W,h:H};
  })();

  if (!points.length) return;
  const pad=20;
  const xs=points.map((_,i)=>i);
  const ys=points.map(p=>p);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const X=(i)=> pad + (i/(xs.length-1))*(w-2*pad);
  const Y=(v)=> pad + (1-(v-minY)/(maxY-minY+1e-9))*(h-2*pad);

  eqCtx.strokeStyle='#22d3ee'; eqCtx.lineWidth=2;
  eqCtx.beginPath(); eqCtx.moveTo(X(0),Y(ys[0]));
  for(let i=1;i<ys.length;i++) eqCtx.lineTo(X(i),Y(ys[i]));
  eqCtx.stroke();
}

function summarizeBt(trades){
  const wins = trades.filter(t=>t.pnl>0);
  const losses = trades.filter(t=>t.pnl<0);
  const pf = (wins.reduce((s,t)=>s+t.pnl,0) / Math.abs(losses.reduce((s,t)=>s+t.pnl,0) || 1));
  const winPct = trades.length? (wins.length/trades.length*100):0;
  const eq = []; let e=0; let maxDD=0; let peak=0;
  trades.forEach(t=>{ e+=t.pnl; eq.push(e); peak=Math.max(peak,e); maxDD=Math.min(maxDD, e-peak); });
  const avgR = trades.length? trades.reduce((s,t)=>s+t.R,0)/trades.length : 0;
  elBtStats.textContent = `Win%: ${fmt(winPct,2)} • PF: ${fmt(pf,2)} • Expectancy: ${fmt(avgR,2)}R • الصفقات: ${trades.length} • (R): ${fmt(avgR,2)} • MaxDD$: ${fmt(maxDD,2)} • PnL$: ${fmt(e,2)} • Sharpe≈ ${fmt((avgR/ (Math.sqrt(2)||1)),2)}`;
  equityPlot(eq);
}

async function runBacktest(){
  const file = elBtCsv.files[0];
  if (!file){ alert('حمّل ملف CSV أولاً'); return; }
  const txt = await file.text();
  const raw = parseCSV(txt);
  if (!raw.length){ alert('CSV غير صالح'); return; }

  const tf = parseInt(elBtTf.value,10);
  const series = resample(raw, tf);

  const riskPct = parseFloat(elRiskPct.value)/100;
  const acct = parseFloat(elAcctSize.value);
  const dailyCapPct = parseFloat(elBtCap.value)/100;

  const trades=[];
  let dayRisk=0, currentDay=null;

  for (let i=50;i<series.length;i++){
    const seg = series.slice(0,i+1);
    const closes = seg.map(b=>b.c);

    const f=parseInt(elEmaFast.value,10), s=parseInt(elEmaSlow.value,10);
    const r=parseInt(elRsiPer.value,10), a=parseInt(elAtrPer.value,10);
    const eF=ema(closes,f), eS=ema(closes,s), rV=rsi(closes,r), aV=atr(seg,a);

    const c = closes[closes.length-1];
    const atrAbs = aV[aV.length-1];
    const side = (eF[eF.length-1] > eS[eS.length-1] && rV[rV.length-1]>=50) ? 'BUY'
                : (eF[eF.length-1] < eS[eS.length-1] && rV[rV.length-1]<=50) ? 'SELL' : 'NONE';
    if (side==='NONE') continue;

    // daily cap
    const dStr = seg[seg.length-1].t.toDateString();
    if (currentDay!==dStr){ currentDay=dStr; dayRisk=0; }
    if (dayRisk>=dailyCapPct*acct) continue;

    const slMul=parseFloat(elSlMult.value), tp1=parseFloat(elTp1Mult.value), tp2=parseFloat(elTp2Mult.value);
    const entry=c;
    const sl = side==='BUY'? c - slMul*atrAbs : c + slMul*atrAbs;
    const exit = side==='BUY'? c + tp1*atrAbs : c - tp1*atrAbs; // TP1 as exit
    const riskPerTrade = acct*riskPct;
    const R = (Math.abs(exit-entry) / Math.abs(entry-sl)) * (side==='BUY'?(exit>entry?1:-1):(exit<entry?1:-1));
    const pnl = (R * riskPerTrade);

    dayRisk += Math.max(0, riskPerTrade * (side==='BUY'?(entry>sl?0:1):(entry<sl?0:1))); // naive

    trades.push({
      i,
      date: seg[seg.length-1].t.toLocaleString(),
      side, entry, exit, R, pnl
    });
  }

  // render rows
  elBtRows.innerHTML='';
  trades.forEach((t,idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${idx+1}</td>
      <td>${t.date}</td>
      <td>${t.side}</td>
      <td class="r">${fmt(t.entry,2)}</td>
      <td class="r">${fmt(t.exit,2)}</td>
      <td class="r">${fmt(t.R,2)}</td>
      <td class="r ${t.pnl>=0?'good':'bad'}">${fmt(t.pnl,2)}</td>`;
    elBtRows.appendChild(tr);
  });

  summarizeBt(trades);
}

/* ---------- Events ---------- */

function setActiveTF(min){
  ACTIVE_TF_MIN = min;
  [elTf5, elTf30, elTf60, elTfD].forEach(b=>b.classList.remove('active'));
  if (min===5) elTf5.classList.add('active');
  else if (min===30) elTf30.classList.add('active');
  else if (min===60) elTf60.classList.add('active');
  else elTfD.classList.add('active');
}

elTf5 .addEventListener('click', ()=>{ setActiveTF(5);   runAnalysis(); });
elTf30.addEventListener('click', ()=>{ setActiveTF(30);  runAnalysis(); });
elTf60.addEventListener('click', ()=>{ setActiveTF(60);  runAnalysis(); });
elTfD .addEventListener('click', ()=>{ setActiveTF(1440);runAnalysis(); });

elRunBtn.addEventListener('click', runAnalysis);
elBtRun .addEventListener('click', runBacktest);

// Save CSV link
if (elCsvInput){
  const saved = localStorage.getItem(LS_KEY)||'';
  if (!elCsvInput.value && saved) elCsvInput.value = saved;
  elCsvInput.addEventListener('input', ()=>{
    const v = elCsvInput.value.trim();
    if (v) localStorage.setItem(LS_KEY, v);
    else localStorage.removeItem(LS_KEY);
  });
}

/* ---------- Init ---------- */

(async function init(){
  setActiveTF(5);
  await runAnalysis();
  setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
})();
