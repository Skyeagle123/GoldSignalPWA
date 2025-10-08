/* =========================
   GoldSignals PWA — app.js
   (RSI / MACD / EMA trend + Auto indicators + Filters)
   ========================= */

/* ---------- DOM helpers ---------- */
const $ = id => document.getElementById(id);

/* ---------- UI Elements (match HTML) ---------- */
// top controls
const elCsvInput = $('csvInput');
const elRun = $('runBtn');
const elTf5 = $('tf5'), elTf30 = $('tf30'), elTf60 = $('tf60'), elTfD = $('tfD');
const elPro = $('proMode');
const elMtf = $('mtfConfirm'); // يوجد واحد فقط (فوق)

// KPIs
const elLivePrice = $('livePrice'), elLiveTime = $('liveTime');
const elSummaryText = $('summaryText');

// indicator chips
const elIndRSI = $('indRSI'), elIndMACD = $('indMACD'), elIndEMAF = $('indEMAF'), elIndEMAS = $('indEMAS');
const elIndStoch = $('indStoch'), elIndBB = $('indBB');

// chart
const elChart = $('tradeChart');
const ctxChart = elChart ? elChart.getContext('2d') : null;

// settings: numbers
const elEmaF = $('emaFast'), elEmaS = $('emaSlow');
const elRSIP = $('rsiPeriod'), elATRP = $('atrPeriod');
const elSL = $('slMult'), elTP1 = $('tp1Mult'), elTP2 = $('tp2Mult');
const elAtrMin = $('atrMinPct'), elAtrMax = $('atrMaxPct');
const elAcct = $('acctSize'), elRisk = $('riskPct');

// stochastic / bb
const elUseStoch = $('useStoch'), elStochK = $('stochK'), elStochD = $('stochD');
const elUseBB = $('useBB'), elBBPeriod = $('bbPeriod'), elBBStd = $('bbStd');

// NEW manual/auto
const elAutoInd = $('autoInd');
const elUseRSI  = $('useRSI');
const elUseMACD = $('useMACD');
const elUseEMA  = $('useEMA');

// filters
const elToggleNyHours = $('toggleNyHours');
const elTogglePivotFilter = $('togglePivotFilter');

// pivot labels
const elR1=$('r1'), elR2=$('r2'), elR3=$('r3'), elS1=$('s1'), elS2=$('s2'), elS3=$('s3'), elPivotP=$('pivotP');

// alert
const elAlertEnable=$('alertEnable'), elAlertDistance=$('alertDistance');

// tables
const elRowsBody=$('rowsBody');

// backtest (موجودة بالـHTML – نتركها للرندر لاحقًا/اختياري)
const elBtCsv=$('btCsv'), elBtRun=$('btRun'), elBtStats=$('btStats'); // الخ

/* ---------- Global state ---------- */
let TF = 5;               // minutes; 1440 for day (NY)
let PRO_MODE = false;
let MTF_CONFIRM = true;

// indicators usage
let AUTO_IND = false;
let USE_RSI = true, USE_MACD = true, USE_EMA_TREND = true;
let USE_STOCH = false, USE_BB = false;

// numeric settings (defaults sync with HTML)
let EMA_FAST=12, EMA_SLOW=26, RSI_PERIOD=14, ATR_PERIOD=14;
let SL_MULT=1.5, TP1_MULT=1.0, TP2_MULT=2.0;
let ATR_MIN_PCT=0.05, ATR_MAX_PCT=0.8;
let ACCT_SIZE=10000, RISK_PCT=1.0;
let STOCH_K=14, STOCH_D=3, BB_PERIOD=20, BB_STD=2.0;

// pivots timeframe (New York day)
const NY_TRADE_START={hour:8, minute:0}, NY_TRADE_END={hour:17, minute:0};
let PIVOT_MIN_DISTANCE = 0.8; // بالدولار النسبي / تقريبي — يمكن تعديله

/* ---------- Utilities ---------- */
const toLocal = ts => {
  const d = new Date(ts);
  return { date: d.toLocaleDateString(), time: d.toLocaleTimeString() };
};
function median(a,b){ if(!Number.isFinite(a)) return b; if(!Number.isFinite(b)) return a; return (a+b)/2; }
function sum(arr, s, e){ let t=0; for(let i=s;i<e;i++) t+=arr[i]; return t; }

/* ---------- Load/Save settings ---------- */
function num(el, def){ const v=parseFloat(el?.value); return Number.isFinite(v)?v:def; }
function loadSettings(){
  PRO_MODE = !!elPro?.checked;
  MTF_CONFIRM = !!elMtf?.checked;

  EMA_FAST = parseInt(elEmaF?.value??12,10);
  EMA_SLOW = parseInt(elEmaS?.value??26,10);
  RSI_PERIOD = parseInt(elRSIP?.value??14,10);
  ATR_PERIOD = parseInt(elATRP?.value??14,10);

  SL_MULT = num(elSL,1.5);
  TP1_MULT = num(elTP1,1.0);
  TP2_MULT = num(elTP2,2.0);

  ATR_MIN_PCT = num(elAtrMin,0.05);
  ATR_MAX_PCT = num(elAtrMax,0.8);

  ACCT_SIZE = num(elAcct,10000);
  RISK_PCT  = num(elRisk,1.0);

  USE_STOCH = !!elUseStoch?.checked;
  STOCH_K   = parseInt(elStochK?.value??14,10);
  STOCH_D   = parseInt(elStochD?.value??3,10);

  USE_BB    = !!elUseBB?.checked;
  BB_PERIOD = parseInt(elBBPeriod?.value??20,10);
  BB_STD    = num(elBBStd,2.0);

  AUTO_IND      = !!elAutoInd?.checked;
  USE_RSI       = elUseRSI?.checked !== false;
  USE_MACD      = elUseMACD?.checked !== false;
  USE_EMA_TREND = elUseEMA?.checked !== false;
}

/* ---------- CSV loader ---------- */
async function loadCsv(path){
  const res = await fetch(path, {cache:'no-store'});
  const txt = await res.text();
  // accept either headered CSV or minimal
  const lines = txt.trim().split(/\r?\n/);
  const out = [];
  for (let i=1;i<lines.length;i++){
    const L = lines[i].split(',');
    if (L.length<2) continue;
    // common formats:
    // Symbol,Date,Time,Open,High,Low,Close  OR  Date,Time,Close  OR Date,Close
    let date, time, open, high, low, close;
    if (L.length>=7){
      // assume: ...,Date,Time,Open,High,Low,Close
      date = L[L.length-6]; time = L[L.length-5];
      open = +L[L.length-4]; high=+L[L.length-3]; low=+L[L.length-2]; close=+L[L.length-1];
    } else if (L.length===3){
      date=L[0]; time=L[1]; close=+L[2]; open=high=low=close;
    } else {
      date=L[0]; time='00:00'; close=+L[1]; open=high=low=close;
    }
    const ts = Date.parse(date+' '+time+' UTC'); // نعالج كتوقيت UTC ثم نعرض محلي
    out.push({ts, open, high, low, close});
  }
  return out.sort((a,b)=>a.ts-b.ts);
}

/* ---------- Indicators ---------- */
function ema(arr, period){
  const k = 2/(period+1);
  const out = Array(arr.length).fill(NaN);
  let prev;
  for (let i=0;i<arr.length;i++){
    const v=arr[i];
    if (!Number.isFinite(v)) continue;
    if (i===0 || !Number.isFinite(prev)) prev=v;
    else prev = v*k + prev*(1-k);
    out[i]=prev;
  }
  return out;
}
function rsi(closes, period){
  const out = Array(closes.length).fill(NaN);
  let gain=0, loss=0;
  for (let i=1;i<=period;i++){
    const ch = closes[i]-closes[i-1];
    gain += Math.max(0,ch);
    loss += Math.max(0,-ch);
  }
  let avgGain=gain/period, avgLoss=loss/period;
  out[period]=100 - 100/(1+(avgGain/(avgLoss||1e-9)));
  for (let i=period+1;i<closes.length;i++){
    const ch=closes[i]-closes[i-1];
    gain = Math.max(0,ch); loss = Math.max(0,-ch);
    avgGain = (avgGain*(period-1)+gain)/period;
    avgLoss = (avgLoss*(period-1)+loss)/period;
    out[i]=100 - 100/(1+(avgGain/(avgLoss||1e-9)));
  }
  return out;
}
function macd(closes, fast=12, slow=26, signal=9){
  const emaF=ema(closes,fast), emaS=ema(closes,slow);
  const macdArr = closes.map((_,i)=> (emaF[i]-emaS[i]));
  const sig = ema(macdArr, signal);
  return { macd: macdArr, signal: sig, emaF, emaS };
}
function atr(series, period){
  const out = Array(series.length).fill(NaN);
  let tr;
  for (let i=1;i<series.length;i++){
    const h=series[i].high, l=series[i].low, pc=series[i-1].close;
    tr = Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
    out[i]=tr;
  }
  // EMA of TR
  return ema(out, period);
}
function atrPct(atrVal, price){ return (Number.isFinite(atrVal)&&Number.isFinite(price)&&price>0)?(atrVal/price):NaN; }

function stochastic(series, kP=14, dP=3){
  const K = Array(series.length).fill(NaN);
  const D = Array(series.length).fill(NaN);
  for (let i=kP-1;i<series.length;i++){
    let hh=-Infinity,ll=Infinity;
    for (let j=i-kP+1;j<=i;j++){ hh=Math.max(hh,series[j].high); ll=Math.min(ll,series[j].low); }
    const close=series[i].close;
    K[i] = (hh===ll)?50:((close-ll)/(hh-ll))*100;
  }
  // simple MA for D
  for (let i=kP-1;i<series.length;i++){
    let s=0,c=0;
    for (let j=Math.max(kP-1, i-dP+1); j<=i; j++){ s+=K[j]; c++; }
    D[i]=s/c;
  }
  return {K,D};
}
function bollinger(closes, period=20, std=2){
  const mid=ema(closes, period);
  const up=Array(closes.length).fill(NaN), dn=Array(closes.length).fill(NaN);
  for (let i=period-1;i<closes.length;i++){
    const s = closes.slice(i-period+1, i+1);
    const m = mid[i];
    const v = s.reduce((a,b)=>a+(b-m)*(b-m),0)/s.length;
    const sd = Math.sqrt(v);
    up[i]=m+sd*std; dn[i]=m-sd*std;
  }
  return {mid,up,dn};
}

/* ---------- Session / Pivots ---------- */
function inNyTradingHours(ts){
  if (elToggleNyHours?.checked) return true; // تعطيل الفلتر
  const d = new Date(ts); // local
  const h=d.getUTCHours(), m=d.getUTCMinutes(); // نعتبر توقيت UTC لجلسة ثابتة
  // جلسة NY تقريبية 13:00–22:00 UTC (8–17 NY)
  const t=h*60+m, s=13*60, e=22*60;
  return t>=s && t<=e;
}
function dailyPivotsNY(series){
  // بسيط: آخر يوم نيويورك مُغلق (نجمع H/L/C من ذلك اليوم)
  if (!series.length) return null;
  // استخدم آخر 24*60/5 = 288 شمعات تقريبية لليوم السابق (لـ 5د)
  const last = series[series.length-1];
  let end = new Date(last.ts);
  let start = new Date(end.getTime()-24*60*60*1000);
  let H=-Infinity,L=Infinity,C=series[series.length-1].close;
  for (let i=0;i<series.length;i++){
    const t=new Date(series[i].ts);
    if (t>=start && t<=end){ H=Math.max(H,series[i].high); L=Math.min(L,series[i].low); }
  }
  if (!Number.isFinite(H)||!Number.isFinite(L)) return null;
  const P=(H+L+C)/3;
  const R1=2*P-L, S1=2*P-H;
  const R2=P+(H-L), S2=P-(H-L);
  const R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}
function updatePivotUI(pv){
  if(!pv){ ['r1','r2','r3','s1','s2','s3','pivotP'].forEach(id=>$(id).textContent='—'); return; }
  elR1.textContent = pv.R1.toFixed(2);
  elR2.textContent = pv.R2.toFixed(2);
  elR3.textContent = pv.R3.toFixed(2);
  elS1.textContent = pv.S1.toFixed(2);
  elS2.textContent = pv.S2.toFixed(2);
  elS3.textContent = pv.S3.toFixed(2);
  elPivotP.textContent = pv.P.toFixed(2);
}

/* ---------- Signal decision honoring toggles ---------- */
function rsiMacdCtx(series, rsiArr, mac, i){
  return {
    rsiVal: rsiArr[i],
    macdNow: mac.macd[i],
    macdPrev: mac.macd[i-1],
    macdSig: mac.signal[i],
    emaF: mac.emaF[i],
    emaS: mac.emaS[i],
    price: series[i].close
  };
}

function decideSignal(ctx){
  const useRSI = USE_RSI, useMACD = USE_MACD, useEMA = USE_EMA_TREND;
  if (!useRSI && !useMACD && !useEMA) return 'حيادي';

  if (PRO_MODE){
    const macBuy  = !useMACD || ((ctx.macdPrev<=ctx.macdSig && ctx.macdNow>ctx.macdSig) || (ctx.macdNow>ctx.macdSig));
    const macSell = !useMACD || ((ctx.macdPrev>=ctx.macdSig && ctx.macdNow<ctx.macdSig) || (ctx.macdNow<ctx.macdSig));
    const emaUp = !useEMA || (ctx.price>ctx.emaF && ctx.emaF>ctx.emaS);
    const emaDn = !useEMA || (ctx.price<ctx.emaF && ctx.emaF<ctx.emaS);
    const rsiBuy  = !useRSI || (ctx.rsiVal>50 && ctx.rsiVal<68);
    const rsiSell = !useRSI || (ctx.rsiVal<50);

    if (macBuy && emaUp && rsiBuy) return 'شراء';
    if (macSell && emaDn && rsiSell) return 'بيع';
    return 'حيادي';
  } else {
    // base logic
    if (useMACD && useRSI){
      if (ctx.macdNow>0 && ctx.rsiVal>=50) return 'شراء';
      if (ctx.macdNow<0 && ctx.rsiVal<=50) return 'بيع';
      return 'حيادي';
    }
    if (useMACD){
      if (ctx.macdNow>0) return 'شراء';
      if (ctx.macdNow<0) return 'بيع';
      return 'حيادي';
    }
    if (useRSI){
      if (ctx.rsiVal>=50 && ctx.rsiVal<=70) return 'شراء';
      if (ctx.rsiVal<=50) return 'بيع';
      return 'حيادي';
    }
    if (useEMA){
      if (ctx.emaF>ctx.emaS && ctx.price>ctx.emaF) return 'شراء';
      if (ctx.emaF<ctx.emaS && ctx.price<ctx.emaF) return 'بيع';
      return 'حيادي';
    }
    return 'حيادي';
  }
}

/* ---------- Extra filters ---------- */
function applyExtraFilters(sig, series, i, stoch, bb, pv){
  if (sig==='حيادي') return sig;

  // Stochastic filter (إذا مفعّل)
  if (USE_STOCH){
    const K=stoch.K[i], D=stoch.D[i];
    if (sig==='شراء' && !(K>D && K<80)) sig='حيادي';
    if (sig==='بيع'   && !(K<D && K>20)) sig='حيادي';
  }
  // BB filter (إذا مفعّل)
  if (USE_BB && bb){
    const c=series[i].close, mid=bb.mid[i], up=bb.up[i], dn=bb.dn[i];
    if (sig==='شراء' && !(c>=mid && c<=up)) sig='حيادي';
    if (sig==='بيع'  && !(c<=mid && c>=dn)) sig='حيادي';
  }
  // Pivot distance (إذا الفلتر غير مُعطّل)
  if (!elTogglePivotFilter?.checked && pv){
    const c=series[i].close;
    const levels=[pv.P,pv.R1,pv.R2,pv.R3,pv.S1,pv.S2,pv.S3];
    const nearest = levels.reduce((a,b)=> Math.abs(b-c)<Math.abs(a-c)?b:a, levels[0]);
    if (Math.abs(nearest-c) < PIVOT_MIN_DISTANCE) sig='حيادي';
  }
  return sig;
}

/* ---------- MTF confirm (بسيطة) ---------- */
function strongMTFConfirm(rows30, rows60){
  // اتجاه EMA على 30/60 يؤيد
  if (!MTF_CONFIRM) return true;
  if (!rows30 || !rows60) return true;
  const ok30 = rows30.trendOK, ok60 = rows60.trendOK;
  return !!(ok30 && ok60);
}

/* ---------- Auto policy ---------- */
function detectRegime(series, rsiArr, mac, atrArr){
  const i=series.length-1, price=series[i].close;
  const emaF=mac.emaF[i], emaS=mac.emaS[i];
  const macNow=mac.macd[i], macPrev=mac.macd[i-1], macSig=mac.signal[i];
  const atrNow=atrArr?.[i], atrP=atrPct(atrNow, price);

  const emaUp=Number.isFinite(emaF)&&Number.isFinite(emaS)&&emaF>emaS;
  const emaDn=Number.isFinite(emaF)&&Number.isFinite(emaS)&&emaF<emaS;
  const macUp = macNow>0, macDn=macNow<0;
  const macCrossUp = Number.isFinite(macPrev)&&macPrev<=macSig&&macNow>macSig;
  const macCrossDn = Number.isFinite(macPrev)&&macPrev>=macSig&&macNow<macSig;

  let trend='range';
  if ((emaUp&&macUp)||macCrossUp) trend='trend_up';
  if ((emaDn&&macDn)||macCrossDn) trend='trend_down';

  let vol='normal';
  if (Number.isFinite(atrP)){
    if (atrP <= (ATR_MIN_PCT*1.2)) vol='low';
    else if (atrP >= (ATR_MAX_PCT*0.9)) vol='high';
  }
  return {trend, vol, atrP};
}
function applyAutoIndicatorPolicy(regime){
  USE_RSI = true;
  USE_MACD = true;
  USE_EMA_TREND = (regime.trend!=='range');
  USE_STOCH = (regime.trend==='range');
  USE_BB    = (regime.trend==='range');

  if (regime.vol==='high'){
    MTF_CONFIRM = true;
    PIVOT_MIN_DISTANCE = Math.max(PIVOT_MIN_DISTANCE, 1.0);
    ATR_MIN_PCT = Math.max(ATR_MIN_PCT, 0.05);
  }

  if (elUseRSI)  elUseRSI.checked  = USE_RSI;
  if (elUseMACD) elUseMACD.checked = USE_MACD;
  if (elUseEMA)  elUseEMA.checked  = USE_EMA_TREND;
  if (elUseStoch) elUseStoch.checked = USE_STOCH;
  if (elUseBB)    elUseBB.checked    = USE_BB;
}

/* ---------- Signal pipeline ---------- */
function filteredSignal(tf, series, rsiArr, mac, atrArr, rows30, rows60, pv, stoch, bb){
  const i=series.length-1;
  const ctx = rsiMacdCtx(series, rsiArr, mac, i);

  // Manual/Auto: إذا Auto شغّال → طبّق السياسة قبل التصنيف
  if (AUTO_IND){
    const regime = detectRegime(series, rsiArr, mac, atrArr);
    applyAutoIndicatorPolicy(regime);
  }

  // إيقاف كامل: إذا كل الأساسيين مطفّيين → حيادي
  if (!USE_RSI && !USE_MACD && !USE_EMA_TREND) return 'حيادي';

  // ساعات نيويورك
  if (!inNyTradingHours(series[i].ts)) return 'حيادي';

  let sig = decideSignal(ctx);

  // ATR% band
  const ap = atrPct(atrArr?.[i], series[i].close);
  if (Number.isFinite(ap) && (ap<ATR_MIN_PCT || ap>ATR_MAX_PCT)) sig='حيادي';

  // MTF
  const trendOK = (mac.emaF[i]>mac.emaS[i]) ? 'up':'down';
  const rows30Ref = rows30 || {trendOK:true}, rows60Ref = rows60 || {trendOK:true};
  if (sig!=='حيادي' && !strongMTFConfirm(rows30Ref, rows60Ref)) sig='حيادي';

  // Stoch / BB / Pivot
  sig = applyExtraFilters(sig, series, i, stoch, bb, pv);

  return sig;
}

/* ---------- Chart ---------- */
function clearChart(){
  if (!ctxChart) return;
  ctxChart.clearRect(0,0,elChart.width, elChart.height);
  ctxChart.fillStyle='#0b1220'; ctxChart.fillRect(0,0,elChart.width, elChart.height);
}
function drawLine(y, color){
  ctxChart.strokeStyle=color; ctxChart.lineWidth=1.2;
  ctxChart.beginPath(); ctxChart.moveTo(20,y); ctxChart.lineTo(elChart.width-20,y); ctxChart.stroke();
}
function priceToY(price, minP, maxP){
  const p = (price-minP)/(maxP-minP || 1);
  return elChart.height - 20 - p*(elChart.height-40);
}

/* ---------- Main run ---------- */
async function run(){
  loadSettings();

  // load CSV (default if empty)
  const path = (elCsvInput?.value||'').trim() || 'XAUUSD_5min.csv';
  let series = await loadCsv(path);
  if (!series.length){ alert('CSV فارغ'); return; }

  // live price (نستعمل آخر close كميديان)
  const last = series[series.length-1];
  const lp = last.close;
  elLivePrice.textContent = lp.toFixed(2);
  const t = toLocal(last.ts);
  elLiveTime.textContent = `${t.date} • ${t.time}`;

  // compute indicators
  const closes = series.map(s=>s.close);
  const rsiArr = rsi(closes, RSI_PERIOD);
  const mac = macd(closes, EMA_FAST, EMA_SLOW, 9);
  const atrArr = atr(series, ATR_PERIOD);
  const stoch = stochastic(series, STOCH_K, STOCH_D);
  const bb = USE_BB ? bollinger(closes, BB_PERIOD, BB_STD) : null;

  // MTF refs (mini): نعيد استعمال نفس السلسلة مع EMA trend فقط كإشارة
  const rows30 = {trendOK:true}, rows60={trendOK:true}; // تبسيط

  // Pivots
  const pv = dailyPivotsNY(series);
  updatePivotUI(pv);

  // UPDATE chips
  const i=series.length-1;
  elIndRSI.textContent = Number.isFinite(rsiArr[i])? rsiArr[i].toFixed(1):'—';
  elIndMACD.textContent= Number.isFinite(mac.macd[i])? mac.macd[i].toFixed(3):'—';
  elIndEMAF.textContent= Number.isFinite(mac.emaF[i])? mac.emaF[i].toFixed(2):'—';
  elIndEMAS.textContent= Number.isFinite(mac.emaS[i])? mac.emaS[i].toFixed(2):'—';
  elIndStoch.textContent= Number.isFinite(stoch.K[i])&&Number.isFinite(stoch.D[i])? `${stoch.K[i].toFixed(0)}/${stoch.D[i].toFixed(0)}`:'—';
  elIndBB.textContent   = bb && Number.isFinite(bb.mid[i])? bb.mid[i].toFixed(2):'—';

  // SIGNAL
  let sig = filteredSignal(TF, series, rsiArr, mac, atrArr, rows30, rows60, pv, stoch, bb);

  // Summary & draw
  if (!USE_RSI && !USE_MACD && !USE_EMA_TREND){
    elSummaryText.textContent = 'حيادي (كل المؤشرات مطفّاة)';
    elSummaryText.style.color = '#f59e0b';
    clearChart();
  } else {
    elSummaryText.textContent = (sig==='شراء')?'شراء':(sig==='بيع')?'بيع':'حيادي';
    elSummaryText.style.color = (sig==='شراء')?'#10b981':(sig==='بيع')?'#ef4444':'#f59e0b';

    // chart: draw last 120 points range with Entry/SL/TP
    const N = Math.min(series.length, 120);
    const win = series.slice(series.length-N);
    const minP = Math.min(...win.map(s=>s.low)), maxP=Math.max(...win.map(s=>s.high));
    clearChart();

    // price line
    const yLive = priceToY(lp, minP, maxP);
    drawLine(yLive, '#ffffff');

    if (sig!=='حيادي'){
      // Entry as current close
      const entry = lp;
      const atrNow = atrArr[i] || 0;
      const dir = (sig==='شراء')? 1 : -1;
      const sl = entry - dir*SL_MULT*atrNow;
      const tp1= entry + dir*TP1_MULT*atrNow;
      const tp2= entry + dir*TP2_MULT*atrNow;

      drawLine(priceToY(entry,minP,maxP), '#60a5fa');   // blue
      drawLine(priceToY(sl,minP,maxP),    '#ef4444');   // red
      drawLine(priceToY(tp1,minP,maxP),   '#10b981');   // green
      drawLine(priceToY(tp2,minP,maxP),   '#10b981');   // green
    }
  }

  // rows table: آخر 20 شمعات
  if (elRowsBody){
    elRowsBody.innerHTML='';
    const M=20, from=Math.max(0, series.length-M);
    for (let k=from;k<series.length;k++){
      const s=series[k], tm=toLocal(s.ts);
      const tr=document.createElement('tr');
      const ctx=rsiMacdCtx(series, rsiArr, mac, k);
      let rowSig='—';
      if (k>0){
        let rSig = decideSignal(ctx);
        const ap = atrPct(atrArr?.[k], series[k].close);
        if (Number.isFinite(ap) && (ap<ATR_MIN_PCT || ap>ATR_MAX_PCT)) rSig='حيادي';
        if (!inNyTradingHours(series[k].ts)) rSig='حيادي';
        rowSig=rSig;
      }
      tr.innerHTML = `<td>${tm.date}</td><td>${tm.time}</td><td>${s.close.toFixed(2)}</td>
                      <td>${rowSig}</td><td>${Number.isFinite(rsiArr[k])?rsiArr[k].toFixed(1):'—'}</td>
                      <td>${Number.isFinite(mac.macd[k])?mac.macd[k].toFixed(3):'—'}</td>
                      <td>${Number.isFinite(mac.emaF[k])?mac.emaF[k].toFixed(2):'—'}</td>`;
      elRowsBody.appendChild(tr);
    }
  }

  // alert near entry
  if (elAlertEnable?.checked && sig!=='حيادي'){
    const dist = Math.max(num(elAlertDistance,0.5), 0.25*(atrArr[i]||0));
    // لو في إشعار/صوت… (مكان التفعيل لاحقًا)
    console.log('Proximity alert armed at ±', dist);
  }
}

/* ---------- Events ---------- */
[elTf5, elTf30, elTf60, elTfD].forEach(btn=>{
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    [elTf5, elTf30, elTf60, elTfD].forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    TF = (btn===elTf5)?5:(btn===elTf30)?30:(btn===elTf60)?60:1440;
    run();
  });
});
if(elPro) elPro.addEventListener('change', run);
if(elMtf) elMtf.addEventListener('change', ()=>{ MTF_CONFIRM=!!elMtf.checked; run(); });

[elUseRSI, elUseMACD, elUseEMA, elUseStoch, elUseBB, elAutoInd,
 elToggleNyHours, elTogglePivotFilter].forEach(el=>{
  if(!el) return;
  el.addEventListener('change', run);
});

[elEmaF, elEmaS, elRSIP, elATRP, elSL, elTP1, elTP2, elAtrMin, elAtrMax, elAcct, elRisk,
 elStochK, elStochD, elBBPeriod, elBBStd, elAlertEnable, elAlertDistance].forEach(el=>{
  if(!el) return;
  el.addEventListener('change', run);
});

if (elRun) elRun.addEventListener('click', run);

/* ---------- Boot ---------- */
window.addEventListener('load', ()=>{
  // افتراض إطار 5د
  elTf5?.classList.add('active');
  run().catch(e=>{ console.error(e); alert('حدث خطأ أثناء التحليل'); });
});
